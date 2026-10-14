# Project logbook

**Project:** OpenVault, a file sharing and backup application
**Subject:** ITL704 Recent Open Source Project Lab, Sem VII (IT), University of Mumbai
**Guide:** _Prof. ___________________
**Group no.:** ___

| Roll no. | Name | Role |
|---|---|---|
| | M1: | Backend core & security |
| | M2: | Storage, encryption & backups |
| | M3: | Frontend |
| | M4: | Sharing, QA, DevOps & documentation |

---

## How to fill this logbook

- Write **one entry per week**, on the day you meet your guide.
- **Work done** lists what was finished, with evidence (commit IDs, screenshots, test results).
- **Plan for next week** should match the [Gantt chart](gantt.md).
- Leave **Guide's remarks** and **Signature** for the guide.
- Tip: `git log --since="1 week ago" --oneline` lists the week's commits.

### Blank template (copy for each week)

| Field | Entry |
|---|---|
| **Week no. / Date** | |
| **Work done** | |
| **Contribution (M1 / M2 / M3 / M4)** | M1: <br> M2: <br> M3: <br> M4: |
| **Problems faced & solutions** | |
| **Plan for next week** | |
| **Guide's remarks** | |
| **Guide's signature** | |

---

## Sample entries

### Week 1 (24 Jul 2026)

| Field | Entry |
|---|---|
| **Work done** | Finalised the topic "File Sharing and Backup Application". Studied Google Drive, Dropbox, Nextcloud and Seafile. Compared features: open source, self-hosting, encryption at rest, versioning, scheduled backups. |
| **Contribution** | M1: survey of Nextcloud & Seafile <br> M2: survey of encryption methods (AES-CBC vs AES-GCM) <br> M3: UI survey of Drive / Dropbox, moodboard <br> M4: comparison table, started logbook |
| **Problems faced & solutions** | Too many possible features → limited scope to 9 core features agreed with the guide. |
| **Plan for next week** | Requirements, architecture, ER and use-case diagrams; synopsis. |
| **Guide's remarks** | |

### Week 2 (31 Jul 2026)

| Field | Entry |
|---|---|
| **Work done** | Compared 3 architectures (REST API + SPA, server-rendered, microservices) and chose REST API + React SPA. Drew system architecture, ER diagram and use-case diagram (`docs/architecture.md`). Submitted synopsis. |
| **Contribution** | M1: ER diagram <br> M2: backup flow design <br> M3: wireframes <br> M4: synopsis document |
| **Problems faced & solutions** | Unsure how to store multiple versions → one `file_versions` row per upload; the current version is the newest. |
| **Plan for next week** | Repository setup, configuration, database models. |
| **Guide's remarks** | |

### Week 3 (7 Aug 2026)

| Field | Entry |
|---|---|
| **Work done** | Created the GitHub repository with GPL-3.0 licence, README, CONTRIBUTING, CODE_OF_CONDUCT and issue templates. Wrote `config.py` (settings from `.env`), `database.py` and all 9 SQLAlchemy models. |
| **Contribution** | M1: models & config <br> M2: storage folder layout <br> M3: Vite + Tailwind setup <br> M4: open source files, `.env.example` |
| **Problems faced & solutions** | SQLite ignores `ON DELETE CASCADE` by default → enabled `PRAGMA foreign_keys=ON` in `database.py`. |
| **Plan for next week** | Registration and login with bcrypt + JWT, first pytest tests. |
| **Guide's remarks** | |

### Week 4 (14 Aug 2026)

| Field | Entry |
|---|---|
| **Work done** | Implemented register, login, `/auth/me`, profile update and password change. 13 pytest tests pass. |
| **Contribution** | M1: auth routes & `security.py` <br> M4: auth tests <br> M2, M3: reviewed code |
| **Problems faced & solutions** | bcrypt ignores bytes beyond 72 → passwords longer than 72 bytes are rejected with a clear message. |
| **Plan for next week** | Encrypted storage layer. |
| **Guide's remarks** | |

### Week 5 (21 Aug 2026)

