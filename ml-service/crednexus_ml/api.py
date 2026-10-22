"""CPU inference API. Run: python -m uvicorn crednexus_ml.api:app."""
from contextlib import asynccontextmanager
import hashlib
import json
import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import numpy as np
import pandas as pd

from .contracts import CashGapRequest, ForecastRequest, ScoreRequest
from .features import FEATURE_VERSION
from .responses import ScoreResponse, ForecastResponse, CashGapResponse
from .service import predict_score, predict_forecast, predict_cash_gap
from .onnx_inference import OnnxPredictor

DEFAULT_MODELS = Path(__file__).resolve().parents[1] / "models" / "onnx"
TARGETS = ("default_next12m", "default_90dpd_next12m", "cash_inflow_target", "operating_cash_outflow_target")




class ModelBundle:
    def __init__(self, root: Path, threads: int):
        checks_path = root / "checksums.json"
        checks = json.loads(checks_path.read_text())
        required = {f"{target}/{name}" for target in TARGETS for name in ("model.onnx", "schema.json", "registry.json")}
        if not required.issubset(checks):
            raise ValueError("Missing model checksums")
        for relative, expected in checks.items():
            path = (root / relative).resolve()
            if not path.is_relative_to(root.resolve()):
                raise ValueError("Invalid checksum path")
            if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                raise ValueError(f"Model bundle checksum mismatch: {relative}")
        self.version = "onnx-sha256:" + hashlib.sha256(checks_path.read_bytes()).hexdigest()
        self.models = {target: OnnxPredictor(root, target, threads=threads) for target in TARGETS}
        self.runtime = self.models[TARGETS[0]].runtime
        coverages = {self.models[target].registry["intervals"]["nominal_coverage"] for target in TARGETS[2:]}
        if len(coverages) != 1:
            raise ValueError("Cash-flow models must use the same nominal interval coverage")
        self.interval_nominal_coverage = coverages.pop()
        # Readiness requires actual execution, not just loading session metadata.
        examples = json.loads((root / "examples.json").read_text())
        for target, model in self.models.items():
            case = examples["scoring" if model.classification else "forecast"]
            frame = pd.DataFrame(case["rows"])
            np.testing.assert_allclose(model.predict(frame), case["expected"][target], rtol=1e-9, atol=1e-7)
            if not model.classification:
                intervals = model.predict_interval(frame)
                if not np.isfinite(intervals).all():
                    raise ValueError("Non-finite warmup intervals")


def create_app(models_root: Path | str | None = None, threads: int | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application):
        root = Path(models_root or os.environ.get("CREDNEXUS_MODELS_DIR", DEFAULT_MODELS))
        count = threads if threads is not None else int(os.environ.get("CREDNEXUS_MODEL_THREADS", "4"))
        if not 1 <= count <= 64:
            raise ValueError("CREDNEXUS_MODEL_THREADS must be between 1 and 64")
        application.state.bundle = ModelBundle(root, count)
        try:
            yield
        finally:
            application.state.bundle = None

    application = FastAPI(title="CredNexus ML", version="1.2.0", lifespan=lifespan)
    application.state.bundle = None

    @application.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError):
        # Do not echo financial input or non-JSON values from validation contexts.
        return JSONResponse(status_code=422, content={"code": "VALIDATION_ERROR", "errors": [
            {"location": list(error["loc"]), "type": error["type"], "message": error["msg"]}
            for error in exc.errors()
        ]})

    @application.exception_handler(Exception)
    async def inference_error(_request: Request, exc: Exception):
        logging.getLogger(__name__).error("Inference failed (%s)", type(exc).__name__)
        return JSONResponse(status_code=500, content={"code": "INFERENCE_ERROR", "message": "Prediction could not be completed"})

    def bundle() -> ModelBundle:
        loaded = application.state.bundle
        if loaded is None:
            raise HTTPException(status_code=503, detail="Models are not ready")
        return loaded

    @application.get("/health/live")
    def live():
        return {"status": "alive"}

    @application.get("/health/ready")
    def ready():
        loaded = bundle()
        return {"status": "ready", "model_version": loaded.version, "feature_version": FEATURE_VERSION,
                "targets": list(loaded.models), "runtime": loaded.runtime.as_dict()}

    @application.post("/v1/score", response_model=ScoreResponse)
    def score(payload: ScoreRequest):
        return predict_score(bundle(), payload)

    @application.post("/v1/forecast", response_model=ForecastResponse)
    def forecast(payload: ForecastRequest):
        return predict_forecast(bundle(), payload)

    @application.post("/v1/cash-gap", response_model=CashGapResponse)
    def cash_gap(payload: CashGapRequest):
        return predict_cash_gap(bundle(), payload)

    return application


app = create_app()
