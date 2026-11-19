"""Export or check the committed OpenAPI document."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .main import app


OUTPUT = Path(__file__).resolve().parents[2] / "docs" / "openapi.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    contents = json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != contents:
            raise SystemExit("docs/openapi.json is stale; run python -m app.export_openapi")
        print("docs/openapi.json matches the current API.")
        return
    OUTPUT.write_text(contents, encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
