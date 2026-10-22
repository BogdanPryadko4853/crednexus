from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from crednexus_ml.explanations import Explanation

from crednexus_ml.contracts import (
    Application, BureauMonth, Contract, FinancialSnapshot,
    HistoryRequest, Money, PlannedCashMovements, validate_credit_context,
)


class CompanyCreate(Contract):
    name: Annotated[str, Field(min_length=1, max_length=200, pattern=r".*\S.*")]


class ProfileCreate(HistoryRequest):
    """Forecast history can be uploaded before credit-specific observations are available."""
    financial_snapshot: FinancialSnapshot | None = None
    bureau_history: Annotated[list[BureauMonth], Field(min_length=12, max_length=12)] | None = None

    @model_validator(mode="after")
    def validate_credit_blocks(self):
        validate_credit_context(self.as_of_month, self.financial_snapshot, self.bureau_history)
        return self


class ProductDefinition(Contract):
    code: str
    name: str
    annual_rate: Annotated[float, Field(gt=0, le=1)]
    min_amount: Annotated[float, Field(gt=0)]
    max_amount: Annotated[float, Field(gt=0)]
    min_term_months: Annotated[int, Field(ge=1)]
    max_term_months: Annotated[int, Field(ge=1)]
    purposes: list[str]
    minimum_business_age_months: Annotated[int, Field(ge=3)]
    minimum_cash_flow_coverage: Annotated[float, Field(gt=0)]
    review_probability: Annotated[float, Field(gt=0, lt=1)]
    reject_probability: Annotated[float, Field(gt=0, lt=1)]
    policy_version: str

    @model_validator(mode="after")
    def coherent_limits(self):
        if self.min_amount > self.max_amount or self.min_term_months > self.max_term_months or self.review_probability >= self.reject_probability:
            raise ValueError("Invalid product policy limits")
        return self


class ApplicationParameters(Contract):
    requested_amount: Annotated[float, Field(strict=True, gt=0, le=1e15)]
    term_months: Annotated[int, Field(strict=True, ge=1, le=1200)]
    purpose: Annotated[str, Field(min_length=1, max_length=80)]


class ApplicationCreate(ApplicationParameters):
    company_id: UUID
    product_code: Annotated[str, Field(min_length=1, max_length=60)]
    profile_id: UUID | None = None


class ApplicationUpdate(ApplicationParameters):
    profile_id: UUID | None = None


class ForecastJobCreate(Contract):
    profile_id: UUID
    horizons: Annotated[list[Annotated[int, Field(strict=True, ge=1, le=3)]], Field(min_length=1, max_length=3)] = [1, 2, 3]

    @model_validator(mode="after")
    def unique_horizons(self):
        if len(self.horizons) != len(set(self.horizons)):
            raise ValueError("Duplicate horizons")
        return self


class CashGapJobCreate(Contract):
    profile_id: UUID
    months: Annotated[int, Field(strict=True, ge=1, le=3)] = 3
    minimum_cash_reserve: Money = 0.
    cash_plan: Annotated[list[PlannedCashMovements], Field(min_length=1, max_length=3)]


class View(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class CompanyView(View):
    id: UUID
    name: str
    created_at: datetime


class ProfileView(View):
    id: UUID
    company_id: UUID
    as_of_month: date
    content_hash: str
    data: ProfileCreate
    created_at: datetime


class ApplicationView(View):
    id: UUID
    company_id: UUID
    product_code: str
    profile_id: UUID | None
    parameters: ApplicationParameters
    status: str
    latest_job_id: UUID | None
    created_at: datetime
    updated_at: datetime


class JobView(View):
    id: UUID
    company_id: UUID
    application_id: UUID | None
    kind: str
    status: str
    request_hash: str
    attempts: int
    max_attempts: int
    result: dict | None
    error_code: str | None
    created_at: datetime
    finished_at: datetime | None


class EventView(View):
    id: UUID
    sequence: int
    application_id: UUID
    status: str
    details: dict
    created_at: datetime


class DecisionReason(Contract):
    code: str
    message: str


class CreditDecision(Contract):
    status: Literal["APPROVED", "COUNTER_OFFER", "REJECTED", "REVIEW_REQUIRED"]
    policy_version: str
    reasons: list[DecisionReason]
    risk_evaluated_amount: float
    cash_flow_coverage: float
    offered_conditions: Application | None = None
    explanation: Explanation | None = None
