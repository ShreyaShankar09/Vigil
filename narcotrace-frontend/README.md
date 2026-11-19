# VIGIL — AI-Powered Forensic Narcotics Field Testing & Evidence Management

Frontend prototype for SIH 2026, Problem Statement SIH26231. React + TypeScript + Vite + Tailwind CSS v4 + Recharts + React Router. Login and the test analysis (reference-card calibration + colour model + kit verdict) are REAL and run on the NarcoTrace backend. Everything else (evidence list, custody, sync, alerts, command-centre map/charts) is still demo data in localStorage.

## Run it

```bash
cp .env.example .env          # VITE_API_URL=http://localhost:8000
npm install
npm run dev
```

Start the backend first (see `../narcotrace-backend/README.md`, including `python -m app.seed`) and sign in with the officer you seeded.
Without the backend the app cannot log in or analyse (there is deliberately no fake fallback).

## Build

```bash
npm run build
npm run preview
```

## Demo flow

Login -> Dashboard -> Start new test -> Case ID / kit -> Capture (real camera or upload fallback; put the kit reference card in the dashed guide box) -> Calibrate & analyze (server: card detection, colour correction, colour model, kit verdict) -> Result -> Save evidence -> Evidence details (SHA-256 hash) -> Chain of custody -> Evidence history -> Offline sync center -> Command center (charts + live field map) -> Security center -> Profile.

## Structure

```
src/
  components/layout/   AppShell, Sidebar, MobileBottomNav, TopBar, RequireAuth
  components/ui/       Button, StatusBadge, StatCard, ConfidenceMeter, AlertCard, Feedback (toast/empty state)
  components/evidence/ EvidenceCard, EvidenceTable, ChainOfCustodyTimeline, SecurityCard,
                        ChartCard, MapPanel, SyncQueue, CameraScanner, CalibrationPanel, ResultCard
  pages/                Login, Dashboard, NewTest, EvidenceDetails, ChainOfCustody,
                        EvidenceHistory, OfflineSync, CommandCenter, Alerts, Security, Profile
  lib/                  api.ts (backend client), store.tsx (app state), mock-data.ts, nav.ts, utils.ts, use-online.ts
  types/                shared TypeScript types
```

## What is real vs still simulated

Real: officer login (JWT), photo upload, reference-card detection + colour calibration, colour model, per-kit verdict, calibration error (dE), model status banner.
Still simulated: evidence-record SHA-256 (placeholder string, not the photo's hash), GPS/location (default Whitefield + jitter), offline sync, custody events, Command-centre data, Security score, seeded evidence records (labelled "Demo seed (no model)").
The model is a SYNTHETIC BASELINE; every result screen says so.
