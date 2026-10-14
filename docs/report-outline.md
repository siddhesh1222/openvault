# Mini project report outline (University of Mumbai format)

**Title:** OpenVault: A Self-Hostable, Open Source File Sharing and Backup Application
**Subject:** ITL704 Recent Open Source Project Lab, B.E. Information Technology, Semester VII

> **Formatting (typical for MU; confirm with your department):** A4, Times New Roman 12 pt body, headings 14–16 pt bold, 1.5 line spacing, justified text, margins 1" (left 1.5" for binding). Number figures and tables by chapter (Fig. 5.1, Table 2.1). Page numbers bottom centre, Roman numerals for the front matter.

Each section below lists **what to write** and **where to find it in this repository**.

---

## Front matter

1. **Title page:** project title, team members with roll numbers, guide's name, department, college logo, academic year 2026–27.
2. **Certificate:** signed by the guide, HOD and principal.
3. **Declaration:** the work is original, signed by all members.
4. **Acknowledgement**
5. **Abstract** (see below)
6. **Table of contents**, **List of figures**, **List of tables**, **List of abbreviations** (AES, GCM, JWT, API, SPA, ORM, CRUD, CVD, CI)

### Abstract (~200 words, one paragraph)

Points to cover:
- **Problem:** proprietary cloud storage gives users little control over privacy, cost and where their data lives.
- **Solution:** OpenVault, a GPL-3.0 web application anyone can host on their own server.
- **Key features:** encrypted storage (AES-256-GCM), share links with password and expiry, sharing with users (view/edit), file versioning, scheduled backups with one-click restore, storage dashboard, admin panel.
- **Technology:** FastAPI, SQLAlchemy, APScheduler, React, Docker.
- **Result:** a working system verified by 113 automated tests and end-to-end UI tests.

---

## Chapter 1: Introduction

| Section | Content | Source in repo |
|---|---|---|
| 1.1 Background | Growth of cloud storage; dependence on a few providers | — |
| 1.2 Motivation | Privacy, vendor lock-in, recurring cost, data sovereignty; why open source | `README.md` |
| 1.3 Objectives | The 9 features as measurable objectives | `README.md` → Features |
| 1.4 Scope | What is included (single server, web UI) and not included (desktop sync client, mobile apps, end-to-end encryption) | — |
| 1.5 Organisation of the report | One line per chapter | — |

## Chapter 2: Literature survey

- **2.1 Existing systems.** One paragraph each on Google Drive, Dropbox, Nextcloud, Seafile and Syncthing.
- **Table 2.1, feature comparison.** Columns: open source, self-hosted, encryption at rest, versioning, scheduled backups, share links with password, licence. Fill it in from each product's official documentation.
- **2.2 Technologies studied:**
  - authenticated encryption (AES-GCM, NIST SP 800-38D);
  - password hashing (bcrypt);
  - token authentication (JWT, RFC 7519);
  - REST APIs.
- **2.3 Open source licences:** GPL-3.0 vs MIT vs Apache-2.0, and why we chose GPL-3.0 (copyleft keeps derivatives open).
- **2.4 Summary of gaps:** proprietary tools can't be self-hosted. Big open source suites (Nextcloud) are heavy to install and hard for students to understand. The gap is a small, readable, auditable alternative.

## Chapter 3: Problem statement

- A clear problem statement (3–4 lines).
- **Functional requirements:** auth, file CRUD, folders, sharing, versioning, backups, dashboard, admin.
- **Non-functional requirements:** security, usability, responsiveness, accessibility, portability (Docker), maintainability (tests).
- **Hardware/software requirements table:** Python 3.12, Node 22, any OS with Docker; 2 GB RAM minimum.

## Chapter 4: Proposed system

- **4.1 Architecture overview:** Fig. 4.1 system architecture → `docs/architecture.md` §1.
- **4.2 Approaches considered:** REST + SPA vs server-rendered vs microservices, and why REST + SPA was chosen (Table 4.1).
- **4.3 Modules:** one subsection per module, each with its purpose, main API endpoints and key decisions:
  - authentication;
  - file management;
  - encryption;
  - sharing;
  - versioning;
  - backups;
  - dashboard and activity;
  - administration.
- **4.4 Open source workflow:** Git branching, issues and PR templates, CONTRIBUTING, Code of Conduct, CI pipeline (`.github/`).

## Chapter 5: Design

