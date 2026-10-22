"""Shared response contracts for direct HTTP inference and durable backend jobs."""
from typing import Annotated
from pydantic import BaseModel, Field
from .contracts import PlannedCashMovements
from .cash_gap import CashGapCalculation
from .features import FEATURE_VERSION
from .explanations import Explanation

Probability = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
Finite = Annotated[float, Field(allow_inf_nan=False)]


class PredictionMetadata(BaseModel):
    model_version: str
    feature_version: str = FEATURE_VERSION
    warnings: list[str]
    explanation: Explanation | None = None


class ScoreResponse(PredictionMetadata):
    default_next12m: Probability
    default_90dpd_next12m: Probability


class CashEstimate(BaseModel):
    lower: Finite
    prediction: Finite
    upper: Finite


class ForecastMonth(BaseModel):
    horizon: int
    target_month: str
    cash_inflow: CashEstimate
    operating_cash_outflow: CashEstimate
    operating_net_cash_flow: Finite
    explanation: Explanation | None = None


class ForecastResponse(PredictionMetadata):
    interval_nominal_coverage: Annotated[float, Field(gt=0, lt=1)]
    forecasts: list[ForecastMonth]


class CashGapResponse(PredictionMetadata, CashGapCalculation):
    cash_plan: list[PlannedCashMovements]
