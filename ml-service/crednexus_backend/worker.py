"""Durable PostgreSQL queue: short transactions, renewable leases, fenced completion."""
import asyncio
from contextlib import suppress
from datetime import timedelta
import logging
import os
from pathlib import Path
import signal
from uuid import uuid4

from pydantic import ValidationError
from sqlalchemy import and_, func, or_, select, update

from crednexus_ml.api import DEFAULT_MODELS, ModelBundle
from crednexus_ml.contracts import CashGapRequest, ForecastRequest, ScoreRequest
from crednexus_ml.service import predict_cash_gap, predict_forecast, predict_score
from .config import Settings
from .contracts import ProductDefinition
from .db import Database
from .models import ApplicationRecord, DecisionRecord, JobRecord
from .operations import event
from .policy import decide
from .readiness import check_database
from crednexus_ml.healthcheck import WORKER_HEALTH_FILE, remove_worker_health, write_worker_health

logger = logging.getLogger(__name__)


class Worker:
    def __init__(self, database: Database, bundle: ModelBundle, settings: Settings):
        self.db, self.bundle, self.settings = database, bundle, settings
        self.healthy = True

    async def _application_status(self, session, job, status, details):
        if job.application_id is None:
            return
        application = await session.scalar(select(ApplicationRecord).where(ApplicationRecord.id == job.application_id).with_for_update())
        if application.latest_job_id == job.id:
            application.status = status
            event(session, application, {"job_id": str(job.id)} | details)

    async def claim(self):
        async with self.db.sessions.begin() as session:
            while True:
                job = await session.scalar(select(JobRecord).where(or_(
                    and_(JobRecord.status == "QUEUED", JobRecord.available_at <= func.now()),
                    and_(JobRecord.status == "RUNNING", JobRecord.lease_until < func.now()),
                )).order_by(JobRecord.created_at, JobRecord.id).with_for_update(skip_locked=True).limit(1))
                if job is None:
                    return None
                if job.attempts >= job.max_attempts:
                    job.status, job.error_code = "FAILED", "LEASE_EXPIRED"
                    job.finished_at = func.now()
                    job.lease_token, job.lease_until = None, None
                    await self._application_status(session, job, "FAILED", {"code": "LEASE_EXPIRED"})
                    await session.flush()
                    continue
                now = await session.scalar(select(func.now()))
                job.status = "RUNNING"
                job.attempts += 1
                job.lease_token = uuid4()
                job.lease_until = now + timedelta(seconds=self.settings.job_lease_seconds)
                job.error_code = None
                await self._application_status(session, job, "SCORING", {"attempt": job.attempts})
                await session.flush()
                return job

    async def heartbeat(self, job):
        while True:
            await asyncio.sleep(self.settings.job_lease_seconds / 3)
            async with self.db.sessions.begin() as session:
                now = await session.scalar(select(func.now()))
                result = await session.execute(update(JobRecord).where(
                    JobRecord.id == job.id, JobRecord.status == "RUNNING", JobRecord.lease_token == job.lease_token,
                    JobRecord.lease_until > func.now(),
                ).values(lease_until=now + timedelta(seconds=self.settings.job_lease_seconds)))
                if result.rowcount != 1:
                    return

    def evaluate(self, job):
        if job.kind == "ASSESS_APPLICATION":
            payload = ScoreRequest.model_validate(job.payload["score_request"])
            product = ProductDefinition.model_validate(job.payload["product"])
            score = predict_score(self.bundle, payload)
            decision = decide(payload, score, product)
            return {"score": score.model_dump(mode="json"), "decision": decision.model_dump(mode="json"),
                    "profile_id": job.payload["profile_id"], "profile_hash": job.payload["profile_hash"]}
        if job.kind == "FORECAST":
            return predict_forecast(self.bundle, ForecastRequest.model_validate(job.payload["request"])).model_dump(mode="json")
        if job.kind == "CASH_GAP":
            return predict_cash_gap(self.bundle, CashGapRequest.model_validate(job.payload["request"])).model_dump(mode="json")
        raise ValueError("Unknown job kind")

    async def finish(self, claimed, result=None, error_code=None, permanent=False):
        async with self.db.sessions.begin() as session:
            job = await session.scalar(select(JobRecord).where(JobRecord.id == claimed.id).with_for_update())
            now = await session.scalar(select(func.now()))
            # A timed-out/replaced worker cannot overwrite a newer attempt's result.
            if job.status != "RUNNING" or job.lease_token != claimed.lease_token or job.lease_until <= now:
                return False
            job.lease_until, job.lease_token = None, None
            if error_code:
                job.error_code = error_code
                if permanent or job.attempts >= job.max_attempts:
                    job.status, job.finished_at = "FAILED", now
                    await self._application_status(session, job, "FAILED", {"code": error_code})
                else:
                    job.status = "QUEUED"
                    job.available_at = now + timedelta(seconds=min(60, 2 ** job.attempts))
                    await self._application_status(session, job, "SUBMITTED", {"code": "RETRY_SCHEDULED"})
            else:
                job.status, job.result, job.finished_at = "SUCCEEDED", result, now
                job.error_code = None
                if job.kind == "ASSESS_APPLICATION":
                    session.add(DecisionRecord(application_id=job.application_id, job_id=job.id, data=result["decision"]))
                    await self._application_status(session, job, result["decision"]["status"], {
                        "policy_version": result["decision"]["policy_version"],
                        "reason_codes": [reason["code"] for reason in result["decision"]["reasons"]],
                    })
            return True

    async def run_once(self):
        job = await self.claim()
        self.healthy = True
        if job is None:
            return False
        heartbeat = asyncio.create_task(self.heartbeat(job))
        try:
            # ONNX, pandas and policy arithmetic never run on the asyncio event loop.
            try:
                result = await asyncio.to_thread(self.evaluate, job)
            except (ValidationError, ValueError):
                await self.finish(job, error_code="INVALID_JOB_INPUT", permanent=True)
            except Exception as exc:
                logger.error("Job %s failed (%s)", job.id, type(exc).__name__)
                await self.finish(job, error_code="INFERENCE_FAILED")
            else:
                await self.finish(job, result=result)
        finally:
            heartbeat.cancel()
            with suppress(asyncio.CancelledError):
                await heartbeat
        return True

    async def health_pulse(self, path: Path, stopping: asyncio.Event):
        while not stopping.is_set():
            ready = False
            try:
                await check_database(self.db)
                ready = self.healthy
            except Exception as exc:
                logger.warning("Worker readiness failed (%s)", type(exc).__name__)
            write_worker_health(path, ready=ready, runtime=self.bundle.runtime.as_dict())
            with suppress(TimeoutError):
                await asyncio.wait_for(stopping.wait(), timeout=5)


