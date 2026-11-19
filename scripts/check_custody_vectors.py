from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND_VECTORS = ROOT / "narcotrace-backend" / "tests" / "vectors" / "custody.json"
FRONTEND_VECTORS = ROOT / "narcotrace-frontend" / "tests" / "vectors" / "custody.json"

if BACKEND_VECTORS.read_bytes() != FRONTEND_VECTORS.read_bytes():
    raise SystemExit("Custody contract vectors differ between backend and frontend")

print("Custody contract vectors match.")
