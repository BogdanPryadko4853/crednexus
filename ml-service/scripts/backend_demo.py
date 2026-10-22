"""End-to-end HTTP demo against backend + worker + PostgreSQL, using synthetic input."""
import argparse
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
from uuid import uuid4


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    api_key = os.environ["CREDNEXUS_BACKEND_API_KEY"]
    examples = Path(__file__).resolve().parents[1] / "examples"

    def request(path, data=None, key=None):
        headers = {"X-API-Key": api_key, "Content-Type": "application/json"}
        if key:
            headers["Idempotency-Key"] = key
        req = urllib.request.Request(args.base_url.rstrip("/") + path,
                                     data=None if data is None else json.dumps(data).encode(), headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"HTTP {error.code}: {error.read().decode()}") from None

    def completed(job_id):
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            job = request(f"/api/v1/jobs/{job_id}")
            if job["status"] == "SUCCEEDED":
                return job["result"]
            if job["status"] == "FAILED":
                raise RuntimeError(f"Job failed: {job['error_code']}")
            time.sleep(.25)
        raise RuntimeError("Job did not finish; check that the worker is running")

    company = request("/api/v1/companies", {"name": "Синтетический магазин — HTTP demo"})
    company_id = company["id"]
    payload = json.loads((examples / "score_request.json").read_text())
    application = payload.pop("application")
    profile = request(f"/api/v1/companies/{company_id}/profiles", payload)
    draft = request("/api/v1/applications", {
        "company_id": company_id, "profile_id": profile["id"], "product_code": "working-capital",
        **{key: application[key] for key in ("requested_amount", "term_months", "purpose")},
    })
    submitted = request(f"/api/v1/applications/{draft['id']}/submit", {})
    assessment = completed(submitted["latest_job_id"])
    forecast_job = request(f"/api/v1/companies/{company_id}/forecasts", {"profile_id": profile["id"]}, key=str(uuid4()))
    forecast = completed(forecast_job["id"])
    gap_payload = json.loads((examples / "cash_gap_request.json").read_text())
    gap_job = request(f"/api/v1/companies/{company_id}/cash-gaps", {
        "profile_id": profile["id"], **{key: gap_payload[key] for key in ("months", "minimum_cash_reserve", "cash_plan")},
    }, key=str(uuid4()))
    gap = completed(gap_job["id"])
    print(json.dumps({
        "company_id": company_id, "application_id": draft["id"],
        "decision": assessment["decision"], "model_version": assessment["score"]["model_version"],
        "forecast_months": len(forecast["forecasts"]),
        "first_cash_gap_month": gap["base"]["first_cash_gap_month"],
        "funding_to_avoid_cash_gap": gap["base"]["funding_to_avoid_cash_gap"],
        "events": [row["status"] for row in request(f"/api/v1/applications/{draft['id']}/events")],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
