"""Dependency-light container probe: HTTP readiness or a live worker heartbeat."""
import argparse
import json
import math
import os
from pathlib import Path
import time
import urllib.request

WORKER_HEALTH_FILE = "/tmp/crednexus-worker-health.json"


def check_http(url: str) -> None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url, timeout=3) as response:
        payload = json.load(response)
        if response.status != 200 or payload.get("status") != "ready":
            raise ValueError("HTTP readiness failed")


def check_worker(path: Path, max_age: float = 30.) -> None:
    payload = json.loads(path.read_text())
    timestamp, pid = payload["updated_at"], payload["pid"]
    if type(timestamp) not in (int, float) or not math.isfinite(timestamp):
        raise ValueError("Invalid worker timestamp")
    age = time.time() - timestamp
    if payload.get("ready") is not True or not 0 <= age <= max_age:
        raise ValueError("Worker is not ready or heartbeat is stale")
    if type(pid) is not int or pid < 1:
        raise ValueError("Invalid worker PID")
    os.kill(pid, 0)


def write_worker_health(path: Path, *, ready: bool, runtime: dict) -> None:
    payload = {"pid": os.getpid(), "ready": ready, "updated_at": time.time(), "runtime": runtime}
    temporary = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(json.dumps(payload, allow_nan=False))
        temporary.chmod(0o600)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def remove_worker_health(path: Path) -> None:
    try:
        if json.loads(path.read_text()).get("pid") == os.getpid():
            path.unlink(missing_ok=True)
    except (OSError, ValueError):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", nargs="?", choices=("http", "worker"),
                        default=os.environ.get("CREDNEXUS_HEALTHCHECK_MODE", "http"))
    parser.add_argument("--url", default=os.environ.get("CREDNEXUS_HEALTHCHECK_URL", "http://127.0.0.1:8000/health/ready"))
    parser.add_argument("--file", type=Path, default=Path(os.environ.get("CREDNEXUS_WORKER_HEALTH_FILE", WORKER_HEALTH_FILE)))
    args = parser.parse_args()
    try:
        if args.mode == "worker":
            check_worker(args.file)
        else:
            check_http(args.url)
    except Exception:
        # Avoid printing URLs, environment values or database connection details.
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
