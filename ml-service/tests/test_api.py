import copy
from datetime import date
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import numpy as np
import pandas as pd

from crednexus_data.generate import Config, macro_path, simulate
from crednexus_ml.api import DEFAULT_MODELS, create_app
from crednexus_ml.common import forecast_features, score_features
from crednexus_ml.contracts import ForecastRequest, ScoreRequest
from crednexus_ml.features import add_months, build_forecast_features, build_score_features
from crednexus_ml.history import MEASURES
from crednexus_ml.onnx_inference import matrix


def example_request():
    origin = date(2026, 9, 1)
    history = [{"month": add_months(origin, offset).isoformat(), "sales": 3_000_000. + offset * 1000,
                "cash_inflow": 2_800_000., "operating_cash_outflow": 2_100_000.,
                "cash_balance": 1_000_000., "operating_expense": 2_200_000.} for offset in range(-12, 1)]
    return {"as_of_month": origin.isoformat(), "company": {"sector": "retail", "business_age_months": 36},
            "history": history}


def example_score():
    payload = example_request()
    origin = date.fromisoformat(payload["as_of_month"])
    payload.update(application={"requested_amount": 1_000_000., "term_months": 12, "annual_rate": .18,
                                "purpose": "working_capital", "product_limit": 3_000_000.},
                   financial_snapshot={"month": origin.isoformat(), "legal_form": "OOO",
                                       "largest_customer_share": .2, "largest_channel_share": .4,
                                       "accounts_receivable": 500_000., "accounts_payable": 300_000.,
                                       "overdue_payables": 0., "debt_outstanding": 200_000., "loan_arrears": 0.,
                                       "inventory": 100_000., "business_state": "active", "existing_monthly_debt_service": 20_000.},
                   bureau_history=[{"month": add_months(origin, offset).isoformat(), "dpd": 0} for offset in range(-11, 1)])
    return payload


def generated_request(tables, row):
    """Independent adapter from original simulator tables to the public contract."""
    cid, origin = row.company_id, int(row.as_of_month_idx)
    observed = tables["monthly_observed"]
    history = observed[(observed.company_id == cid) & observed.month_idx.between(origin - 12, origin)]
    company = tables["companies"].set_index("company_id").loc[cid]
    history = history[history.month_idx >= company.birth_month_idx]
    payload = {"as_of_month": add_months(date(2018, 1, 1), origin).isoformat(),
               "company": {"sector": row.sector, "business_age_months": int(row.business_age_months)},
               "history": [{"month": entry.date.date().isoformat(), **{
                   key: None if pd.isna(entry[key]) else float(entry[key]) for key in MEASURES
               }} for _, entry in history.iterrows()]}
    return payload


class FeatureParityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cfg = Config(companies=40)
        cls.tables = simulate(cfg, 0, 0, cfg.companies, macro_path(cfg))

    def test_score_matches_original_training_rows(self):
        schema = json.loads((DEFAULT_MODELS / "default_next12m/schema.json").read_text())
        for _, original in self.tables["score_features"].head(8).iterrows():
            with self.subTest(company=original.company_id):
                payload = generated_request(self.tables, original)
                snapshot_keys = ("legal_form", "largest_customer_share", "largest_channel_share", "accounts_receivable",
                                 "accounts_payable", "overdue_payables", "debt_outstanding", "loan_arrears", "inventory",
                                 "existing_monthly_debt_service")
                payload["financial_snapshot"] = {key: original[key] for key in snapshot_keys}
                payload["financial_snapshot"].update(month=payload["as_of_month"],
                    business_state={0: "active", 1: "distressed", 2: "restructuring"}[int(original.business_state)])
                payload["application"] = {key: original[key] for key in ("requested_amount", "annual_rate", "purpose", "product_limit")}
                payload["application"]["term_months"] = int(original.term_months)
                truth = self.tables["audit/monthly_truth"]
                past = truth[(truth.company_id == original.company_id) & truth.month_idx.between(int(original.as_of_month_idx)-11, int(original.as_of_month_idx))]
                payload["bureau_history"] = [{"month": entry.date.date().isoformat(), "dpd": int(entry.dpd)} for _, entry in past.iterrows()]
                actual = score_features(build_score_features(ScoreRequest.model_validate(payload)))
                expected = score_features(pd.DataFrame([original]))
                np.testing.assert_allclose(matrix(actual, schema), matrix(expected, schema), rtol=1e-6, atol=1e-6, equal_nan=True)

    def test_forecast_matches_original_training_rows(self):
        schema = json.loads((DEFAULT_MODELS / "cash_inflow_target/schema.json").read_text())
        for horizon in (1, 2, 3):
            original = self.tables["forecast_features"].query("horizon == @horizon").iloc[0]
            payload = generated_request(self.tables, original) | {"horizons": [horizon]}
            actual = forecast_features(build_forecast_features(ForecastRequest.model_validate(payload)))
            expected = pd.DataFrame([original])
            monthly = self.tables["monthly_observed"]
            seasonal = monthly[(monthly.company_id == original.company_id) & (monthly.month_idx == int(original.target_month_idx)-12)].iloc[0]
            for key in ("cash_inflow", "operating_cash_outflow"):
                expected[key + "_seasonal_target"] = seasonal[key]
            expected = forecast_features(expected)
            np.testing.assert_allclose(matrix(actual, schema), matrix(expected, schema), rtol=1e-6, atol=1e-6, equal_nan=True)


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app(threads=1)
        cls.context = TestClient(cls.app)
        cls.client = cls.context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.context.__exit__(None, None, None)

    def test_health_and_model_reuse(self):
        self.assertEqual(self.client.get("/health/live").status_code, 200)
        ready = self.client.get("/health/ready").json()
        self.assertEqual(ready["status"], "ready")
        self.assertEqual(len(ready["targets"]), 4)
        self.assertEqual(ready["runtime"]["device"], "cpu")
        self.assertEqual(ready["runtime"]["provider"], "CPUExecutionProvider")
        with patch("crednexus_ml.api.OnnxPredictor", side_effect=AssertionError("Model reloaded")):
            for _ in range(2):
                response = self.client.post("/v1/score", json=example_score())
                self.assertEqual(response.status_code, 200, response.text)
                result = response.json()
                self.assertEqual(result["model_version"], ready["model_version"])
                self.assertTrue(0 <= result["default_next12m"] <= 1)

    def test_forecast_matches_direct_model_and_calendar(self):
        payload = example_request() | {"horizons": [3, 1, 2]}
        response = self.client.post("/v1/forecast", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        forecasts = response.json()["forecasts"]
        frame = build_forecast_features(ForecastRequest.model_validate(payload))
        expected = self.app.state.bundle.models["cash_inflow_target"].predict_interval(frame)
        for i, result in enumerate(forecasts):
            self.assertEqual(result["horizon"], payload["horizons"][i])
            np.testing.assert_allclose(list(result["cash_inflow"].values()), expected[i])
            self.assertAlmostEqual(result["operating_net_cash_flow"], result["cash_inflow"]["prediction"] - result["operating_cash_outflow"]["prediction"])
        self.assertEqual(forecasts[0]["target_month"], "2026-12-01")
        self.assertEqual(add_months(date(2026, 12, 1), 1), date(2027, 1, 1))

    def test_documented_examples_and_score_outputs(self):
        examples = Path(__file__).resolve().parents[1] / "examples"
        for endpoint in ("score", "forecast", "cash-gap"):
            filename = endpoint.replace("-", "_")
            payload = json.loads((examples / f"{filename}_request.json").read_text())
            response = self.client.post(f"/v1/{endpoint}", json=payload)
            self.assertEqual(response.status_code, 200, response.text)
            explanation = response.json()["explanation"]
            self.assertEqual(explanation["template_version"], "ru-templates-v1")
            self.assertTrue(explanation["summary"])
            self.assertEqual(explanation["language"], "ru")
            if endpoint == "score":
                frame = build_score_features(ScoreRequest.model_validate(payload))
                for target in ("default_next12m", "default_90dpd_next12m"):
                    self.assertEqual(response.json()[target], float(self.app.state.bundle.models[target].predict(frame)[0]))

    def test_missing_and_unknown_categories_produce_warnings(self):
        payload = example_score()
        payload["history"] = payload["history"][-3:]
        payload["history"][-1]["sales"] = None
        payload["company"]["sector"] = "unknown_sector"
        response = self.client.post("/v1/score", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        warnings = response.json()["warnings"]
        self.assertTrue(any("INCOMPLETE_HISTORY" in warning for warning in warnings))
        self.assertTrue(any("UNKNOWN_CATEGORY" in warning for warning in warnings))

    def test_bad_history_and_types_are_rejected(self):
        cases = []
        payload = example_request(); payload["history"].append(copy.deepcopy(payload["history"][-1])); cases.append(payload)
        payload = example_request(); payload["history"][-1]["month"] = "2026-10-01"; cases.append(payload)
        payload = example_request(); payload["as_of_month"] = "2026-09-02"; cases.append(payload)
        payload = example_request(); payload["as_of_month"] = 0; cases.append(payload)
        payload = example_request(); payload["as_of_month"] = "2026-09-01T00:00:00"; cases.append(payload)
        payload = example_request(); payload["history"] = payload["history"][:-1]; cases.append(payload)
        payload = example_request(); payload["history"][-1]["sales"] = -1; cases.append(payload)
        payload = example_request(); payload["history"][-1]["sales"] = "100"; cases.append(payload)
        payload = example_request(); payload["history"][-1]["sales"] = True; cases.append(payload)
        payload = example_request(); payload["company"]["business_age_months"] = 3; cases.append(payload)
        payload = example_request(); payload["future_label"] = 0; cases.append(payload)
        for horizons in ([0], [4], [1, 1], [True], []):
            cases.append(example_request() | {"horizons": horizons})
        payload = example_request()
        for row in payload["history"][-3:]: row["sales"] = None
        cases.append(payload)
        for i, payload in enumerate(cases):
            with self.subTest(case=i):
                response = self.client.post("/v1/forecast", json=payload)
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(response.json()["code"], "VALIDATION_ERROR")
                self.assertNotIn("input", response.json()["errors"][0])

    def test_bureau_and_snapshot_are_validated(self):
        for mutate in (
            lambda p: p["bureau_history"].pop(),
            lambda p: p["bureau_history"][0].update(p["bureau_history"][1]),
            lambda p: p["financial_snapshot"].update(month="2026-08-01"),
            lambda p: p["financial_snapshot"].update(overdue_payables=400_000.),
            lambda p: p["application"].update(annual_rate=18.),
        ):
            payload = example_score(); mutate(payload)
            response = self.client.post("/v1/score", json=payload)
            self.assertEqual(response.status_code, 422, response.text)

    def test_malformed_json_and_nonfinite_input(self):
        for content in ('{"as_of_month":', json.dumps(example_request()).replace('3000000.0', 'NaN')):
            response = self.client.post("/v1/forecast", content=content, headers={"Content-Type": "application/json"})
            self.assertEqual(response.status_code, 422, response.text)

    def test_openapi_includes_contracts(self):
        schema = self.client.get("/openapi.json").json()
        self.assertIn("ScoreRequest", schema["components"]["schemas"])
        self.assertIn("ForecastResponse", schema["components"]["schemas"])
        self.assertIn("CashGapRequest", schema["components"]["schemas"])
        self.assertIn("/v1/cash-gap", schema["paths"])

    def test_cash_gap_uses_real_forecasts(self):
        from test_cash_gap import cash_gap_request
        payload = cash_gap_request(opening=0., reserve=100_000.)
        payload["cash_plan"][0]["investments"] = 10_000_000.
        payload["cash_plan"].reverse()
        response = self.client.post("/v1/cash-gap", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        forecast_payload = {key: payload[key] for key in ("as_of_month", "company", "history")}
        forecast = self.client.post("/v1/forecast", json=forecast_payload).json()
        first = result["base"]["months"][0]
        self.assertEqual(first["cash_inflow"], forecast["forecasts"][0]["cash_inflow"]["prediction"])
        self.assertEqual(first["operating_cash_outflow"], forecast["forecasts"][0]["operating_cash_outflow"]["prediction"])
        self.assertAlmostEqual(first["closing_balance"], first["cash_inflow"] - first["operating_cash_outflow"] - 10_000_000.)
        self.assertEqual(result["base"]["first_cash_gap_month"], "2026-10-01")
        self.assertGreater(result["base"]["funding_to_avoid_cash_gap"], 0)
        self.assertLessEqual(result["adverse"]["minimum_balance"], result["base"]["minimum_balance"])
        self.assertEqual(result["cash_plan"][0]["month"], "2026-10-01")
        self.assertEqual(result["calculation_version"], "cash-gap-v1")
        self.assertTrue(any("MONTHLY_RESOLUTION" in value for value in result["warnings"]))

    def test_cash_gap_contract_validation(self):
        from test_cash_gap import cash_gap_request
        mutations = [
            lambda p: p.update(months=4),
            lambda p: p.update(months=True),
            lambda p: p.update(minimum_cash_reserve=-1.),
            lambda p: p["history"][-1].update(cash_balance=None),
            lambda p: p["cash_plan"].pop(),
            lambda p: p["cash_plan"][0].update(month=p["cash_plan"][1]["month"]),
            lambda p: p["cash_plan"][0].update(month=p["as_of_month"]),
            lambda p: p["cash_plan"][0].update(month="2027-01-01"),
            lambda p: p["cash_plan"][0].update(debt_service=-1.),
            lambda p: p["cash_plan"][0].update(financing_inflow="100"),
            lambda p: p["cash_plan"][0].pop("investments"),
            lambda p: p.update(horizons=[1, 3]),
        ]
        for mutate in mutations:
            payload = cash_gap_request(); mutate(payload)
            response = self.client.post("/v1/cash-gap", json=payload)
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(response.json()["code"], "VALIDATION_ERROR")

    def test_cash_gap_short_horizons_and_no_reload(self):
        from test_cash_gap import cash_gap_request
        with patch("crednexus_ml.api.OnnxPredictor", side_effect=AssertionError("Model reloaded")):
            for months in (1, 2):
                response = self.client.post("/v1/cash-gap", json=cash_gap_request(months=months))
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(len(response.json()["base"]["months"]), months)

    def test_not_ready_before_startup(self):
        with_client = TestClient(create_app())
        self.assertEqual(with_client.get("/health/ready").status_code, 503)

    def test_startup_rejects_invalid_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "checksums.json").write_text("{}")
            with self.assertRaisesRegex(ValueError, "Missing model checksums"):
                with TestClient(create_app(root)):
                    self.fail("Invalid bundle started")

    def test_checksum_mismatch_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            checks = json.loads((DEFAULT_MODELS / "checksums.json").read_text())
            relative = next(iter(checks))
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("corrupted")
            (root / "checksums.json").write_text(json.dumps(checks))
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                with TestClient(create_app(root)):
                    self.fail("Corrupted bundle started")


if __name__ == "__main__":
    unittest.main()
