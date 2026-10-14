# CLAUDE.md

Guidance for AI coding assistants (and humans) working on OpenVault.

## What this is
OpenVault is a self-hostable, GPL-3.0 file sharing and backup web app. It was built as a University of Mumbai ITL704 mini project by a group of 4 students, **who must be able to explain every line in a viva**. Prefer simple, readable, well-commented code over clever abstractions.

## Layout
- `backend/`: FastAPI + SQLAlchemy 2.0 + APScheduler (Python 3.12)
  - `app/config.py`: all settings, read from `.env` (never hard-code secrets)
  - `app/models.py`: every table; `app/schemas.py` holds every request/response shape
  - `app/security.py`: bcrypt, JWT, `get_current_user` / `require_admin` dependencies
  - `app/routers/`: thin HTTP layer, one file per feature
  - `app/services/`: business logic (quota, activity log, files, sharing, backups)
  - `app/storage/`: `StorageBackend` interface + local implementation + AES-GCM encryption
  - `tests/`: pytest; `conftest.py` sets env vars to a temp DB/storage *before* importing the app
- `frontend/`: React (Vite, JavaScript/JSX), Tailwind v4, shadcn/ui
  - `src/index.css`: design tokens (light + dark) — use `bg-primary`, `text-muted-foreground`, `bg-brand-gradient`, never raw hex
  - `src/context/`: Auth (JWT in localStorage), Theme, Upload queue
  - `src/hooks/useItemActions.jsx`: all file/folder actions + their dialogs (reused by Files, Shared, Search pages)
  - `src/components/files/`: grid/list views, preview, share dialog, version drawer, move/rename dialogs
  - `src/components/ui/`: generated shadcn components (lint-ignored); imports must use `@/lib/utils`
  - `src/lib/api.js`: the only axios instance; `/api` is proxied to :8000 by Vite in dev
- `docs/`: architecture (Mermaid), Gantt, logbook, report outline, viva Q&A, screenshots
- `docker-compose.yml`: nginx frontend (proxies /api) + backend; optional `postgres` profile
- `.github/workflows/ci.yml`: pytest, lint/build, docker build on every push

## Commands (Windows / PowerShell)
```powershell
# backend
cd backend
.venv\Scripts\python -m pytest              # run tests
.venv\Scripts\uvicorn app.main:app --reload  # API on http://localhost:8000 (docs at /docs)
# frontend
cd frontend; npm run dev                     # UI on http://localhost:5173
cd frontend; npm run lint; npm run build     # frontend checks
docker compose up -d --build                 # full stack on http://localhost:8080
```
Use `py` (not `python`) to create venvs on this machine.

## Conventions
- Times are stored as naive UTC (`models.utcnow()`); responses use `schemas.UTCDateTime` so they end in `Z`.
- Every important action calls `services.activity.log_activity(...)` before `db.commit()`.
- Routers stay thin; logic that touches storage or several tables goes in `services/`.
- Files are never stored in plaintext: always go through the encrypted storage layer.
- Every new feature needs pytest tests; run the whole suite before committing.
- Commit messages: short imperative summary (`Add share links with expiry`).
