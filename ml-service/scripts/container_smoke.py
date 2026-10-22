"""External Docker smoke checks, using only Python's standard library."""
import argparse
import json
import os
from pathlib import Path
import time
import urllib.request
from uuid import uuid4

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"


def request(base, path, data=None, *, key=None, idempotency=None):
    headers = {"Content-Type": "application/json"}
    if key:
        headers["X-API-Key"] = key
    if idempotency:
        headers["Idempotency-Key"] = idempotency
    req = urllib.request.Request(base.rstrip("/") + path,
                                 data=None if data is None else json.dumps(data).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("ml", "enqueue", "recover"))
    parser.add_argument("--ml-url", default="http://127.0.0.1:8001")
    parser.add_argument("--backend-url", default="http://127.0.0.1:8000")
    parser.add_argument("--queue-state", type=Path)
    args = parser.parse_args()
    if args.phase == "ml":
        ready = request(args.ml_url, "/health/ready")
        assert ready["status"] == "ready"
        assert ready["runtime"]["device"] == "cpu"
        assert ready["runtime"]["provider"] == "CPUExecutionProvider"
        assert len(ready["targets"]) == 4
        for endpoint, filename in (("score", "score_request.json"), ("forecast", "forecast_request.json"), ("cash-gap", "cash_gap_request.json")):
            result = request(args.ml_url, f"/v1/{endpoint}", json.loads((EXAMPLES / filename).read_text()))
            assert result["explanation"]["summary"]
            assert result["model_version"] == ready["model_version"]
        print("ML API smoke passed: all four models execute on CPU")
        return
    if args.queue_state is None:
        parser.error("--queue-state is required for enqueue/recover")
    key = os.environ["CREDNEXUS_BACKEND_API_KEY"]
    if args.phase == "enqueue":
        company = request(args.backend_url, "/api/v1/companies", {"name": "Синтетическая проверка восстановления очереди"}, key=key)
        forecast = json.loads((EXAMPLES / "forecast_request.json").read_text())
        history = {field: forecast[field] for field in ("as_of_month", "company", "history")}
        profile = request(args.backend_url, f"/api/v1/companies/{company['id']}/profiles", history, key=key)
        job = request(args.backend_url, f"/api/v1/companies/{company['id']}/forecasts",
                      {"profile_id": profile["id"]}, key=key, idempotency=str(uuid4()))
        assert job["status"] == "QUEUED", "Stop the worker before the enqueue phase"
        args.queue_state.parent.mkdir(parents=True, exist_ok=True)
        args.queue_state.write_text(json.dumps({"job_id": job["id"]}))
        print("Job durably queued while worker was stopped")
        return
    job_id = json.loads(args.queue_state.read_text())["job_id"]
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        job = request(args.backend_url, f"/api/v1/jobs/{job_id}", key=key)
        if job["status"] == "FAILED":
            raise RuntimeError(f"Recovered job failed: {job['error_code']}")
        if job["status"] == "SUCCEEDED":
            assert len(job["result"]["forecasts"]) == 3
            assert job["result"]["explanation"]["summary"]
            print("Queued job successfully processed after worker restart")
            return
        time.sleep(.25)
    raise RuntimeError("Worker did not finish the recovered job")


if __name__ == "__main__":
    main()
