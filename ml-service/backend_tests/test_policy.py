import json
from pathlib import Path
import unittest

from crednexus_backend.policy import DEMO_PRODUCT, decide
from crednexus_ml.contracts import ScoreRequest
from crednexus_ml.responses import ScoreResponse


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.payload = json.loads((Path(__file__).resolve().parents[1] / "examples/score_request.json").read_text())
        self.score = ScoreResponse(model_version="test", warnings=["SYNTHETIC_MODEL"], default_next12m=.01, default_90dpd_next12m=.005)

    def decide(self):
        return decide(ScoreRequest.model_validate(self.payload), self.score, DEMO_PRODUCT)

    def test_approve_and_product_counter_offer(self):
        self.assertEqual(self.decide().status, "APPROVED")
        self.payload["application"]["requested_amount"] = 4_000_000.
        result = self.decide()
        self.assertEqual(result.status, "COUNTER_OFFER")
        self.assertEqual(result.offered_conditions.requested_amount, 3_000_000.)

    def test_reject_high_risk_and_route_moderate_risk_to_review(self):
        self.score.default_next12m = .2
        self.assertEqual(self.decide().status, "REJECTED")
        self.score.default_next12m = .1
        self.assertEqual(self.decide().status, "REVIEW_REQUIRED")

    def test_low_capacity_and_unsupported_term(self):
        for row in self.payload["history"]:
            row["cash_inflow"] = 100_000.
        self.assertEqual(self.decide().status, "REJECTED")
        self.payload["application"]["term_months"] = 120
        self.assertTrue(any(reason.code == "TERM_OUTSIDE_PRODUCT" for reason in self.decide().reasons))

    def test_arrears_and_data_quality(self):
        self.payload["bureau_history"][-1]["dpd"] = 90
        self.assertEqual(self.decide().status, "REJECTED")
        self.payload["bureau_history"][-1]["dpd"] = 1
        self.assertEqual(self.decide().status, "REVIEW_REQUIRED")
        self.payload["bureau_history"][-1]["dpd"] = 0
        self.score.warnings.append("UNKNOWN_CATEGORY: sector")
        self.assertEqual(self.decide().status, "REVIEW_REQUIRED")
