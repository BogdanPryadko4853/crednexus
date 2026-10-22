"""Resolve exact Linux/Python 3.13 runtime versions, or check existing locks."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
TARGETS = {"ml": "requirements-api.txt", "backend": "requirements-backend.txt"}


def canonical(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for target, source in TARGETS.items():
        lock = ROOT / f"requirements-{target}.lock"
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "report.json"
            command = [sys.executable, "-m", "pip", "install", "--dry-run", "--ignore-installed",
                       "--quiet", "--disable-pip-version-check", "--report", str(report), "-r", str(ROOT / source)]
            if args.check:
                command += ["-c", str(lock)]
            subprocess.run(command, check=True)
            resolved = {canonical(item["metadata"]["name"]): item["metadata"]["version"]
                        for item in json.loads(report.read_text())["install"]}
        lines = [f"{name}=={resolved[name]}" for name in sorted(resolved)]
        if args.check:
            expected = [line for line in lock.read_text().splitlines() if line and not line.startswith("#")]
            if lines != expected:
                raise SystemExit(f"Runtime lock is out of date: {lock.name}")
        else:
            lock.write_text("# Linux / Python 3.13. Regenerate with: python scripts/lock_runtime.py\n" + "\n".join(lines) + "\n")
        print(f"{lock.name}: {'checked' if args.check else 'written'} ({len(lines)} packages)")


if __name__ == "__main__":
    main()
