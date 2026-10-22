"""Transactional domain operations. Caller owns one AsyncSession/transaction."""
import hashlib
import json
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from crednexus_ml.contracts import ScoreRequest
from .contracts import ProductDefinition
from .models import ApplicationRecord, EventRecord, JobRecord, ProductRecord, ProfileRecord


def fingerprint(data: dict) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


async def require(session, model, identifier, lock=False):
    statement = select(model).where(model.code == identifier) if model is ProductRecord else select(model).where(model.id == identifier)
    if lock:
        statement = statement.with_for_update()
    record = await session.scalar(statement)
    if record is None:
        raise HTTPException(404, detail="Record not found")
    return record


async def owned_profile(session, company_id: UUID, profile_id: UUID):
    profile = await require(session, ProfileRecord, profile_id)
    if profile.company_id != company_id:
        raise HTTPException(422, detail="Profile belongs to another company")
    return profile


def event(session, application, details):
    session.add(EventRecord(application_id=application.id, status=application.status, details=details))


async def enqueue(session, *, company_id, kind, payload, scope, key, max_attempts, application_id=None):
    digest = fingerprint(payload)
    job_id = uuid4()
    statement = insert(JobRecord).values(
        id=job_id, company_id=company_id, application_id=application_id, kind=kind,
        scope=scope, idempotency_key=key, request_hash=digest, payload=payload, max_attempts=max_attempts,
    ).on_conflict_do_nothing(constraint="uq_job_idempotency").returning(JobRecord.id)
    created = await session.scalar(statement)
    if created is not None:
        return await require(session, JobRecord, created)
    existing = await session.scalar(select(JobRecord).where(JobRecord.scope == scope, JobRecord.idempotency_key == key))
    if existing.request_hash != digest:
        raise HTTPException(409, detail="Idempotency-Key already used with different input")
    return existing


async def submit_application(session, application: ApplicationRecord, max_attempts: int):
    if application.status not in ("DRAFT", "NEEDS_INFO", "FAILED"):
        # Repeated submission observes the existing run, never creates a second job.
        return application
    if application.profile_id is None:
        if application.status != "NEEDS_INFO":
            application.status = "NEEDS_INFO"
            event(session, application, {"code": "PROFILE_REQUIRED", "message": "Добавьте финансовый профиль компании"})
        return application
    profile = await owned_profile(session, application.company_id, application.profile_id)
    missing_fields = [field for field in ("financial_snapshot", "bureau_history") if profile.data.get(field) is None]
    if missing_fields:
        if application.status != "NEEDS_INFO":
            application.status = "NEEDS_INFO"
            event(session, application, {"code": "CREDIT_DATA_REQUIRED", "fields": missing_fields,
                                         "message": "Дополните профиль данными для кредитного скоринга"})
        return application
    product_record = await require(session, ProductRecord, application.product_code)
    product = ProductDefinition.model_validate(product_record.data)
    parameters = application.parameters | {"annual_rate": product.annual_rate, "product_limit": product.max_amount}
    scoring = ScoreRequest.model_validate(profile.data | {"application": parameters})
    payload = {"score_request": scoring.model_dump(mode="json"), "product": product.model_dump(mode="json"),
               "profile_id": str(profile.id), "profile_hash": profile.content_hash}
    job = await enqueue(session, company_id=application.company_id, kind="ASSESS_APPLICATION", payload=payload,
                        scope=f"application:{application.id}", key=str(uuid4()), max_attempts=max_attempts,
                        application_id=application.id)
    application.latest_job_id = job.id
    application.status = "SUBMITTED"
    event(session, application, {"job_id": str(job.id), "profile_id": str(profile.id), "policy_version": product.policy_version})
    await session.flush()
    return application
