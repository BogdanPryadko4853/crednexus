"""Integration checks require an isolated migrated PostgreSQL database ending in _test."""
import asyncio
import json
import os
import threading
from pathlib import Path
import unittest
from unittest.mock import patch
from uuid import UUID

import httpx
from sqlalchemy import func, select, text, update
from sqlalchemy.engine import make_url

from crednexus_backend.api import create_app
from crednexus_backend.config import Settings
from crednexus_backend.models import DecisionRecord, JobRecord, ProfileRecord
from crednexus_backend.worker import Worker
from crednexus_ml.api import DEFAULT_MODELS, ModelBundle

URL = os.environ.get("CREDNEXUS_TEST_DATABASE_URL")
EXAMPLES = Path(__file__).resolve().parents[1] / "examples"
KEY = "test-internal-api-key-12345"


@unittest.skipUnless(URL, "Set CREDNEXUS_TEST_DATABASE_URL to a migrated isolated PostgreSQL database")
class BackendIntegrationTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        if not make_url(URL).database.endswith("_test"):
            raise RuntimeError("Integration tests require a database name ending in _test")
        cls.bundle = ModelBundle(DEFAULT_MODELS, 1)

    async def asyncSetUp(self):
        self.settings = Settings(URL, KEY)
        self.app = create_app(self.settings)
        self.lifecycle = self.app.router.lifespan_context(self.app)
        await self.lifecycle.__aenter__()
        self.db = self.app.state.db
        async with self.db.sessions.begin() as session:
            await session.execute(text("TRUNCATE companies, company_profiles, credit_applications, ml_jobs, application_events, credit_decisions CASCADE"))
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://backend", headers={"X-API-Key": KEY})
        self.worker = Worker(self.db, self.bundle, self.settings)

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.lifecycle.__aexit__(None, None, None)

    async def company(self, name="Синтетический магазин"):
        response = await self.client.post("/api/v1/companies", json={"name": name})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    async def profile(self, company_id, mutate=None):
        payload = json.loads((EXAMPLES / "score_request.json").read_text())
        payload.pop("application")
        if mutate:
            mutate(payload)
        response = await self.client.post(f"/api/v1/companies/{company_id}/profiles", json=payload)
        self.assertIn(response.status_code, (200, 201), response.text)
        return response.json()

    async def application(self, company_id, profile_id=None, amount=1_000_000.):
        response = await self.client.post("/api/v1/applications", json={
            "company_id": company_id, "profile_id": profile_id, "product_code": "working-capital",
            "requested_amount": amount, "term_months": 12, "purpose": "working_capital",
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    async def forecast(self, company_id, profile_id, key="forecast-key", horizons=None):
        response = await self.client.post(f"/api/v1/companies/{company_id}/forecasts", json={
            "profile_id": profile_id, "horizons": horizons or [1, 2, 3],
        }, headers={"Idempotency-Key": key})
        self.assertEqual(response.status_code, 202, response.text)
        return response.json()

    async def test_authentication_validation_and_readiness(self):
        response = await self.client.get("/api/v1/products", headers={"X-API-Key": "wrong"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual((await self.client.get("/health/ready")).status_code, 200)
        self.assertEqual((await self.client.post("/api/v1/companies", json={"name": "   "})).status_code, 422)
        self.assertEqual((await self.client.get("/api/v1/companies?limit=101")).status_code, 422)
        schema = (await self.client.get("/openapi.json")).json()
        self.assertIn("/api/v1/jobs/{job_id}", schema["paths"])

    async def test_profile_deduplication_and_company_ownership(self):
        company_id = await self.company()
        profile = await self.profile(company_id)
        duplicate = await self.profile(company_id, lambda p: p["history"].reverse())
        self.assertEqual(profile["id"], duplicate["id"])
        other = await self.company("Другая компания")
        response = await self.client.post("/api/v1/applications", json={
            "company_id": other, "profile_id": profile["id"], "product_code": "working-capital",
            "requested_amount": 1_000_000., "term_months": 12, "purpose": "working_capital",
        })
        self.assertEqual(response.status_code, 422)
        async with self.db.sessions() as session:
            self.assertEqual(await session.scalar(select(func.count()).select_from(ProfileRecord)), 1)

    async def test_needs_info_then_submission_and_real_decision(self):
        company_id = await self.company()
        application = await self.application(company_id)
        identifier = application["id"]
        missing = await self.client.post(f"/api/v1/applications/{identifier}/submit")
        self.assertEqual(missing.json()["status"], "NEEDS_INFO", missing.text)
        self.assertIsNone(missing.json()["latest_job_id"])
        profile = await self.profile(company_id)
        updated = await self.client.put(f"/api/v1/applications/{identifier}", json=application["parameters"] | {"profile_id": profile["id"]})
        self.assertEqual(updated.status_code, 200, updated.text)
        submitted = await self.client.post(f"/api/v1/applications/{identifier}/submit")
        self.assertEqual(submitted.status_code, 202, submitted.text)
        self.assertEqual(submitted.json()["status"], "SUBMITTED")
        job_id = submitted.json()["latest_job_id"]
        repeated = await self.client.post(f"/api/v1/applications/{identifier}/submit")
        self.assertEqual(repeated.json()["latest_job_id"], job_id)
        frozen = await self.worker.claim()
        self.assertEqual((await self.client.get(f"/api/v1/applications/{identifier}")).json()["status"], "SCORING")
        # Financial updates create another profile; the submitted input remains unchanged.
        await self.profile(company_id, lambda p: p["history"][-1].update(cash_inflow=1.))
        self.assertEqual(frozen.payload["profile_id"], profile["id"])
        result = await asyncio.to_thread(self.worker.evaluate, frozen)
        self.assertTrue(await self.worker.finish(frozen, result=result))
        job = (await self.client.get(f"/api/v1/jobs/{job_id}")).json()
        self.assertEqual(job["status"], "SUCCEEDED")
        self.assertIn("onnx-sha256:", job["result"]["score"]["model_version"])
        final = (await self.client.get(f"/api/v1/applications/{identifier}")).json()
        self.assertEqual(final["status"], "APPROVED")
        decision = (await self.client.get(f"/api/v1/applications/{identifier}/decision")).json()
        self.assertEqual(decision["policy_version"], "demo-credit-v1")
        statuses = [row["status"] for row in (await self.client.get(f"/api/v1/applications/{identifier}/events")).json()]
        self.assertIn("NEEDS_INFO", statuses)
        self.assertEqual(statuses[-1], "APPROVED")
        self.assertEqual((await self.client.put(f"/api/v1/applications/{identifier}", json=application["parameters"])).status_code, 409)
        self.assertEqual((await self.client.post(f"/api/v1/applications/{identifier}/submit")).json()["latest_job_id"], job_id)

    async def test_counter_offer_requires_new_scoring_after_acceptance(self):
        company_id = await self.company()
        profile = await self.profile(company_id)
        application = await self.application(company_id, profile["id"], amount=4_000_000.)
        identifier = application["id"]
        submitted = (await self.client.post(f"/api/v1/applications/{identifier}/submit")).json()
        await self.worker.run_once()
        decision = (await self.client.get(f"/api/v1/applications/{identifier}/decision")).json()
        self.assertEqual(decision["status"], "COUNTER_OFFER")
        self.assertEqual(decision["offered_conditions"]["requested_amount"], 3_000_000.)
        accepted = await self.client.post(f"/api/v1/applications/{identifier}/accept-counter-offer")
        self.assertEqual(accepted.status_code, 202, accepted.text)
        self.assertNotEqual(accepted.json()["latest_job_id"], submitted["latest_job_id"])
        await self.worker.run_once()
        revised = (await self.client.get(f"/api/v1/applications/{identifier}/decision")).json()
        self.assertEqual(revised["risk_evaluated_amount"], 3_000_000.)
        self.assertEqual(revised["status"], "APPROVED")
        async with self.db.sessions() as session:
            self.assertEqual(await session.scalar(select(func.count()).select_from(DecisionRecord)), 2)

    async def test_concurrent_submission_and_job_idempotency(self):
        company_id = await self.company()
        profile = await self.profile(company_id)
        application = await self.application(company_id, profile["id"])
        results = await asyncio.gather(*[self.client.post(f"/api/v1/applications/{application['id']}/submit") for _ in range(5)])
        self.assertTrue(all(response.status_code == 202 for response in results), [response.text for response in results])
        self.assertEqual(len({response.json()["latest_job_id"] for response in results}), 1)
        jobs = await asyncio.gather(*[self.forecast(company_id, profile["id"]) for _ in range(5)])
        self.assertEqual(len({job["id"] for job in jobs}), 1)
        conflict = await self.client.post(f"/api/v1/companies/{company_id}/forecasts", json={"profile_id": profile["id"], "horizons": [1]}, headers={"Idempotency-Key": "forecast-key"})
        self.assertEqual(conflict.status_code, 409)

    async def test_forecast_and_cash_gap_are_persisted(self):
        company_id = await self.company()
        profile = await self.profile(company_id)
        forecast = await self.forecast(company_id, profile["id"])
        plan = json.loads((EXAMPLES / "cash_gap_request.json").read_text())
        payload = {key: plan[key] for key in ("months", "minimum_cash_reserve", "cash_plan")}
        response = await self.client.post(f"/api/v1/companies/{company_id}/cash-gaps", json=payload | {"profile_id": profile["id"]}, headers={"Idempotency-Key": "gap-key"})
        self.assertEqual(response.status_code, 202, response.text)
        gap_id = response.json()["id"]
        payload["cash_plan"].reverse()
        replay = await self.client.post(f"/api/v1/companies/{company_id}/cash-gaps", json=payload | {"profile_id": profile["id"]}, headers={"Idempotency-Key": "gap-key"})
        self.assertEqual(replay.json()["id"], gap_id)
        await self.worker.run_once()
        await self.worker.run_once()
        for job_id in (forecast["id"], gap_id):
            saved = (await self.client.get(f"/api/v1/jobs/{job_id}")).json()
            self.assertEqual(saved["status"], "SUCCEEDED")
            self.assertTrue(saved["result"]["warnings"])
        gap = (await self.client.get(f"/api/v1/jobs/{gap_id}")).json()["result"]
        self.assertEqual(gap["base"]["first_cash_gap_month"], "2026-10-01")
        self.assertEqual(len(gap["base"]["months"]), 3)

    async def test_cash_gap_rejects_unknown_opening_balance(self):
        company_id = await self.company()
        profile = await self.profile(company_id, lambda p: p["history"][-1].update(cash_balance=None))
        plan = json.loads((EXAMPLES / "cash_gap_request.json").read_text())
        response = await self.client.post(f"/api/v1/companies/{company_id}/cash-gaps", json={
            "profile_id": profile["id"], "cash_plan": plan["cash_plan"],
        }, headers={"Idempotency-Key": "missing-balance"})
        self.assertEqual(response.status_code, 422, response.text)
        async with self.db.sessions() as session:
            self.assertEqual(await session.scalar(select(func.count()).select_from(JobRecord)), 0)

    async def test_forecast_without_bureau_and_needs_info_for_credit(self):
        company_id = await self.company()
        def remove_credit_blocks(payload):
            payload.pop("financial_snapshot")
            payload.pop("bureau_history")
        profile = await self.profile(company_id, remove_credit_blocks)
        queued = await self.forecast(company_id, profile["id"])
        await self.worker.run_once()
        self.assertEqual((await self.client.get(f"/api/v1/jobs/{queued['id']}")).json()["status"], "SUCCEEDED")
        application = await self.application(company_id, profile["id"])
        response = await self.client.post(f"/api/v1/applications/{application['id']}/submit")
        self.assertEqual(response.json()["status"], "NEEDS_INFO")
        self.assertIsNone(response.json()["latest_job_id"])
        events = (await self.client.get(f"/api/v1/applications/{application['id']}/events")).json()
        self.assertEqual(events[-1]["details"]["fields"], ["financial_snapshot", "bureau_history"])
        complete = await self.profile(company_id)
        await self.client.put(f"/api/v1/applications/{application['id']}", json=application["parameters"] | {"profile_id": complete["id"]})
        self.assertEqual((await self.client.post(f"/api/v1/applications/{application['id']}/submit")).status_code, 202)

    async def test_lease_expiry_and_stale_completion(self):
        company_id = await self.company()
        profile = await self.profile(company_id)
        await self.forecast(company_id, profile["id"])
        first = await self.worker.claim()
        self.assertIsNotNone(first)
        self.assertIsNone(await self.worker.claim())
        async with self.db.sessions.begin() as session:
            await session.execute(update(JobRecord).where(JobRecord.id == first.id).values(lease_until=func.now() - text("interval '1 second'")))
        second = await self.worker.claim()
        self.assertEqual(first.id, second.id)
        self.assertNotEqual(first.lease_token, second.lease_token)
        self.assertFalse(await self.worker.finish(first, result={"stale": True}))
        self.assertTrue(await self.worker.finish(second, result={"current": True}))
        saved = (await self.client.get(f"/api/v1/jobs/{first.id}")).json()
        self.assertEqual(saved["result"], {"current": True})
        self.assertEqual(saved["attempts"], 2)

    async def test_parallel_workers_claim_distinct_jobs(self):
        company_id = await self.company()
        profile = await self.profile(company_id)
        await self.forecast(company_id, profile["id"], key="one")
        await self.forecast(company_id, profile["id"], key="two")
        one, two = await asyncio.gather(self.worker.claim(), self.worker.claim())
        self.assertNotEqual(one.id, two.id)

    async def test_inference_does_not_block_event_loop(self):
        company_id = await self.company()
        profile = await self.profile(company_id)
        await self.forecast(company_id, profile["id"])
        started, release = threading.Event(), threading.Event()
        evaluate = self.worker.evaluate
        def slow(job):
            started.set()
            release.wait(timeout=2)
            return evaluate(job)
        with patch.object(self.worker, "evaluate", side_effect=slow):
            task = asyncio.create_task(self.worker.run_once())
            try:
                await asyncio.sleep(.1)
                self.assertTrue(started.is_set())
                self.assertFalse(task.done())
                self.assertEqual((await self.client.get("/health/live")).status_code, 200)
            finally:
                release.set()
                await task

    async def test_invalid_job_input_is_not_retried(self):
        company_id = await self.company()
        profile = await self.profile(company_id)
        queued = await self.forecast(company_id, profile["id"])
        with patch.object(self.worker, "evaluate", side_effect=ValueError("invalid input")):
            await self.worker.run_once()
        job = (await self.client.get(f"/api/v1/jobs/{queued['id']}")).json()
        self.assertEqual(job["status"], "FAILED")
        self.assertEqual(job["error_code"], "INVALID_JOB_INPUT")
        self.assertEqual(job["attempts"], 1)

    async def test_last_expired_lease_exhausts_job(self):
        company_id = await self.company()
        profile = await self.profile(company_id)
        queued = await self.forecast(company_id, profile["id"])
        claimed = await self.worker.claim()
        async with self.db.sessions.begin() as session:
            await session.execute(update(JobRecord).where(JobRecord.id == claimed.id).values(
                attempts=3, lease_until=func.now() - text("interval '1 second'")))
        self.assertIsNone(await self.worker.claim())
        job = (await self.client.get(f"/api/v1/jobs/{queued['id']}")).json()
        self.assertEqual(job["status"], "FAILED")
        self.assertEqual(job["error_code"], "LEASE_EXPIRED")

    async def test_retries_exhaust_and_application_can_be_resubmitted(self):
        company_id = await self.company()
        profile = await self.profile(company_id)
        application = await self.application(company_id, profile["id"])
        submitted = (await self.client.post(f"/api/v1/applications/{application['id']}/submit")).json()
        for attempt in range(3):
            with patch.object(self.worker, "evaluate", side_effect=RuntimeError("simulated failure")):
                self.assertTrue(await self.worker.run_once())
            async with self.db.sessions.begin() as session:
                await session.execute(update(JobRecord).where(JobRecord.id == UUID(submitted["latest_job_id"])).values(available_at=func.now()))
        job = (await self.client.get(f"/api/v1/jobs/{submitted['latest_job_id']}")).json()
        self.assertEqual(job["status"], "FAILED")
        self.assertEqual(job["attempts"], 3)
        self.assertNotIn("simulated", json.dumps(job))
        retry = (await self.client.post(f"/api/v1/applications/{application['id']}/submit")).json()
        self.assertNotEqual(retry["latest_job_id"], job["id"])
        await self.worker.run_once()
        self.assertEqual((await self.client.get(f"/api/v1/applications/{application['id']}")).json()["status"], "APPROVED")


if __name__ == "__main__":
    unittest.main()