| Field | Entry |
|---|---|
| **Work done** | `StorageBackend` interface, `LocalStorage`, and `EncryptedStorage` using AES-256-GCM in 1 MB chunks. Tests for tampering, truncation and wrong key. |
| **Contribution** | M2: crypto layer <br> M1: review of the crypto design <br> M4: crypto unit tests |
| **Problems faced & solutions** | Chunks could be copied between files → added the storage key to each chunk's associated data. |
| **Plan for next week** | Upload, download, folders, Trash. |
| **Guide's remarks** | |

### Week 6 (28 Aug 2026)

| Field | Entry |
|---|---|
| **Work done** | Upload with quota check, streaming download, short-lived download links, folders with breadcrumbs, Trash with restore. 52 tests pass. |
| **Contribution** | M2: file service & routes <br> M4: tests <br> M1: access checks |
| **Problems faced & solutions** | `<img>` tags can't send the JWT header → added 5-minute per-file link tokens. |
| **Plan for next week** | Sharing (links + users), mid-term demo. |
| **Guide's remarks** | |

### Week 7 (4 Sep 2026)

| Field | Entry |
|---|---|
| **Work done** | Share links with optional password and expiry; sharing with users (view/edit); "Shared with me". Mid-term backend demo through Swagger UI (`/docs`). |
| **Contribution** | M4: share routes <br> M1: permission model in `access.py` <br> M2, M3: demo preparation |
| **Problems faced & solutions** | Changing a link password must log out old visitors → the unlock token contains a fingerprint of the password hash. |
| **Plan for next week** | Versioning; start frontend. |
| **Guide's remarks** | |

### Week 8 (11 Sep 2026)

| Field | Entry |
|---|---|
| **Work done** | Version history with non-destructive restore. Frontend design tokens (light/dark), landing page, login/register pages. |
| **Contribution** | M2: versions <br> M3: design system & pages <br> M4: version tests |
| **Problems faced & solutions** | Restoring by overwriting would lose history → restore copies the old version as a new one. |
| **Plan for next week** | Scheduled backups; files UI. |
| **Guide's remarks** | |

### Week 9 (18 Sep 2026)

| Field | Entry |
|---|---|
| **Work done** | Backup schedules with APScheduler, "Run now", encrypted zip snapshots with SHA-256 manifest, restore to a new folder, retention. App shell, grid/list views, drag-and-drop uploads. |
| **Contribution** | M2: backups <br> M3: files UI <br> M4: backup tests <br> M1: scheduler review |
| **Problems faced & solutions** | Times differ between server and users → schedules stored in UTC, shown in local time in the UI. |
| **Plan for next week** | Previews, share dialog, version drawer, backups page. |
| **Guide's remarks** | |

### Week 10 (25 Sep 2026)

| Field | Entry |
|---|---|
| **Work done** | Preview modal (images, PDF, video, text), share dialog, version drawer, Backups timeline, Trash, Settings and public share page. End-to-end UI test with Playwright. |
| **Contribution** | M3: UI <br> M4: end-to-end tests <br> M1, M2: API fixes found while testing |
| **Problems faced & solutions** | Uploaded HTML could run scripts → served as plain text with a `nosniff` header. |
| **Plan for next week** | Dashboard, activity log, admin panel. |
| **Guide's remarks** | |

### Week 11 (2 Oct 2026)

| Field | Entry |
|---|---|
| **Work done** | Dashboard with storage-by-type and upload charts, activity log, admin panel (users, quotas, disable, audit log). 105 tests pass. |
| **Contribution** | M1: admin API <br> M3: dashboard & admin UI <br> M4: tests <br> M2: stats service |
| **Problems faced & solutions** | An admin could lock everyone out → admins cannot disable, demote or delete themselves. |
| **Plan for next week** | Docker, CI, documentation, report. |
| **Guide's remarks** | |

### Week 12 (16 Oct 2026)

| Field | Entry |
|---|---|
| **Work done** | Dockerfiles, docker-compose (SQLite or PostgreSQL), GitHub Actions CI, architecture docs, report and viva preparation. Final demo. |
| **Contribution** | M4: Docker/CI/docs <br> M1–M3: report chapters and screenshots |
| **Problems faced & solutions** | |
| **Plan for next week** | (Project complete) |
| **Guide's remarks** | |
