"""Profile two public numeric reference datasets; never include records in synthetic output.

This optional research command requires network access; normal generation does not.
Archives stay in memory, and only aggregate statistics are saved.
"""
import argparse
import hashlib
from io import BytesIO, StringIO
import json
from pathlib import Path
import urllib.request
from zipfile import ZipFile

import numpy as np
import pandas as pd


SOURCES = {
    "polish_bankruptcy": "https://archive.ics.uci.edu/static/public/365/polish+companies+bankruptcy+data.zip",
    "taiwan_bankruptcy": "https://archive.ics.uci.edu/static/public/572/taiwanese+bankruptcy+prediction.zip",
}


def describe(frame, label):
    numeric = frame.apply(pd.to_numeric, errors="coerce")
    features = numeric.drop(columns=[label])
    q1, q3 = features.quantile(.25), features.quantile(.75)
    iqr = q3-q1
    extreme = features.lt(q1-3*iqr) | features.gt(q3+3*iqr)
    examples = features.columns[:6].tolist()
    return {"rows": len(frame), "features": len(features.columns),
            "positives": int(numeric[label].sum()), "positive_rate": float(numeric[label].mean()),
            "missing_cells": int(features.isna().sum().sum()),
            "rows_with_missing_fraction": float(features.isna().any(axis=1).mean()),
            "rows_with_3iqr_tail_fraction": float(extreme.any(axis=1).mean()),
            "tail_definition": "Any feature beyond Q1-3*IQR or Q3+3*IQR; not an error or fraud label.",
            "example_quantiles": features[examples].quantile([0, .01, .5, .99, 1]).replace([np.inf, -np.inf], np.nan).to_dict()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("docs/reference_profiles.json"))
    args = parser.parse_args()
    report = {"note": "Reference statistics only. No real records copied, fitted, or rescaled into generated companies.", "sources": {}}
    for name, url in SOURCES.items():
        request = urllib.request.Request(url, headers={"User-Agent": "CredNexus-hackathon-research/0.1"})
        with urllib.request.urlopen(request, timeout=45) as response:
            archive = response.read()
        result = {"url": url, "sha256": hashlib.sha256(archive).hexdigest(), "tables": {}}
        with ZipFile(BytesIO(archive)) as zipped:
            for member in zipped.namelist():
                if member.lower().endswith(".arff"):
                    content = zipped.read(member).decode("utf-8")
                    header, values = content.lower().split("@data", 1)
                    width = sum(line.strip().startswith("@attribute") for line in header.splitlines())
                    columns = [f"X{i}" for i in range(1, width)]+["bankrupt"]
                    frame = pd.read_csv(StringIO(values.strip()), names=columns, na_values="?")
                    result["tables"][member] = describe(frame, "bankrupt")
                elif member.lower().endswith(".csv"):
                    frame = pd.read_csv(zipped.open(member))
                    frame.columns = frame.columns.str.strip()
                    label = next(c for c in frame if "bankrupt" in c.lower())
                    result["tables"][member] = describe(frame, label)
        report["sources"][name] = result
        print(f"Profiled {name}: {list(result['tables'])}", flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False)+"\n")


if __name__ == "__main__":
    main()
