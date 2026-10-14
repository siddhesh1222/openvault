# OpenVault

**Self-hostable, open source file sharing and backup.** OpenVault is an alternative to proprietary cloud storage: your files stay on your own server, encrypted at rest, with sharing, versioning and scheduled backups built in.

> 🚧 Work in progress. This README is completed in the final phase.

![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)

## Features
- 🔐 **Accounts**: registration and login with bcrypt-hashed passwords and JWT authentication
- 📁 **Files and folders**: upload, download, rename, delete (with Trash) and nested folders
- 🔗 **Share links**: optional password and expiry date
- 👥 **Share with users**: view or edit permissions
- 🕒 **Scheduled backups**: daily or weekly backups of selected folders, with one-click restore
- 🧾 **File versioning**: restore any older version
- 🛡️ **AES-256-GCM encryption**: every stored file is encrypted at rest
- 📊 **Dashboard**: storage usage, file-type breakdown and activity log
- 🛠️ **Admin panel**: manage users and storage quotas
- 🌗 Light and dark mode, responsive design

## Tech stack
| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0, APScheduler |
| Database | SQLite (dev), PostgreSQL (via `DATABASE_URL`) |
| Frontend | React (Vite), Tailwind CSS, shadcn/ui, Framer Motion, Recharts |
| Security | bcrypt, PyJWT, `cryptography` (AES-256-GCM) |
| Tests / Deploy | pytest, Docker, docker-compose |

## Quick start (development)
```bash
# 1. Configure: copy the example env file and generate the two secrets it describes
cp .env.example .env

# 2. Backend
cd backend
python -m venv .venv
.venv/Scripts/activate          # Windows  (Linux/macOS: source .venv/bin/activate)
pip install -r requirements-dev.txt
uvicorn app.main:app --reload    # http://localhost:8000/docs

# 3. Run tests
pytest
```

## Screenshots
_Screenshots will be added once the frontend is complete._

## Documentation
See the [`docs/`](docs/) folder for the architecture, diagrams and project report material.

## Contributing
Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md).

## Team
_ITL704 Recent Open Source Project Lab, University of Mumbai (Sem 7, IT)_. Add member names here.

## License
OpenVault is free software, licensed under the [GNU General Public License v3.0](LICENSE).
