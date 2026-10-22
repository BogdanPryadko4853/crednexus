"""Export the direct ML API contract without starting models or a web server."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from crednexus_ml.api import app  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output = ROOT / "docs" / "openapi-ml.json"
    schema = app.openapi()
    content = json.dumps(schema, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not output.exists() or output.read_text(encoding="utf-8") != content:
            raise SystemExit("OpenAPI snapshot is stale: run python scripts/export_openapi.py")
        print("OpenAPI snapshot is current")
    else:
        output.write_text(content, encoding="utf-8")
        print(output.relative_to(ROOT))


if __name__ == "__main__":
    main()
