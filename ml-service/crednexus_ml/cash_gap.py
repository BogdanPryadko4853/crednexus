"""Monthly liquidity arithmetic. No implicit financing or probability of a cash gap."""
from datetime import date
from decimal import Decimal
from typing import Annotated

import numpy as np
from pydantic import BaseModel, Field

from .contracts import CashGapRequest
from .features import add_months

CALCULATION_VERSION = "cash-gap-v1"
Finite = Annotated[float, Field(allow_inf_nan=False)]
Nonnegative = Annotated[float, Field(ge=0, allow_inf_nan=False)]


class CashGapMonth(BaseModel):
    horizon: int
    month: date
    opening_balance: Finite
    cash_inflow: Nonnegative
    operating_cash_outflow: Nonnegative
    non_operating_inflow: Nonnegative
    non_operating_outflow: Nonnegative
    net_cash_flow: Finite
    closing_balance: Finite
    cash_shortfall: Nonnegative
    reserve_shortfall: Nonnegative


class CashGapScenario(BaseModel):
    first_cash_gap_month: date | None
    first_reserve_breach_month: date | None
    minimum_balance: Finite
    funding_to_avoid_cash_gap: Nonnegative
    funding_to_maintain_reserve: Nonnegative
    months: list[CashGapMonth]


class CashGapCalculation(BaseModel):
    calculation_version: str = CALCULATION_VERSION
    as_of_month: date
    opening_balance: Nonnegative
    minimum_cash_reserve: Nonnegative
    base: CashGapScenario
    adverse: CashGapScenario


def calculate_scenario(request: CashGapRequest, incoming: np.ndarray, outgoing: np.ndarray) -> CashGapScenario:
    # Decimal sums avoid floating-point dust turning an exact zero into a cash gap.
    def amount(value):
        return Decimal(str(value))

    balance = amount(next(row.cash_balance for row in request.history if row.month == request.as_of_month))
    reserve = amount(request.minimum_cash_reserve)
    minimum = balance
    first_gap = None
    first_reserve = request.as_of_month if balance < reserve else None
    plan = {entry.month: entry for entry in request.cash_plan}
    months = []
    for index in range(request.months):
        month = add_months(request.as_of_month, index + 1)
        entry = plan[month]
        additional_inflow = amount(entry.financing_inflow) + amount(entry.other_inflow)
        additional_outflow = amount(entry.debt_service) + amount(entry.investments) + amount(entry.other_outflow)
        net = amount(incoming[index]) - amount(outgoing[index]) + additional_inflow - additional_outflow
        closing = balance + net
        minimum = min(minimum, closing)
        if closing < 0 and first_gap is None:
            first_gap = month
        if closing < reserve and first_reserve is None:
            first_reserve = month
        months.append(CashGapMonth(
            horizon=index + 1, month=month, opening_balance=balance,
            cash_inflow=float(incoming[index]), operating_cash_outflow=float(outgoing[index]),
            non_operating_inflow=additional_inflow, non_operating_outflow=additional_outflow,
            net_cash_flow=net, closing_balance=closing,
            cash_shortfall=max(Decimal(0), -closing), reserve_shortfall=max(Decimal(0), reserve - closing),
        ))
        # A negative balance remains a funding need; never silently inject a loan.
        balance = closing
    return CashGapScenario(
        first_cash_gap_month=first_gap, first_reserve_breach_month=first_reserve,
        minimum_balance=minimum, funding_to_avoid_cash_gap=max(Decimal(0), -minimum),
        funding_to_maintain_reserve=max(Decimal(0), reserve - minimum), months=months,
    )


def calculate_cash_gap(request: CashGapRequest, inflow: np.ndarray, outflow: np.ndarray) -> CashGapCalculation:
    """Input columns: lower, point, upper; rows: consecutive horizons 1..months."""
    inflow, outflow = np.asarray(inflow, dtype=float), np.asarray(outflow, dtype=float)
    for values in (inflow, outflow):
        if values.shape != (request.months, 3) or not np.isfinite(values).all():
            raise ValueError("Cash-flow predictions must be finite [months, 3] matrices")
        if (values < 0).any() or (np.diff(values, axis=1) < 0).any():
            raise ValueError("Cash-flow intervals must be nonnegative and ordered")
    opening = next(row.cash_balance for row in request.history if row.month == request.as_of_month)
    return CashGapCalculation(
        as_of_month=request.as_of_month, opening_balance=opening, minimum_cash_reserve=request.minimum_cash_reserve,
        base=calculate_scenario(request, inflow[:, 1], outflow[:, 1]),
        # Combining marginal endpoints is a scenario, not a calibrated balance interval.
        adverse=calculate_scenario(request, inflow[:, 0], outflow[:, 2]),
    )
