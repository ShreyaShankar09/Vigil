# NarcoTrace project context

## What this project is

NarcoTrace (frontend branded "VIGIL") is a field tool for police officers: they photograph a presumptive narcotics colour test next to a printed reference card; the system calibrates the photo's colour, a small CNN reads the reaction colour, a per-kit chart turns colour into a verdict (positive / negative / inconclusive), and the evidence is sealed with a tamper-evident chain of custody and exported as a Form 6 PDF. Roles: field_officer, zonal_admin, lab, prosecutor. Context: SIH 2026, PS SIH26231. Users are in India; UI must work in 13 languages: en hi kn ta te ml mr bn gu pa or as ur (Urdu is right-to-left).

## Repository layout

- `narcotrace-backend/`: FastAPI + SQLAlchemy 2 (SQLite dev, Postgres prod). `app/main.py` (endpoints), `models.py`, `security.py` (JWT HS256, bcrypt, AES-256-GCM), `custody.py` (hash chain), `form6.py` (ReportLab PDF), `seed.py`, `app/ml/` (calibration.py, preprocess.py, classifier.py, kits.py, models/*.tflite, models/model_card.json), `ml_training/` (prepare_cache.py, train.py), `tests/test_policy.py`.
- `narcotrace-frontend/`: React 19 + TypeScript + Vite + Tailwind v4 + React Router 7 + Recharts + jsPDF/html2canvas-pro. `src/lib/api.ts` (backend client), `store.tsx` (state, localStorage), `mock-data.ts`, `i18n.tsx`, `auto-translate.ts`.
- `narcotrace-synthetic-dataset/`: 10,000 synthetic 224x224 JPEGs, 8 colour classes (blue purple purple_black orange_brown orange_red no_reaction partial unreadable), manifest.csv, generate_synthetic.py. Split by capture session.
- `docs/EVALUATION.md`: measured results.

## Facts already verified

Do not redo or contradict these facts:

- Backend tested end to end: POST /auth/login, GET /model/info, GET /kits, POST /analyze (multipart file, kit_id), POST /sync/evidence (idempotent; rejects wrong image hash and broken custody chain), POST /evidence/{id}/custody, GET /evidence/{id}/verify, GET /evidence/{id}/form6.pdf, GET /dashboard/summary (admin roles only).
- `/analyze` pipeline: centre-crop to 224 -> find reference card (dark frame + white/grey/red/green swatches, ~72x30 px at 224) -> per-channel tone curve + ridge 3x3 colour matrix, validated by leave-one-out dE on red/green swatches -> 96x96 -> TFLite CNN (19k params) -> kits.decide() policy (card required, confidence >= 0.70, reject dark/clipped, colour not expected for the kit = inconclusive, never negative).
- Measured on the SYNTHETIC test split: card detection 99.2% (0 false detections on 276 no-card images); dE median 20.1 -> 9.2; colour accuracy 85.4% raw -> 88.5% calibrated (92.5% when the card is found); 97.5% correct when the policy gives a definite answer, covering ~35% of samples; 0 of 1,122 true positives called negative.
- Kit charts (kits.py) follow published references (Marquis: MDMA/MDA purple-black, amphetamine-type orange-brown/orange-red, opiates purple; modified Scott: cocaine blue; Duquenois-Levine: cannabis purple) but are chart_verified=False until a human checks them against the kit manufacturer's chart.

## Known defects to fix

- Backend: (1) any authenticated user can append custody events; (2) any authenticated user can read any evidence/verify/form6 (no object-level authorisation); (3) missing Authorization header returns 422, not 401; (4) no list/get evidence, evidence image, /me, user-management or password-change endpoints; (5) no login throttling/lockout; (6) Evidence.model_version is String(30) but real values are 37+ chars (breaks on Postgres); (7) insecure default JWT_SECRET and all-zero AES key; (8) no migrations; (9) datetime.utcnow() deprecated; (10) Form 6 PDF uses Helvetica, so it cannot render Indic/Urdu text; wording is a placeholder, not the official NDPS text; (11) /analyze returns English reason strings (cannot be translated).
- Frontend: (12) all evidence/custody/alerts/command-centre data are mock + localStorage, not the backend; (13) evidence SHA-256 is a fake string (generateHash), not the photo's hash; (14) GPS is a hard-coded location + random jitter; (15) offline sync is a setTimeout; (16) Security page score is a constant; (17) only ~67 strings are translatable (nav, login, Form 6); ~140+ English strings are hard-coded; translations are positional arrays (ROWS[lang][i]) so one missing string shifts everything; (18) auto-translate.ts needs Claude's sample capability and only works inside the Claude preview; (19) no fonts are bundled for Indic scripts; (20) login has a fake "device authentication" button, no language picker on the sign-in page, no session-expiry handling, no role-based routing (single hard-coded currentOfficer); (21) no ESLint config, no unit/E2E tests.
- ML: (22) model trained on synthetic data only; (23) no real-photo ingestion path; (24) no model registry / regression gate in CI; (25) reaction colour changes over time (Marquis valid ~60 s) and this is not captured.

## Non-negotiable rules

- Never invent accuracy numbers. Every metric shown anywhere must come from a script in the repo. Synthetic results must always be labelled "synthetic". Keep the model-status banner until real lab validation exists.
- Never fabricate evidence fields (hash, GPS, temperature, lighting). If a value cannot be measured, store null and show "unavailable".
- A colour the kit does not expect is inconclusive, never negative. When in doubt, return inconclusive.
- Security: no default secrets outside dev (the app must refuse to start in ENV=prod without JWT_SECRET and DATA_KEY_HEX); never log tokens or images; every endpoint checks role AND object ownership; constant-time compares; validate upload size/type.
- The hash chain format is a cross-language contract: hash = sha256(prev_hash_ascii || canonical_json(payload)), canonical JSON = sorted keys, separators (",",":"), ensure_ascii=False, UTF-8; genesis = 64 zeros. Backend and frontend must share test vectors.
- Everything user-visible goes through the i18n layer. No hard-coded user-facing strings in components. Backend sends machine codes + params, never prose, for reasons/warnings/errors.
- Offline-first: the capture -> seal -> queue flow must work with no network; only /analyze needs the server (see Phase 4 for the optional on-device path).
- After every phase run the phase's "Done when" commands and paste the real output. If something fails, fix it - do not weaken a test to make it pass.
- Keep files small and typed (TypeScript strict; Python type hints; ruff + mypy-lite clean).

## Definition of "working from the start"

From a clean clone: one command starts everything, the first screen is the Sign-in page (language picker visible), and every flow in the E2E suite (Phase 7) passes.
