"""Record a human kit-chart verification.

Run: python -m app.ml.verify_chart KIT-XXX --by "Verifier Name"
"""
import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from .kits import _CHART_PATH, load_charts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("kit_id")
    parser.add_argument("--by", required=True)
    args = parser.parse_args()
    verifier = args.by.strip()
    if not verifier:
        parser.error("--by must not be empty")

    load_charts()
    data = json.loads(_CHART_PATH.read_text(encoding="utf-8"))
    if args.kit_id not in data:
        parser.error(f"Unknown kit: {args.kit_id}")
    chart = data[args.kit_id]
    chart["chart_verified"] = True
    chart["verified_by"] = verifier
    chart["verified_on"] = datetime.now(timezone.utc).date().isoformat()

    temporary_path = _CHART_PATH.with_suffix(".json.tmp")
    try:
        temporary_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary_path, _CHART_PATH)
    finally:
        temporary_path.unlink(missing_ok=True)
    load_charts()
    print(f"Verified {args.kit_id} by {verifier} on {chart['verified_on']}")


if __name__ == "__main__":
    main()
