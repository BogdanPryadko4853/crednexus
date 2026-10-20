import tempfile
from pathlib import Path
import unittest

import numpy as np
import pandas as pd

from crednexus_data.generate import Config, MEASURES, history_features, macro_path, service_fifo, simulate, source_fingerprint


class SimulatorTests(unittest.TestCase):
    def test_partial_payments_fifo(self):
        dues = np.array([[100., 100., 100.], [100., 100., 100.]])
        paid = service_fifo(dues, np.array([150., 350.]))
        np.testing.assert_array_equal(paid, [150, 300])
        np.testing.assert_array_equal(dues, [[0, 50, 100], [0, 0, 0]])

    def test_features_ignore_future(self):
        original = {key: np.tile(np.arange(60, dtype=float), (2, 1))
                    for key in MEASURES}
        rows, origins = np.array([0, 1]), np.array([25, 30])
        before = history_features(original, rows, origins)
        changed = {key: values.copy() for key, values in original.items()}
        for values in changed.values():
            values[0, 26:] = 1e20
            values[1, 31:] = np.nan
        after = history_features(changed, rows, origins)
        for key in before:
            np.testing.assert_array_equal(before[key], after[key])

    def test_short_history_never_wraps_to_future(self):
        data={key:np.arange(96,dtype=float)[None,:] for key in MEASURES}
        result=history_features(data,np.array([0]),np.array([3]))
        self.assertTrue(np.isnan(result['sales_lag_12'][0]))
        self.assertEqual(result['sales_mean_12'][0],1.5)

    def test_cash_policy_avoids_mass_long_zero_plateaus(self):
        from crednexus_data.plateaus import max_run
        config=Config(companies=400)
        tables=simulate(config,0,0,400,macro_path(config))
        truth=tables['audit/monthly_truth']
        cash=truth.cash_balance.to_numpy().reshape(400,config.months)
        operating=truth.business_state.to_numpy().reshape(400,config.months)<3
        runs=max_run((cash<.01)&operating)
        self.assertLess((runs>=6).mean(),.15)
        self.assertLessEqual(runs.max(),25)

    def test_reproducibility_and_error_layer(self):
        config = Config(companies=50)
        first = simulate(config, 0, 0, 50, macro_path(config))
        second = simulate(config, 0, 0, 50, macro_path(config))
        for table in first:
            pd.testing.assert_frame_equal(first[table], second[table])
        truth = first["audit/monthly_truth"]
        assert (truth.economic_event_mask > 0).any()
        assert (truth.quality_error_mask > 0).any()
        assert truth.sales.notna().all()
        assert first["monthly_observed"].sales.isna().any()

    def test_observation_errors_do_not_change_outcomes(self):
        config = Config(companies=100)
        dirty = simulate(config, 0, 0, 100, macro_path(config))
        clean_config = Config(companies=100, missing_rate=0., error_rate=0.)
        clean = simulate(clean_config, 0, 0, 100, macro_path(clean_config))
        pd.testing.assert_frame_equal(dirty["audit/monthly_truth"].drop(columns=["quality_error_mask","corruption_mask"]),
                                      clean["audit/monthly_truth"].drop(columns=["quality_error_mask","corruption_mask"]))
        pd.testing.assert_frame_equal(dirty["score_labels"], clean["score_labels"])

    def test_financial_and_temporal_invariants(self):
        from crednexus_data.generate import write_table
        from crednexus_data.validate import validate
        import json
        config = Config(companies=120)
        macro = macro_path(config)
        tables = simulate(config, 0, 0, config.companies, macro)
        tables["macro"] = macro
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/"audit").mkdir()
            for table, frame in tables.items():
                write_table(root, table, 0, frame)
            manifest = {"config": {"months": config.months}, "rows": {k: len(v) for k, v in tables.items()},
                        "source_sha256":source_fingerprint(),"scoring_feature_columns": ["requested_amount"], "forecast_feature_columns": ["horizon"]}
            (root/"manifest.json").write_text(json.dumps(manifest))
            report = validate(root)
            self.assertEqual(report["status"], "passed")


if __name__ == "__main__":
    unittest.main()