Copy the diagrams from `docs/architecture.md` (render them on GitHub or at https://mermaid.live and export PNG):

| Figure | Section in `architecture.md` |
|---|---|
| Fig. 5.1 System architecture | §1 |
| Fig. 5.2 Backend layers | §2 |
| Fig. 5.3 ER diagram | §3 |
| Fig. 5.4 Use-case diagram | §4 |
| Fig. 5.5 DFD level 0 / Fig. 5.6 DFD level 1 | §10 |
| Fig. 5.7 Backup sequence diagram | §5 |
| Fig. 5.8 Upload & encryption sequence diagram | §6 |
| Fig. 5.9 Authentication sequence diagram | §7 |
| Table 5.1 Database tables and columns | `backend/app/models.py` |
| Table 5.2 REST API endpoints | `http://localhost:8000/docs` (Swagger UI) |

Also describe the UI design system: colour tokens, light/dark themes, typography (`frontend/src/index.css`).

## Chapter 6: Implementation

- **6.1 Technology stack** (Table 6.1), with reasons → `architecture.md` §9.
- **6.2 Project structure** → `CLAUDE.md` / `README.md`.
- **6.3 Key code** (short, commented snippets):
  - password hashing and JWT → `backend/app/security.py`;
  - chunked AES-GCM encryption → `backend/app/storage/crypto.py`;
  - permission check → `backend/app/services/access.py`;
  - backup run and restore → `backend/app/services/backup_service.py`;
  - scheduler sync → `backend/app/scheduler.py`;
  - upload queue with progress → `frontend/src/context/UploadContext.jsx`.
- **6.4 Screenshots** (Fig. 6.x) → `docs/screenshots/`: landing, login, files grid and list, preview, share dialog, version history, backups, dashboard, admin, mobile, dark mode.
- **6.5 Deployment:** Docker Compose, environment variables → `docker-compose.yml`, `.env.example`.

## Chapter 7: Results and testing

- **7.1 Testing strategy:** unit tests (encryption), API tests (FastAPI TestClient with a temporary database), end-to-end UI tests (Playwright).
- **Table 7.1, test summary:** run `pytest -v` and group the results by file.

  | Test file | Area | Tests |
  |---|---|---|
  | test_auth.py | Registration, login, JWT, profile | 13 |
  | test_crypto.py | Encryption round-trip, tampering, truncation | 13 |
  | test_files.py | Upload, folders, trash, access control | 26 |
  | test_shares.py | Links, passwords, expiry, user shares | 17 |
  | test_versions.py | History, restore, permissions | 7 |
  | test_backups.py | Schedules, runs, retention, restore | 13 |
  | test_dashboard.py / test_admin.py | Statistics, admin panel | 16 |
  | test_config.py / test_database.py | Secrets, PostgreSQL compatibility | 8 |

- **Table 7.2, sample test cases:** columns ID, description, input, expected, actual, status. Use the test names as descriptions, e.g. "Wrong link password returns 401".
- **7.3 Security verification:** a stored file contains no plaintext; tampering is detected; other users get 404.
- **7.4 Performance (optional):** time to upload and download 10 / 100 MB files on your machine.

## Chapter 8: Conclusion

What was achieved against each objective from Chapter 1, and what the team learned (open source workflow, security, full-stack development).

## Chapter 9: Future scope

- End-to-end (client-side) encryption, so the server never sees plaintext
- Desktop and mobile sync clients (like the Dropbox app)
- MinIO / S3 storage backend (the interface already exists in `storage/base.py`)
- Two-factor authentication (TOTP) and rate limiting on logins
- Database migrations with Alembic
- Background workers (Celery) for very large backups; incremental and deduplicated backups
- Full-text search inside documents, and thumbnails for PDFs and videos
- Real-time collaboration and notifications (WebSockets)

## References (IEEE style)

1. M. Dworkin, "Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM) and GMAC," NIST SP 800-38D, 2007.
2. N. Provos and D. Mazières, "A Future-Adaptable Password Scheme," in *Proc. USENIX Annual Technical Conference*, 1999.
3. M. Jones, J. Bradley and N. Sakimura, "JSON Web Token (JWT)," RFC 7519, IETF, 2015.
4. Free Software Foundation, "GNU General Public License v3.0," 2007. [Online]. Available: https://www.gnu.org/licenses/gpl-3.0.html
5. OWASP Foundation, "OWASP Top 10: 2021," 2021. [Online]. Available: https://owasp.org/Top10/
6. S. Ramírez, "FastAPI documentation." [Online]. Available: https://fastapi.tiangolo.com
7. SQLAlchemy authors, "SQLAlchemy 2.0 documentation." [Online]. Available: https://docs.sqlalchemy.org
8. A. Grönholm, "APScheduler documentation." [Online]. Available: https://apscheduler.readthedocs.io
9. Meta Open Source, "React documentation." [Online]. Available: https://react.dev
10. Nextcloud GmbH, "Nextcloud documentation." [Online]. Available: https://docs.nextcloud.com
11. Seafile Ltd., "Seafile documentation." [Online]. Available: https://manual.seafile.com

> Check every reference against the original source before submitting, and add the papers your team actually read during the literature survey.
