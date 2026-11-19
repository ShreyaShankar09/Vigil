# NarcoTrace backend

The root [Quick start](../README.md#quick-start) runs the app with Docker Compose. For local
development, install `requirements.txt` and run `uvicorn app.main:app --reload` from this
directory, then run `python -m app.seed --admin` to interactively create the first zonal
administrator. Development secrets are generated and saved to `.env` on first startup;
production requires a 32-character `JWT_SECRET` and a 64-character hexadecimal `DATA_KEY_HEX`.

Access tokens expire after 15 minutes. Login also sets a rotating, eight-hour refresh cookie
(`HttpOnly`, `SameSite=Strict`). Authenticated endpoints require `Authorization: Bearer <token>`;
password changes and admin officer management are available at `/auth/change-password` and
`/admin/officers`. New officers must change their initial password before using other API routes.
Login failures are limited to five per officer ID and ten per IP in 15 minutes.

Alembic migrations run on application startup only when `ENV=dev`. In production, run
`alembic upgrade head` as a deployment step before starting the API. Run
`pytest -q --cov=app --cov-report=term-missing --cov-fail-under=85 tests` for backend tests.
The coverage configuration excludes `app/ml/`; CI also migrates against PostgreSQL 16.
See [the API reference](../docs/API.md) for authorization, evidence endpoints, and machine codes.

## Endpoints
POST /auth/login | GET /model/info | GET /kits | **POST /analyze** (multipart: `file`, `kit_id`) |
POST /sync/evidence | GET /evidence | GET /evidence/{id} | GET /evidence/{id}/image |
GET /evidence/{id}/custody | POST /evidence/{id}/custody | GET /evidence/{id}/verify |
GET /evidence/{id}/form6.pdf | POST /admin/evidence/{id}/release | GET /dashboard/summary

## /analyze pipeline (`app/ml/`)
1. `calibration.py` - centre-crop to 224, find the kit reference card (dark frame + white/grey/red/green swatches), fit a per-channel tone curve
   through frame/grey/white plus a ridge 3x3 colour matrix; report dE on the red/green swatches (leave-one-out, so it is an honest validation number).
2. `classifier.py` - 96x96 calibrated image -> TFLite CNN -> one of 8 colour classes + probability.
3. `kits.py` - kit-specific chart + policy. A colour that is not expected for that reagent is INCONCLUSIVE, never negative.
   Inconclusive also when: no card, far too dark / blown out, partial or unreadable, or confidence < 70%.

Tunable in `kits.py`: `CONF_MIN`, `REQUIRE_CARD`, chart entries. Model files + model_card.json live in `app/ml/models/`.

## Retraining
    pip install -r requirements-train.txt
    python ml_training/prepare_cache.py DATASET CACHE train   # also val, test (~5 min for train on 1 CPU)
    python ml_training/train.py DATASET OUT_DIR 12 230 CACHE  # resumable; repeat until it stops printing PAUSED
Then copy the `.tflite` files into `app/ml/models/` and update `model_card.json`.

## Status
Run and tested here: login, /analyze (auth, validation, calibration, verdicts), CORS preflight, policy tests.
Not yet connected to the app: /sync/evidence, custody, Form 6, dashboard (custody + AES-GCM were unit-tested earlier). Form 6 wording is a placeholder, not the official NDPS text.
Security: default JWT secret and all-zero AES key are for local dev only.
