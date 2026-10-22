import json
from pathlib import Path
from types import SimpleNamespace
import unittest

from crednexus_backend.contracts import CreditDecision
from crednexus_backend.policy import DEMO_PRODUCT, decide
from crednexus_backend.worker import Worker
from crednexus_ml.api import DEFAULT_MODELS, ModelBundle
from crednexus_ml.contracts import ScoreRequest
from crednexus_ml.responses import ScoreResponse

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"


class DecisionExplanationTests(unittest.TestCase):
    def setUp(self):
        self.payload = json.loads((EXAMPLES / "score_request.json").read_text())
        self.score = ScoreResponse(model_version="test", warnings=["SYNTHETIC_MODEL"], default_next12m=.01, default_90dpd_next12m=.005)

    def decision(self):
        return decide(ScoreRequest.model_validate(self.payload), self.score, DEMO_PRODUCT)

    def test_approved_conditions_and_no_issuance_promise(self):
        result = self.decision()
        self.assertEqual(result.status, "APPROVED")
        explanation = result.explanation
        self.assertIn("демонстрационном", explanation.title)
        self.assertTrue(any("1 000 000,00 ₽" in line and "18,00%" in line and "12 мес." in line for line in explanation.facts))
        self.assertTrue(any("не подтверждает фактическую выдачу" in line for line in explanation.limitations))
        self.assertNotIn("подпишите", " ".join(explanation.next_steps).lower())

    def test_counter_offer_shows_both_amounts_and_rescoring(self):
        self.payload["application"]["requested_amount"] = 4_000_000.
        result = self.decision()
        self.assertEqual(result.status, "COUNTER_OFFER")
        self.assertIn("3 000 000,00 ₽", result.explanation.summary)
        self.assertIn("4 000 000,00 ₽", result.explanation.summary)
        self.assertTrue(any("новую оценку риска" in line for line in result.explanation.next_steps))

    def test_risk_rejection_has_real_threshold_and_no_fabricated_arrears(self):
        self.score.default_next12m = .25
        result = self.decision()
        self.assertEqual(result.status, "REJECTED")
        self.assertTrue(any("25,00%" in line and "20,00%" in line for line in result.explanation.facts))
        self.assertFalse(any("текущая просрочка" in line for line in result.explanation.facts))

    def test_manual_review_does_not_claim_employee_was_assigned(self):
        self.score.default_next12m = .15
        result = self.decision()
        self.assertEqual(result.status, "REVIEW_REQUIRED")
        self.assertIn("требуется участие сотрудника", result.explanation.summary)
        self.assertNotIn("передана", result.explanation.summary)
        self.assertTrue(any("15,00%" in line and "10,00%" in line for line in result.explanation.facts))

    def test_multiple_rejection_reasons_include_actual_input(self):
        self.payload["application"].update(term_months=120, requested_amount=10_000.)
        result = self.decision()
        self.assertTrue(any("120 мес." in line and "36 мес." in line for line in result.explanation.facts))
        self.assertTrue(any("10 000,00 ₽" in line and "50 000,00 ₽" in line for line in result.explanation.facts))

    def test_credit_decisions_saved_before_templates_remain_valid(self):
        data = self.decision().model_dump(exclude={"explanation"})
        self.assertIsNone(CreditDecision.model_validate(data).explanation)


class WorkerExplanationTests(unittest.TestCase):
    def test_worker_results_serialize_explanations_without_database(self):
        bundle = ModelBundle(DEFAULT_MODELS, 1)
        worker = Worker(None, bundle, None)
        scoring = json.loads((EXAMPLES / "score_request.json").read_text())
        assessment = worker.evaluate(SimpleNamespace(kind="ASSESS_APPLICATION", payload={
            "score_request": scoring, "product": DEMO_PRODUCT.model_dump(mode="json"), "profile_id": "fixture", "profile_hash": "fixture",
        }))
        saved = json.loads(json.dumps(assessment))
        for block in (saved["score"], saved["decision"]):
            self.assertEqual(block["explanation"]["template_version"], "ru-templates-v1")
            self.assertTrue(block["explanation"]["summary"])
        for kind, filename in (("FORECAST", "forecast_request.json"), ("CASH_GAP", "cash_gap_request.json")):
            result = worker.evaluate(SimpleNamespace(kind=kind, payload={"request": json.loads((EXAMPLES / filename).read_text())}))
            self.assertEqual(json.loads(json.dumps(result))["explanation"]["language"], "ru")
