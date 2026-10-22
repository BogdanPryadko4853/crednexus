from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, CheckConstraint, Date, DateTime, ForeignKey, Identity, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class CompanyRecord(Base):
    __tablename__ = "companies"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProfileRecord(Base):
    __tablename__ = "company_profiles"
    __table_args__ = (UniqueConstraint("company_id", "content_hash", name="uq_profile_content"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(ForeignKey("companies.id"), index=True)
    as_of_month: Mapped[date] = mapped_column(Date)
    data: Mapped[dict] = mapped_column(JSONB)
    content_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProductRecord(Base):
    __tablename__ = "credit_products"
    code: Mapped[str] = mapped_column(String(60), primary_key=True)
    data: Mapped[dict] = mapped_column(JSONB)


class ApplicationRecord(Base):
    __tablename__ = "credit_applications"
    __mapper_args__ = {"eager_defaults": True}
    __table_args__ = (CheckConstraint("status IN ('DRAFT','NEEDS_INFO','SUBMITTED','SCORING','APPROVED','COUNTER_OFFER','REJECTED','REVIEW_REQUIRED','FAILED')", name="ck_application_status"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(ForeignKey("companies.id"), index=True)
    product_code: Mapped[str] = mapped_column(ForeignKey("credit_products.code"))
    profile_id: Mapped[UUID | None] = mapped_column(ForeignKey("company_profiles.id"))
    parameters: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(30), default="DRAFT")
    latest_job_id: Mapped[UUID | None] = mapped_column(ForeignKey("ml_jobs.id", use_alter=True, name="fk_application_latest_job"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class JobRecord(Base):
    __tablename__ = "ml_jobs"
    __table_args__ = (
        UniqueConstraint("scope", "idempotency_key", name="uq_job_idempotency"),
        CheckConstraint("status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED')", name="ck_job_status"),
        CheckConstraint("kind IN ('ASSESS_APPLICATION','FORECAST','CASH_GAP')", name="ck_job_kind"),
        CheckConstraint("attempts >= 0 AND max_attempts > 0 AND attempts <= max_attempts", name="ck_job_attempts"),
        Index("ix_job_claim", "status", "available_at", "created_at"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(ForeignKey("companies.id"), index=True)
    application_id: Mapped[UUID | None] = mapped_column(ForeignKey("credit_applications.id"))
    kind: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20), default="QUEUED")
    scope: Mapped[str] = mapped_column(String(100))
    idempotency_key: Mapped[str] = mapped_column(String(128))
    request_hash: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSONB)
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(60))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    lease_token: Mapped[UUID | None]
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EventRecord(Base):
    __tablename__ = "application_events"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    sequence: Mapped[int] = mapped_column(BigInteger, Identity(), unique=True)
    application_id: Mapped[UUID] = mapped_column(ForeignKey("credit_applications.id"), index=True)
    status: Mapped[str] = mapped_column(String(30))
    details: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DecisionRecord(Base):
    __tablename__ = "credit_decisions"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    application_id: Mapped[UUID] = mapped_column(ForeignKey("credit_applications.id"), index=True)
    job_id: Mapped[UUID] = mapped_column(ForeignKey("ml_jobs.id"), unique=True)
    data: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
