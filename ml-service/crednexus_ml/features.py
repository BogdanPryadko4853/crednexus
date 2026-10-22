"""Build model inputs from validated observations, without future data or imputation."""
from datetime import date

import numpy as np
import pandas as pd

from .contracts import ForecastRequest, HistoryRequest, ScoreRequest, month_number
from .history import MEASURES, history_features

FEATURE_VERSION = "monthly-v1"


def add_months(month: date, offset: int) -> date:
    year, index = divmod(month_number(month) + offset, 12)
    return date(year, index + 1, 1)


def history_arrays(request: HistoryRequest):
    origin = month_number(request.as_of_month)
    observed = {key: np.full((1, 13), np.nan) for key in MEASURES}
    for row in request.history:
        index = 12 + month_number(row.month) - origin
        if 0 <= index <= 12:
            for key in MEASURES:
                value = getattr(row, key)
                observed[key][0, index] = np.nan if value is None else value
    return observed


def history_row(request: HistoryRequest):
    return {key: values[0] for key, values in history_features(
        history_arrays(request), np.array([0]), np.array([12])
    ).items()}


def build_score_features(request: ScoreRequest) -> pd.DataFrame:
    snapshot = request.financial_snapshot.model_dump(exclude={"month", "business_state"})
    snapshot["business_state"] = {"active": 0, "distressed": 1, "restructuring": 2}[request.financial_snapshot.business_state]
    application = request.application.model_dump()
    # Preserve the training generator's rate floor, including for zero-rate offers.
    rate = max(application["annual_rate"], .001) / 12
    payment = application["requested_amount"] * rate / (1 - (1 + rate) ** (-application["term_months"]))
    row = request.company.model_dump() | snapshot | application | history_row(request)
    dpd = {entry.month: entry.dpd for entry in request.bureau_history}
    row.update(proposed_monthly_payment=payment, bureau_dpd_current=dpd[request.as_of_month],
               bureau_dpd_max_12=max(dpd.values()), bureau_overdue_months_12=sum(value > 0 for value in dpd.values()))
    row["cash_flow_coverage"] = (row["cash_inflow_mean_6"] - row["operating_cash_outflow_mean_6"]) / max(
        row["existing_monthly_debt_service"] + payment, 1)
    return pd.DataFrame([row])


def build_forecast_features(request: ForecastRequest) -> pd.DataFrame:
    history = history_row(request)
    observed = history_arrays(request)
    rows = []
    for horizon in request.horizons:
        target = add_months(request.as_of_month, horizon)
        row = request.company.model_dump() | history | {
            "horizon": horizon, "as_of_month_of_year": request.as_of_month.month,
            "target_month_of_year": target.month,
        }
        # Match forecast_frames float32 history BEFORE seasonal/derived features.
        for key in history:
            row[key] = np.float32(row[key])
        for measure in ("cash_inflow", "operating_cash_outflow"):
            row[measure + "_seasonal_target"] = observed[measure][0, horizon]
        rows.append(row)
    return pd.DataFrame(rows)


def quality_warnings(request: HistoryRequest, schema: dict) -> list[str]:
    observed = history_arrays(request)
    warnings = ["SYNTHETIC_MODEL: predictions are calibrated on scenario data, not a real bank portfolio"]
    if any(np.isnan(values).any() for values in observed.values()):
        warnings.append("INCOMPLETE_HISTORY: missing observations remain NaN; seasonal and lag features may be unavailable")
    if request.company.business_age_months < 12:
        warnings.append("SHORT_HISTORY: company has less than 12 months of history")
    values = request.company.model_dump()
    if isinstance(request, ScoreRequest):
        values |= request.financial_snapshot.model_dump() | request.application.model_dump()
        if request.application.annual_rate < .001:
            warnings.append("RATE_FLOOR: payment feature uses annual_rate=0.001 to match training")
    for key, categories in schema["categories"].items():
        if values.get(key) not in categories:
            warnings.append(f"UNKNOWN_CATEGORY: {key} is encoded as -1")
    return warnings
