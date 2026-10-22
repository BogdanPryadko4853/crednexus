"""Internal business API. CPU inference is executed by the separate durable worker."""
from contextlib import asynccontextmanager
import secrets
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from crednexus_ml.contracts import CashGapRequest, ForecastRequest
from .config import Settings
from .contracts import (
    ApplicationCreate, ApplicationUpdate, ApplicationView, CashGapJobCreate, CompanyCreate, CompanyView,
    CreditDecision, EventView, ForecastJobCreate, JobView, ProductDefinition, ProfileCreate, ProfileView,
)
from .db import Database
from .models import ApplicationRecord, CompanyRecord, DecisionRecord, EventRecord, JobRecord, ProductRecord, ProfileRecord
from .operations import enqueue, event, fingerprint, owned_profile, require, submit_application
from .readiness import check_database


def create_app(settings: Settings | None = None):
    @asynccontextmanager
    async def lifespan(application):
        configured = settings or Settings.from_env()
        application.state.settings = configured
        application.state.db = Database(configured.database_url)
        try:
            yield
        finally:
            await application.state.db.close()

    application = FastAPI(title="CredNexus backend", version="1.1.0", lifespan=lifespan)

    async def authenticate(request: Request, api_key: Annotated[str | None, Header(alias="X-API-Key")] = None):
        if api_key is None or not secrets.compare_digest(api_key.encode(), request.app.state.settings.api_key.encode()):
            raise HTTPException(401, detail="Invalid API key")

    async def session(request: Request):
        async with request.app.state.db.sessions.begin() as active:
            yield active

    # Commit/rollback before sending a response, and never share a session across requests.
    Session = Annotated[AsyncSession, Depends(session, scope="function")]
    Page = Annotated[int, Query(ge=1, le=100)]
    Offset = Annotated[int, Query(ge=0)]
    Key = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]
    router = APIRouter(prefix="/api/v1", dependencies=[Depends(authenticate)])

    @application.exception_handler(RequestValidationError)
    async def invalid_request(_request, exc):
        return JSONResponse(status_code=422, content={"code": "VALIDATION_ERROR", "errors": [
            {"location": list(error["loc"]), "message": error["msg"], "type": error["type"]} for error in exc.errors()
        ]})

    @application.exception_handler(SQLAlchemyError)
    async def database_failure(_request, _exc):
        return JSONResponse(status_code=503, content={"code": "DATABASE_UNAVAILABLE", "message": "Database operation could not be completed"})

    @application.get("/health/live")
    async def live():
        return {"status": "alive"}

    @application.get("/health/ready")
    async def ready(request: Request):
        try:
            revision = await check_database(request.app.state.db)
        except Exception:
            raise HTTPException(503, detail="Database is not ready") from None
        return {"status": "ready", "database_revision": revision}

    @router.post("/companies", response_model=CompanyView, status_code=201)
    async def create_company(payload: CompanyCreate, db: Session):
        record = CompanyRecord(name=payload.name.strip())
        db.add(record)
        await db.flush()
        return record

    @router.get("/companies", response_model=list[CompanyView])
    async def companies(db: Session, limit: Page = 50, offset: Offset = 0):
        return (await db.scalars(select(CompanyRecord).order_by(CompanyRecord.created_at, CompanyRecord.id).limit(limit).offset(offset))).all()

    @router.get("/companies/{company_id}", response_model=CompanyView)
    async def company(company_id: UUID, db: Session):
        return await require(db, CompanyRecord, company_id)

    @router.post("/companies/{company_id}/profiles", response_model=ProfileView, status_code=201)
    async def create_profile(company_id: UUID, payload: ProfileCreate, db: Session, response: Response):
        await require(db, CompanyRecord, company_id)
        data = payload.model_dump(mode="json")
        for field in ("history", "bureau_history"):
            if data[field] is not None:
                data[field].sort(key=lambda row: row["month"])
        digest = fingerprint(data)
        record_id = await db.scalar(insert(ProfileRecord).values(
            id=uuid4(), company_id=company_id, as_of_month=payload.as_of_month, data=data, content_hash=digest,
        ).on_conflict_do_nothing(constraint="uq_profile_content").returning(ProfileRecord.id))
        if record_id is None:
            response.status_code = 200
            return await db.scalar(select(ProfileRecord).where(ProfileRecord.company_id == company_id, ProfileRecord.content_hash == digest))
        return await require(db, ProfileRecord, record_id)

    @router.get("/companies/{company_id}/profiles", response_model=list[ProfileView])
    async def profiles(company_id: UUID, db: Session, limit: Page = 50, offset: Offset = 0):
        await require(db, CompanyRecord, company_id)
        return (await db.scalars(select(ProfileRecord).where(ProfileRecord.company_id == company_id).order_by(ProfileRecord.created_at.desc(), ProfileRecord.id).limit(limit).offset(offset))).all()

    @router.get("/companies/{company_id}/profiles/{profile_id}", response_model=ProfileView)
    async def profile(company_id: UUID, profile_id: UUID, db: Session):
        return await owned_profile(db, company_id, profile_id)

    @router.get("/products", response_model=list[ProductDefinition])
    async def products(db: Session):
        return [record.data for record in (await db.scalars(select(ProductRecord).order_by(ProductRecord.code))).all()]

    @router.post("/applications", response_model=ApplicationView, status_code=201)
    async def create_application(payload: ApplicationCreate, db: Session):
        await require(db, CompanyRecord, payload.company_id)
        await require(db, ProductRecord, payload.product_code)
        if payload.profile_id:
            await owned_profile(db, payload.company_id, payload.profile_id)
        record = ApplicationRecord(company_id=payload.company_id, product_code=payload.product_code, profile_id=payload.profile_id,
                                   parameters=payload.model_dump(mode="json", include={"requested_amount", "term_months", "purpose"}))
        db.add(record)
        await db.flush()
        event(db, record, {"code": "APPLICATION_CREATED"})
        return record

    @router.get("/applications", response_model=list[ApplicationView])
    async def applications(db: Session, company_id: UUID | None = None, limit: Page = 50, offset: Offset = 0):
        query = select(ApplicationRecord)
        if company_id:
            query = query.where(ApplicationRecord.company_id == company_id)
        return (await db.scalars(query.order_by(ApplicationRecord.created_at.desc(), ApplicationRecord.id).limit(limit).offset(offset))).all()

    @router.get("/applications/{application_id}", response_model=ApplicationView)
    async def get_application(application_id: UUID, db: Session):
        return await require(db, ApplicationRecord, application_id)

    @router.put("/applications/{application_id}", response_model=ApplicationView)
    async def update_application(application_id: UUID, payload: ApplicationUpdate, db: Session):
        record = await require(db, ApplicationRecord, application_id, lock=True)
        if record.status not in ("DRAFT", "NEEDS_INFO"):
            raise HTTPException(409, detail="Application can only be edited in DRAFT or NEEDS_INFO")
        if payload.profile_id:
            await owned_profile(db, record.company_id, payload.profile_id)
        record.profile_id = payload.profile_id
        record.parameters = payload.model_dump(mode="json", exclude={"profile_id"})
        record.status = "DRAFT"
        event(db, record, {"code": "APPLICATION_UPDATED"})
        await db.flush()
        return record

    @router.post("/applications/{application_id}/submit", response_model=ApplicationView)
    async def submit(application_id: UUID, db: Session, request: Request, response: Response):
        record = await require(db, ApplicationRecord, application_id, lock=True)
        await submit_application(db, record, request.app.state.settings.max_attempts)
        if record.status in ("SUBMITTED", "SCORING"):
            response.status_code = 202
        await db.flush()
        return record

    @router.post("/applications/{application_id}/accept-counter-offer", response_model=ApplicationView, status_code=202)
    async def accept_counter_offer(application_id: UUID, db: Session, request: Request):
        record = await require(db, ApplicationRecord, application_id, lock=True)
        if record.status != "COUNTER_OFFER":
            raise HTTPException(409, detail="No pending counter-offer")
        previous = await db.scalar(select(DecisionRecord).where(DecisionRecord.job_id == record.latest_job_id))
        decision = CreditDecision.model_validate(previous.data)
        offered = decision.offered_conditions
        record.parameters = offered.model_dump(mode="json", include={"requested_amount", "term_months", "purpose"})
        record.status = "DRAFT"
        event(db, record, {"code": "COUNTER_OFFER_ACCEPTED", "previous_job_id": str(record.latest_job_id)})
        # Re-score the actual accepted amount; never reuse risk evaluated at another amount.
        return await submit_application(db, record, request.app.state.settings.max_attempts)

    @router.get("/applications/{application_id}/events", response_model=list[EventView])
    async def events(application_id: UUID, db: Session, limit: Page = 100, offset: Offset = 0):
        await require(db, ApplicationRecord, application_id)
        return (await db.scalars(select(EventRecord).where(EventRecord.application_id == application_id).order_by(EventRecord.sequence).limit(limit).offset(offset))).all()

    @router.get("/applications/{application_id}/decision", response_model=CreditDecision)
    async def decision(application_id: UUID, db: Session):
        record = await require(db, ApplicationRecord, application_id)
        latest = await db.scalar(select(DecisionRecord).where(DecisionRecord.job_id == record.latest_job_id))
        if latest is None:
            raise HTTPException(409, detail="Decision is not ready")
        return latest.data

    async def create_prediction(company_id, payload, kind, key, db, configured):
        profile = await owned_profile(db, company_id, payload.profile_id)
        history = {field: profile.data[field] for field in ("as_of_month", "company", "history")}
        try:
            if kind == "FORECAST":
                validated = ForecastRequest.model_validate(history | {"horizons": payload.horizons})
            else:
                validated = CashGapRequest.model_validate(history | payload.model_dump(exclude={"profile_id"}))
        except ValidationError as exc:
            raise RequestValidationError(exc.errors()) from None
        serialized = validated.model_dump(mode="json")
        if kind == "CASH_GAP":
            serialized["cash_plan"].sort(key=lambda row: row["month"])
        frozen = {"request": serialized, "profile_id": str(profile.id), "profile_hash": profile.content_hash}
        return await enqueue(db, company_id=company_id, kind=kind, payload=frozen,
                             scope=f"{kind}:{company_id}", key=key, max_attempts=configured.max_attempts)

    @router.post("/companies/{company_id}/forecasts", response_model=JobView, status_code=202)
    async def create_forecast(company_id: UUID, payload: ForecastJobCreate, db: Session, request: Request, idempotency_key: Key):
        return await create_prediction(company_id, payload, "FORECAST", idempotency_key, db, request.app.state.settings)

    @router.post("/companies/{company_id}/cash-gaps", response_model=JobView, status_code=202)
    async def create_cash_gap(company_id: UUID, payload: CashGapJobCreate, db: Session, request: Request, idempotency_key: Key):
        return await create_prediction(company_id, payload, "CASH_GAP", idempotency_key, db, request.app.state.settings)

    @router.get("/jobs/{job_id}", response_model=JobView)
    async def get_job(job_id: UUID, db: Session):
        return await require(db, JobRecord, job_id)

    @router.get("/companies/{company_id}/jobs", response_model=list[JobView])
    async def jobs(company_id: UUID, db: Session, limit: Page = 50, offset: Offset = 0):
        await require(db, CompanyRecord, company_id)
        return (await db.scalars(select(JobRecord).where(JobRecord.company_id == company_id).order_by(JobRecord.created_at.desc(), JobRecord.id).limit(limit).offset(offset))).all()

    application.include_router(router)
    return application


app = create_app()
