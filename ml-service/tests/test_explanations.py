from datetime import date
import unittest

import numpy as np

from crednexus_ml.cash_gap import calculate_cash_gap
from crednexus_ml.contracts import CashGapRequest
from crednexus_ml.explanations import (
    explain_cash_gap, explain_forecast, explain_forecast_month, explain_score, month_label, percent, rubles,
)
from crednexus_ml.responses import CashEstimate, ForecastMonth, ScoreResponse
from test_cash_gap import cash_gap_request


class ExplanationTests(unittest.TestCase):
    def test_russian_money_dates_and_tiny_nonzero_values(self):
        self.assertEqual(rubles(403407.127934352), "403 407,13 ₽")
        self.assertEqual(rubles(-0.), "0,00 ₽")
        self.assertEqual(rubles(.001), "менее 0,01 ₽")
        self.assertIn("минус", rubles(-.001))
        self.assertEqual(percent(.2), "20,00%")
        self.assertEqual(percent(.000001), "менее 0,01%")
        self.assertEqual(month_label(date(2027, 1, 1)), "январь 2027")

    def test_score_reports_probability_without_invented_causes(self):
        explanation = explain_score(.1234, .05, ["SYNTHETIC_MODEL: scenario", "INCOMPLETE_HISTORY: missing"])
        self.assertIn("12,34%", explanation.summary)
        self.assertIn("5,00%", " ".join(explanation.facts))
        self.assertTrue(any("истории" in line for line in explanation.limitations))
        self.assertNotIn("одобрена", explanation.summary)
        self.assertEqual(explanation.template_version, "ru-templates-v1")

    def test_first_deficit_is_distinguished_from_peak_funding_need(self):
        request = CashGapRequest.model_validate(cash_gap_request(opening=0.))
        result = calculate_cash_gap(request, np.zeros((3, 3)), np.full((3, 3), 100.))
        explanation = explain_cash_gap(result, request.cash_plan, [])
        self.assertIn("октября 2026", explanation.summary)
        self.assertIn("нехватка 100,00 ₽", explanation.summary)
        self.assertIn("пополнение 300,00 ₽", explanation.summary)
        self.assertTrue(any("внутри месяца" in line for line in explanation.limitations))

    def test_reserve_breach_is_not_claimed_as_negative_balance(self):
        request = CashGapRequest.model_validate(cash_gap_request(months=1, reserve=50.))
        result = calculate_cash_gap(request, np.full((1, 3), 10.), np.full((1, 3), 70.))
        explanation = explain_cash_gap(result, request.cash_plan, [])
        self.assertIn("отрицательные остатки", explanation.summary)
        self.assertIn("не ожидаются", explanation.summary)
        self.assertTrue(any("Резерв 50,00 ₽" in line for line in explanation.facts))
        self.assertTrue(any("пополнение 10,00 ₽" in line for line in explanation.facts))

    def test_only_adverse_scenario_has_a_gap(self):
        request = CashGapRequest.model_validate(cash_gap_request(months=1, opening=50.))
        result = calculate_cash_gap(request, np.array([[0., 100., 200.]]), np.array([[50., 100., 200.]]))
        explanation = explain_cash_gap(result, request.cash_plan, [])
        self.assertIn("не ожидаются", explanation.summary)
        self.assertTrue(any("неблагоприятном" in line and "150,00 ₽" in line for line in explanation.facts))
        self.assertTrue(any("не задаёт вероятность" in line for line in explanation.limitations))

    def test_plan_mentions_all_categories_without_causal_claim(self):
        payload = cash_gap_request(months=1)
        payload["cash_plan"][0].update(debt_service=30., investments=50., financing_inflow=20., other_inflow=5., other_outflow=2.)
        request = CashGapRequest.model_validate(payload)
        result = calculate_cash_gap(request, np.zeros((1, 3)), np.zeros((1, 3)))
        explanation = explain_cash_gap(result, request.cash_plan, [])
        plan = next(line for line in explanation.facts if line.startswith("План на"))
        for label in ("обслуживание долга", "инвестиции", "поступление финансирования", "прочие поступления", "прочие выплаты"):
            self.assertIn(label, plan)
        self.assertNotIn("из-за", plan)

    def test_negative_operating_flow_does_not_claim_cash_gap(self):
        month = ForecastMonth(horizon=1, target_month="2026-10-01", cash_inflow=CashEstimate(lower=80., prediction=100., upper=120.),
                              operating_cash_outflow=CashEstimate(lower=180., prediction=200., upper=220.), operating_net_cash_flow=-100.)
        explanation = explain_forecast_month(month)
        self.assertIn("превышают поступления на 100,00 ₽", explanation.summary)
        self.assertNotIn("кассов", explanation.summary)
        overview = explain_forecast([month], .9, [])
        self.assertTrue(any("не определяет наличие кассового разрыва" in line for line in overview.limitations))

    def test_forecast_text_names_only_requested_months_in_calendar_order(self):
        def month(horizon, target):
            return ForecastMonth(horizon=horizon, target_month=target, cash_inflow=CashEstimate(lower=0., prediction=0., upper=0.),
                                 operating_cash_outflow=CashEstimate(lower=0., prediction=0., upper=0.), operating_net_cash_flow=0.)
        explanation = explain_forecast([month(3, "2027-02-01"), month(1, "2026-12-01")], .9, [])
        self.assertEqual(explanation.summary, "Месяцы прогноза: декабрь 2026, февраль 2027.")
        self.assertIn("равны", explanation.facts[0])
        self.assertNotIn("январь", explanation.summary)

    def test_old_response_without_explanation_remains_valid(self):
        result = ScoreResponse.model_validate({"model_version": "old", "warnings": [], "default_next12m": .1, "default_90dpd_next12m": .05})
        self.assertIsNone(result.explanation)


if __name__ == "__main__":
    unittest.main()
