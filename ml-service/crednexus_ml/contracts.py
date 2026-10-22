"""Public v1 input contract. All observations are known at the closed as-of month."""
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator, model_validator

from .history import MEASURES

Money = Annotated[float, Field(strict=True, ge=0, le=1e15, allow_inf_nan=False)]
Count = Annotated[int, Field(strict=True, ge=0, le=100000)]
Month = Annotated[date, Field(description="First day of a calendar month, YYYY-MM-01")]


def month_number(value: date) -> int:
    return value.year * 12 + value.month - 1


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    @field_validator("*", mode="before")
    @classmethod
    def iso_month(cls, value, info: ValidationInfo):
        if info.field_name in ("month", "as_of_month"):
            if isinstance(value, str):
                if len(value) != 10 or value[4] != "-" or value[7] != "-":
                    raise ValueError("Month must use YYYY-MM-01 format")
            elif type(value) is not date:
                raise ValueError("Month must be an ISO date")
        return value

    @field_validator("*", mode="after")
    @classmethod
    def first_day(cls, value):
        if isinstance(value, date) and value.day != 1:
            raise ValueError("Month must be the first day of the month")
        return value


class Company(Contract):
    sector: Annotated[str, Field(min_length=1, max_length=80)]
    business_age_months: Annotated[int, Field(strict=True, ge=3, le=1200)]


class MonthlyObservation(Contract):
    month: Month
    sales: Money | None
    cash_inflow: Money | None
    operating_cash_outflow: Money | None
    cash_balance: Money | None
    operating_expense: Money | None


class HistoryRequest(Contract):
    as_of_month: Annotated[date, Field(le=date(9999, 9, 1), description="Last closed month, YYYY-MM-01")]
    company: Company
    history: Annotated[list[MonthlyObservation], Field(min_length=3, max_length=120)]

    @model_validator(mode="after")
    def validate_history(self):
        origin = month_number(self.as_of_month)
        months = [month_number(row.month) for row in self.history]
        if len(months) != len(set(months)):
            raise ValueError("Duplicate history months")
        if any(month > origin for month in months):
            raise ValueError("History must not contain months after as_of_month")
        if any(origin - month >= self.company.business_age_months for month in months):
            raise ValueError("History precedes company birth")
        recent = [row for row in self.history if origin - month_number(row.month) < 3]
        if len(recent) != 3:
            raise ValueError("History must include each of the last three closed months")
        for measure in MEASURES:
            if all(getattr(row, measure) is None for row in recent):
                raise ValueError(f"At least one {measure} observation is required in the last three months")
        return self


class Application(Contract):
    requested_amount: Annotated[float, Field(strict=True, gt=0, le=1e15)]
    term_months: Annotated[int, Field(strict=True, ge=1, le=1200)]
    annual_rate: Annotated[float, Field(strict=True, ge=0, le=1)]
    purpose: Annotated[str, Field(min_length=1, max_length=80)]
    product_limit: Annotated[float, Field(strict=True, gt=0, le=1e15)]


class FinancialSnapshot(Contract):
    month: Month
    legal_form: Annotated[str, Field(min_length=1, max_length=80)]
    largest_customer_share: Annotated[float, Field(strict=True, ge=0, le=1)]
    largest_channel_share: Annotated[float, Field(strict=True, ge=0, le=1)]
    accounts_receivable: Money
    accounts_payable: Money
    overdue_payables: Money
    debt_outstanding: Money
    loan_arrears: Money
    inventory: Money
    business_state: Literal["active", "distressed", "restructuring"]
    existing_monthly_debt_service: Money

    @model_validator(mode="after")
    def check_payables(self):
        if self.overdue_payables > self.accounts_payable:
            raise ValueError("overdue_payables must not exceed accounts_payable")
        return self


class BureauMonth(Contract):
    month: Month
    dpd: Count


def validate_credit_context(as_of_month, financial_snapshot, bureau_history):
    """Validate provided credit blocks; callers decide whether those blocks are mandatory."""
    if financial_snapshot is not None and financial_snapshot.month != as_of_month:
        raise ValueError("Financial snapshot must match as_of_month")
    if bureau_history is not None:
        expected = set(range(month_number(as_of_month) - 11, month_number(as_of_month) + 1))
        if {month_number(row.month) for row in bureau_history} != expected:
            raise ValueError("Bureau history must cover exactly the last 12 months including as_of_month")


class ScoringContext(HistoryRequest):
    financial_snapshot: FinancialSnapshot
    bureau_history: Annotated[list[BureauMonth], Field(min_length=12, max_length=12)]

    @model_validator(mode="after")
    def validate_snapshot(self):
        validate_credit_context(self.as_of_month, self.financial_snapshot, self.bureau_history)
        return self


class ScoreRequest(ScoringContext):
    application: Application


class ForecastRequest(HistoryRequest):
    horizons: Annotated[list[Annotated[int, Field(strict=True, ge=1, le=3)]], Field(min_length=1, max_length=3)] = [1, 2, 3]

    @field_validator("horizons")
    @classmethod
    def unique_horizons(cls, value):
        if len(value) != len(set(value)):
            raise ValueError("Duplicate horizons")
        return value


class PlannedCashMovements(Contract):
    """Known non-operating cash movements; explicit zeros mean no planned movement."""
    month: Month
    debt_service: Money
    investments: Money
    financing_inflow: Money
    other_inflow: Money
    other_outflow: Money


class CashGapRequest(HistoryRequest):
    months: Annotated[int, Field(strict=True, ge=1, le=3)] = 3
    minimum_cash_reserve: Money = 0.
    cash_plan: Annotated[list[PlannedCashMovements], Field(min_length=1, max_length=3)]

    @model_validator(mode="after")
    def validate_cash_plan(self):
        origin = month_number(self.as_of_month)
        expected = set(range(origin + 1, origin + self.months + 1))
        actual = [month_number(entry.month) for entry in self.cash_plan]
        if len(actual) != self.months or set(actual) != expected:
            raise ValueError("Cash plan must cover each forecast month exactly once, starting after as_of_month")
        current = next(row for row in self.history if row.month == self.as_of_month)
        if current.cash_balance is None:
            raise ValueError("Known cash_balance at as_of_month is required for the opening balance")
        return self