async def main():
    configured = Settings.from_env()
    database = Database(configured.database_url)
    root = Path(os.environ.get("CREDNEXUS_MODELS_DIR", DEFAULT_MODELS))
    threads = int(os.environ.get("CREDNEXUS_MODEL_THREADS", "4"))
    if not 1 <= threads <= 64:
        raise ValueError("CREDNEXUS_MODEL_THREADS must be between 1 and 64")
    health_file = Path(os.environ.get("CREDNEXUS_WORKER_HEALTH_FILE", WORKER_HEALTH_FILE))
    remove_worker_health(health_file)
    stopping = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(signum, stopping.set)
    pulse = None
    try:
        bundle = await asyncio.to_thread(ModelBundle, root, threads)
        await check_database(database)
        logger.info("Models ready: device=%s provider=%s fallback=%s", bundle.runtime.device,
                    bundle.runtime.provider, bundle.runtime.fallback_reason)
        worker = Worker(database, bundle, configured)
        pulse = asyncio.create_task(worker.health_pulse(health_file, stopping))
        while not stopping.is_set():
            if pulse.done():
                await pulse
                raise RuntimeError("Worker health pulse stopped unexpectedly")
            try:
                processed = await worker.run_once()
            except Exception as exc:
                worker.healthy = False
                logger.error("Worker iteration failed (%s)", type(exc).__name__)
                processed = False
            if not processed:
                with suppress(TimeoutError):
                    await asyncio.wait_for(stopping.wait(), timeout=configured.poll_seconds)
    finally:
        stopping.set()
        if pulse is not None:
            pulse.cancel()
            await asyncio.gather(pulse, return_exceptions=True)
        remove_worker_health(health_file)
        await database.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
