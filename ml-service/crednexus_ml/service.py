"""Synchronous CPU inference, callable from HTTP threads and async workers."""
from .contracts import ForecastRequest, ScoreRequest, CashGapRequest
from .cash_gap import calculate_cash_gap
from .features import add_months, build_forecast_features, build_score_features, quality_warnings
from .responses import ScoreResponse, CashEstimate, ForecastMonth, ForecastResponse, CashGapResponse
from .explanations import explain_cash_gap, explain_forecast, explain_forecast_month, explain_score

TARGETS = ("default_next12m", "default_90dpd_next12m", "cash_inflow_target", "operating_cash_outflow_target")


def predict_score(loaded, payload: ScoreRequest):
    frame = build_score_features(payload)
    result = {target: float(loaded.models[target].predict(frame)[0]) for target in TARGETS[:2]}
    warnings = quality_warnings(payload, loaded.models[TARGETS[0]].schema)
    return ScoreResponse(**result, model_version=loaded.version,
                         warnings=warnings, explanation=explain_score(result[TARGETS[0]], result[TARGETS[1]], warnings))


def predict_forecast(loaded, payload: ForecastRequest):
    frame = build_forecast_features(payload)
    inflow = loaded.models[TARGETS[2]].predict_interval(frame)
    outflow = loaded.models[TARGETS[3]].predict_interval(frame)
    def estimate(values):
        return CashEstimate(lower=float(values[0]), prediction=float(values[1]), upper=float(values[2]))
    results = [ForecastMonth(horizon=horizon, target_month=add_months(payload.as_of_month, horizon).isoformat(),
                             cash_inflow=estimate(inflow[i]), operating_cash_outflow=estimate(outflow[i]),
                             operating_net_cash_flow=float(inflow[i, 1] - outflow[i, 1]))
               for i, horizon in enumerate(payload.horizons)]
    for month in results:
        month.explanation = explain_forecast_month(month)
    warnings = quality_warnings(payload, loaded.models[TARGETS[2]].schema)
    return ForecastResponse(model_version=loaded.version, forecasts=results,
                            interval_nominal_coverage=loaded.interval_nominal_coverage,
                            warnings=warnings, explanation=explain_forecast(results, loaded.interval_nominal_coverage, warnings))


def predict_cash_gap(loaded, payload: CashGapRequest):
    forecast_request = ForecastRequest(
        as_of_month=payload.as_of_month, company=payload.company, history=payload.history,
        horizons=list(range(1, payload.months + 1)),
    )
    frame = build_forecast_features(forecast_request)
    inflow = loaded.models[TARGETS[2]].predict_interval(frame)
    outflow = loaded.models[TARGETS[3]].predict_interval(frame)
    calculation = calculate_cash_gap(payload, inflow, outflow)
    warnings = quality_warnings(payload, loaded.models[TARGETS[2]].schema) + [
        "MONTHLY_RESOLUTION: month-end balances do not detect intra-month cash gaps",
        "ADVERSE_SCENARIO: marginal flow endpoints do not form a calibrated balance interval or cash-gap probability",
    ]
    return CashGapResponse(
        **calculation.model_dump(), model_version=loaded.version, warnings=warnings,
        cash_plan=sorted(payload.cash_plan, key=lambda entry: entry.month),
        explanation=explain_cash_gap(calculation, payload.cash_plan, warnings),
    )
