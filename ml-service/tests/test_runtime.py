import json
import os
import unittest
from unittest.mock import patch

import pandas as pd

from crednexus_ml.api import DEFAULT_MODELS
from crednexus_ml.onnx_inference import OnnxPredictor
from crednexus_ml.runtime import resolve_runtime


class RuntimeTests(unittest.TestCase):
    def test_no_gpu_uses_cpu_for_auto_and_cuda_preference(self):
        with patch("crednexus_ml.runtime.ort.get_available_providers", return_value=["CPUExecutionProvider"]):
            for device in ("auto", "cuda"):
                runtime = resolve_runtime(device)
                self.assertEqual(runtime.device, "cpu")
                self.assertEqual(runtime.fallback_reason, "cuda_provider_unavailable")
                self.assertFalse(runtime.cuda_provider_available)

    def test_tree_models_keep_cpu_even_with_cuda_provider(self):
        with patch("crednexus_ml.runtime.ort.get_available_providers", return_value=["CUDAExecutionProvider", "CPUExecutionProvider"]):
            runtime = resolve_runtime("auto")
            self.assertTrue(runtime.cuda_provider_available)
            self.assertEqual(runtime.provider, "CPUExecutionProvider")
            self.assertEqual(runtime.fallback_reason, "tree_ensemble_cpu_policy")
            self.assertIsNone(resolve_runtime("cpu").fallback_reason)

    def test_invalid_config_and_missing_cpu_provider_fail_clearly(self):
        with self.assertRaisesRegex(ValueError, "CREDNEXUS_DEVICE"):
            resolve_runtime("typo")
        with patch("crednexus_ml.runtime.ort.get_available_providers", return_value=[]):
            with self.assertRaisesRegex(RuntimeError, "CPUExecutionProvider"):
                resolve_runtime("auto")

    def test_real_model_executes_without_gpu(self):
        with patch.dict(os.environ, {"CREDNEXUS_DEVICE": "cuda", "CUDA_VISIBLE_DEVICES": "", "NVIDIA_VISIBLE_DEVICES": "void"}):
            model = OnnxPredictor(DEFAULT_MODELS, "default_next12m", threads=1)
            case = json.loads((DEFAULT_MODELS / "examples.json").read_text())["scoring"]
            result = model.predict(pd.DataFrame(case["rows"]))
            self.assertEqual(model.session.get_providers(), ["CPUExecutionProvider"])
            self.assertAlmostEqual(float(result[0]), case["expected"]["default_next12m"][0], places=9)


if __name__ == "__main__":
    unittest.main()
