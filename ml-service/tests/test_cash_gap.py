from datetime import date
import unittest

import numpy as np

from crednexus_ml.cash_gap import calculate_cash_gap
from crednexus_ml.contracts import CashGapRequest
from crednexus_ml.features import add_months
from test_api import example_request


def cash_gap_request(months=3, opening=100., reserve=0., origin=date(2026, 9, 1)):
    payload = example_request()
    previous = date.fromisoformat(payload["as_of_month"])
    shift = (origin.year - previous.year) * 12 + origin.month - previous.month
    payload["as_of_month"] = origin.isoformat()
    for row in payload["history"]:
        row["month"] = add_months(date.fromisoformat(row["month"]), shift).isoformat()
    payload["history"][-1]["cash_balance"] = opening
    payload.update(months=months, minimum_cash_reserve=reserve, cash_plan=[{
        "month": add_months(origin, horizon).isoformat(), "debt_service": 0., "investments": 0.,
        "financing_inflow": 0., "other_inflow": 0., "other_outflow": 0.,
    } for horizon in range(1, months + 1)])
    return payload


class CashGapArithmeticTests(unittest.TestCase):
    def test_gap_recovery_and_minimum_funding(self):
        payload = cash_gap_request(reserve=20.)
        payload["cash_plan"][0].update(debt_service=30., investments=80., other_outflow=5.)
        request = CashGapRequest.model_validate(payload)
        inflow = np.array([[40., 50., 60.], [150., 200., 240.], [20., 30., 40.]])
        outflow = np.array([[70., 80., 90.], [90., 100., 110.], [30., 40., 50.]])
        result = calculate_cash_gap(request, inflow, outflow)
        self.assertEqual([row.closing_balance for row in result.base.months], [-45., 55., 45.])
        self.assertEqual(result.base.months[1].opening_balance, -45.)
        self.assertEqual(result.base.first_cash_gap_month, date(2026, 10, 1))
        self.assertEqual(result.base.funding_to_avoid_cash_gap, 45.)
        self.assertEqual(result.base.funding_to_maintain_reserve, 65.)
        self.assertEqual(result.adverse.minimum_balance, -65.)
        self.assertEqual([row.closing_balance for row in result.adverse.months], [-65., -25., -55.])
        self.assertEqual(result.adverse.funding_to_avoid_cash_gap, 65.)

    def test_no_double_counting_planned_movements(self):
        payload = cash_gap_request(months=1)
        payload["cash_plan"][0].update(financing_inflow=200., other_inflow=10.,
                                       debt_service=30., investments=40., other_outflow=5.)
        result = calculate_cash_gap(CashGapRequest.model_validate(payload), np.array([[50., 50., 50.]]), np.array([[80., 80., 80.]]))
        row = result.base.months[0]
        self.assertEqual(row.non_operating_inflow, 210.)
        self.assertEqual(row.non_operating_outflow, 75.)
        self.assertEqual(row.net_cash_flow, 105.)
        self.assertEqual(row.closing_balance, 205.)
        self.assertIsNone(result.base.first_cash_gap_month)

    def test_exact_zero_and_fractional_arithmetic(self):
        payload = cash_gap_request(months=1, opening=.1)
        request = CashGapRequest.model_validate(payload)
        result = calculate_cash_gap(request, np.array([[.2, .2, .2]]), np.array([[.3, .3, .3]]))
        self.assertEqual(result.base.months[0].closing_balance, 0.)
        self.assertIsNone(result.base.first_cash_gap_month)
        self.assertIsNone(result.base.first_reserve_breach_month)
        self.assertEqual(result.base.funding_to_avoid_cash_gap, 0.)

    def test_reserve_breach_is_separate_from_cash_gap(self):
        payload = cash_gap_request(months=1, reserve=50.)
        result = calculate_cash_gap(CashGapRequest.model_validate(payload), np.array([[10., 10., 10.]]), np.array([[70., 70., 70.]]))
        self.assertIsNone(result.base.first_cash_gap_month)
        self.assertEqual(result.base.first_reserve_breach_month, date(2026, 10, 1))
        self.assertEqual(result.base.funding_to_maintain_reserve, 10.)

    def test_initial_balance_below_reserve(self):
        payload = cash_gap_request(months=1, reserve=150.)
        result = calculate_cash_gap(CashGapRequest.model_validate(payload), np.array([[200., 200., 200.]]), np.zeros((1, 3)))
        self.assertEqual(result.base.first_reserve_breach_month, date(2026, 9, 1))
        self.assertEqual(result.base.minimum_balance, 100.)
        self.assertEqual(result.base.funding_to_maintain_reserve, 50.)

    def test_horizon_order_and_year_boundary(self):
        payload = cash_gap_request(origin=date(2026, 12, 1))
        payload["cash_plan"].reverse()
        result = calculate_cash_gap(CashGapRequest.model_validate(payload), np.zeros((3, 3)), np.zeros((3, 3)))
        self.assertEqual([row.month for row in result.base.months], [date(2027, 1, 1), date(2027, 2, 1), date(2027, 3, 1)])
        self.assertEqual(result.base.minimum_balance, 100.)

    def test_funding_is_peak_cumulative_deficit_not_sum(self):
        request = CashGapRequest.model_validate(cash_gap_request(opening=0.))
        result = calculate_cash_gap(request, np.zeros((3, 3)), np.full((3, 3), 100.))
        self.assertEqual([row.cash_shortfall for row in result.base.months], [100., 200., 300.])
        self.assertEqual(result.base.funding_to_avoid_cash_gap, 300.)

    def test_predictions_must_be_finite_ordered_intervals(self):
        request = CashGapRequest.model_validate(cash_gap_request(months=1))
        for values in (np.zeros((2, 3)), np.array([[0., np.nan, 2.]]), np.array([[1., 0., 2.]]), np.array([[-1., 0., 2.]])):
            with self.subTest(values=values):
                with self.assertRaises(ValueError):
                    calculate_cash_gap(request, values, np.zeros((1, 3)))


if __name__ == "__main__":
    unittest.main()
