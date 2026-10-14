# OpenVault: architecture

This document explains how OpenVault is built. The diagrams are written in [Mermaid](https://mermaid.js.org/), which GitHub renders automatically.

- [1. System architecture](#1-system-architecture)
- [2. Backend layers](#2-backend-layers)
- [3. Database design (ER diagram)](#3-database-design-er-diagram)
- [4. Use-case diagram](#4-use-case-diagram)
- [5. Backup flow](#5-backup-flow)
- [6. Upload and encryption flow](#6-upload-and-encryption-flow)
- [7. Authentication and download links](#7-authentication-and-download-links)
- [8. Security design summary](#8-security-design-summary)
- [9. Technology choices](#9-technology-choices)
- [10. Data flow diagrams](#10-data-flow-diagrams)

---

## 1. System architecture

OpenVault is a **REST API plus single-page application**. The browser loads a React app, which talks to a FastAPI backend over JSON. In production (Docker), **nginx** serves the React files and forwards `/api/*` to the backend, so the browser only ever talks to one origin.

```mermaid
flowchart TB
    subgraph Clients
        U["Logged-in user<br/>(browser)"]
        G["Guest with a share link<br/>(browser)"]
    end

    subgraph Frontend container
        N["nginx<br/>serves React build<br/>proxies /api"]
    end

    subgraph Backend container
        API["FastAPI app<br/>(routers)"]
        SVC["Services<br/>files · sharing · backups · quota · activity"]
        SCH["APScheduler<br/>(background thread)"]
        ENC["EncryptedStorage<br/>AES-256-GCM"]
        LOC["LocalStorage<br/>(StorageBackend interface)"]
    end

    DB[("Database<br/>SQLite or PostgreSQL")]
    DISK[("Volume /app/data<br/>encrypted blobs")]

    U -- HTTPS --> N
    G -- HTTPS --> N
    N -- "/api/*" --> API
    API --> SVC
    SCH -- "daily / weekly jobs" --> SVC
    SVC -- SQLAlchemy ORM --> DB
    SVC --> ENC --> LOC --> DISK
```

| Part | Technology | Responsibility |
|---|---|---|
| Frontend | React (Vite), Tailwind, shadcn/ui | All screens; talks to the API with axios |
| Reverse proxy | nginx | Serves static files, forwards `/api`, streams uploads |
| API | FastAPI | Validates requests (Pydantic), checks auth, calls services |
| Scheduler | APScheduler | Runs backup jobs at their scheduled time |
| Storage | `StorageBackend` + `EncryptedStorage` | Stores every file encrypted; MinIO/S3 can be added later |
| Database | SQLAlchemy → SQLite / PostgreSQL | Users, files, versions, shares, backups, activity log |

---

## 2. Backend layers

Each layer only talks to the layer below it. This keeps routes short and makes the logic easy to test.

```mermaid
flowchart LR
    R["routers/<br/>HTTP: URLs, status codes,<br/>request/response schemas"] --> S["services/<br/>business rules:<br/>permissions, quota, trash,<br/>versions, sharing, backups"]
    S --> M["models.py<br/>SQLAlchemy tables"]
    S --> ST["storage/<br/>EncryptedStorage → LocalStorage"]
    R -. "Depends()" .-> SEC["security.py<br/>bcrypt · JWT ·<br/>get_current_user"]
```

| Folder / file | What it contains |
|---|---|
| `app/config.py` | Settings read from `.env` (refuses weak or missing secrets) |
| `app/models.py` | The 9 database tables |
| `app/schemas.py` | Request/response shapes (no password hashes can leak) |
| `app/security.py` | Password hashing, JWT creation/verification, auth dependencies |
| `app/routers/` | `auth`, `users`, `folders`, `files`, `trash`, `shares`, `public`, `backups`, `dashboard`, `admin` |
| `app/services/` | `file_service`, `access` (permissions), `share_service`, `backup_service`, `quota`, `activity`, `stats` |
| `app/storage/` | `base.py` (interface), `local.py` (disk), `crypto.py` (AES-GCM) |
| `app/scheduler.py` | Starts APScheduler and keeps it in sync with the `backup_jobs` table |

---

## 3. Database design (ER diagram)

```mermaid
erDiagram
    USERS ||--o{ FOLDERS : owns
    USERS ||--o{ FILES : owns
    FOLDERS ||--o{ FOLDERS : "contains (parent_id)"
    FOLDERS ||--o{ FILES : contains
    FILES ||--|{ FILE_VERSIONS : "has versions"
    FILES ||--o{ SHARE_LINKS : "shared by link"
    FOLDERS ||--o{ SHARE_LINKS : "shared by link"
    FILES ||--o{ USER_SHARES : "shared with user"
    FOLDERS ||--o{ USER_SHARES : "shared with user"
    USERS ||--o{ USER_SHARES : "receives"
    USERS ||--o{ BACKUP_JOBS : schedules
    FOLDERS |o--o{ BACKUP_JOBS : "backed up by"
    BACKUP_JOBS ||--o{ BACKUP_RUNS : produces
    USERS ||--o{ ACTIVITY_LOGS : performs

    USERS {
        int id PK
        string email UK
        string name
        string password_hash "bcrypt"
        bool is_admin
        bool is_active
        bigint quota_bytes
        string theme "light / dark / system"
        datetime created_at
    }
    FOLDERS {
        int id PK
        int owner_id FK
        int parent_id FK "NULL = top level"
        string name
        datetime deleted_at "NULL = not in Trash"
    }
    FILES {
        int id PK
        int owner_id FK
        int folder_id FK "NULL = top level"
        string name
        string mime_type
        bigint size "current version"
        datetime updated_at
        datetime deleted_at
    }
    FILE_VERSIONS {
        int id PK
        int file_id FK
        int version_no
        string storage_key UK "random blob name"
        bigint size
        string sha256
        int created_by FK
    }
    SHARE_LINKS {
        int id PK
        string token UK "192-bit random"
        int file_id FK
        int folder_id FK
        int created_by FK
        string password_hash "optional"
        datetime expires_at "optional"
        int download_count
    }
    USER_SHARES {
        int id PK
        int file_id FK
        int folder_id FK
        int owner_id FK
        int target_user_id FK
        string permission "view / edit"
    }
    BACKUP_JOBS {
        int id PK
        int owner_id FK
        int folder_id FK "NULL = all files"
        string name
        string frequency "daily / weekly"
        int hour
        int minute
        int weekday "0 = Monday"
        int retention
        bool enabled
    }
    BACKUP_RUNS {
        int id PK
        int job_id FK
        int owner_id FK
        string status "running / success / failed"
        string trigger "scheduled / manual"
        int file_count
        bigint size
        string storage_key
        string error
    }
    ACTIVITY_LOGS {
        int id PK
        int user_id FK
        string action "e.g. file.upload"
        string target_type
        int target_id
        string target_name
        string details
        string ip_address
        datetime created_at
    }
```

**Design notes**
- **Soft delete:** "Move to Trash" only sets `deleted_at`. Trashing a folder stamps the *same* time on everything inside, so Restore brings back exactly that group.
- **Current version:** there is no `current_version_id` column. The current version is simply the one with the highest `version_no`, which avoids a circular foreign key.
- **Cascades:** every `owner_id` foreign key uses `ON DELETE CASCADE`, so deleting a user removes all of their rows. Their encrypted blobs are removed from disk after the commit.
- **Times** are stored as UTC.

---

## 4. Use-case diagram

Mermaid has no UML use-case diagram, so actors and use cases are drawn as a flowchart.

```mermaid
flowchart LR
    Guest(["👤 Guest<br/>(no account)"])
    User(["👤 Registered user"])
    Admin(["👤 Administrator"])
    Clock(["⏰ Scheduler"])

    subgraph OpenVault
        UC1(["Register / log in"])
        UC2(["Upload, download, preview files"])
        UC3(["Create, rename, move folders"])
        UC4(["Trash & restore"])
        UC5(["Create share link<br/>(password, expiry)"])
        UC6(["Share with user<br/>(view / edit)"])
        UC7(["Open shared link"])
        UC8(["View & restore versions"])
        UC9(["Schedule / run / restore backups"])
        UC10(["View dashboard & activity"])
        UC11(["Manage users & quotas"])
        UC12(["View system audit log"])
        UC13(["Run scheduled backup"])
    end

    Guest --> UC1
    Guest --> UC7
    User --> UC2 & UC3 & UC4 & UC5 & UC6 & UC8 & UC9 & UC10
    Admin --> UC11 & UC12
    Admin -. "is also a" .-> User
    Clock --> UC13
```

---

## 5. Backup flow

```mermaid
sequenceDiagram
    autonumber
    participant S as APScheduler<br/>(or "Run now")
    participant B as backup_service
    participant DB as Database
    participant E as EncryptedStorage

    S->>B: run_scheduled_backup(job_id)
    B->>DB: create BackupRun (status = running)
    B->>DB: list files in the folder tree
    loop every file
        B->>E: get(storage_key) → decrypt chunk by chunk
        B->>B: write into temporary zip under files/
    end
    B->>B: add manifest.json (path, size, SHA-256)
    B->>DB: check storage quota
    B->>E: put(zip) → encrypt + store
    B->>DB: BackupRun status = success (or failed + error)
    B->>DB: delete runs beyond retention
    B->>DB: write activity log
```

**Restore:** decrypt the zip into a temporary file, create a new top-level folder `Restored – <job> – <date>`, re-encrypt every file as a new blob, and compare its SHA-256 with the manifest. If any checksum differs, the restore is cancelled and every blob created so far is deleted. Existing files are never overwritten.

```mermaid
flowchart LR
    A[Choose a backup] --> B{status = success?}
    B -- no --> X[400: only successful backups]
    B -- yes --> C[Decrypt zip to temp file]
    C --> D[Create 'Restored – …' folder]
    D --> E[For each file: re-encrypt,<br/>check SHA-256]
    E -- mismatch --> F[Delete new blobs,<br/>422 'backup is damaged']
    E -- all match --> G[Commit → files appear]
```

---

## 6. Upload and encryption flow

```mermaid
sequenceDiagram
    participant UI as React (UploadContext)
    participant API as files router
    participant FS as file_service
    participant E as EncryptedStorage
    participant D as Disk

    UI->>API: POST /api/files/upload (multipart, progress events)
    API->>FS: upload_file(owner, folder, file)
    FS->>FS: check name, size limit and quota
    FS->>E: put(stream)
    loop each 1 MB chunk
        E->>E: AES-256-GCM encrypt (random nonce,<br/>AAD = key + index + is_last)
        E->>D: append [length][nonce][ciphertext+tag]
    end
    E-->>FS: storage_key, size, sha256
    FS->>FS: same name exists? → new version, else new file
    API-->>UI: 201 FileOut
```

**Encrypted file format (one record per 1 MB chunk):**

```
[4-byte length L][12-byte random nonce][L bytes: ciphertext + 16-byte GCM tag]
```

The *associated data* of each chunk is `storage_key + chunk index + is_last flag`. Changing a byte, swapping chunks between files, reordering chunks or cutting the file short all make decryption fail. Each case has a test in `tests/test_crypto.py`.

---

## 7. Authentication and download links

```mermaid
sequenceDiagram
    participant B as Browser
    participant A as API

    B->>A: POST /api/auth/login {email, password}
    A->>A: bcrypt.checkpw(password, hash)
    A-->>B: access_token (JWT, 60 min)
    B->>A: GET /api/folders/contents<br/>Authorization: Bearer TOKEN
    A->>A: verify signature + expiry + type = "access"
    A-->>B: folder listing
    Note over B,A: img and video tags cannot send headers, so
    B->>A: POST /api/files/7/links (with Bearer token)
    A-->>B: /api/files/7/content?token=JWT (type file, 5 min, only file 7)
    B->>A: GET that URL (no header needed)
```

| Token type | Lifetime | Used for |
|---|---|---|
| `access` | 60 min | Every API call of a logged-in user |
| `file` | 5 min | One file's preview/download URL |
| `backup` | 5 min | Downloading one backup .zip |
| `share` | 60 min | Unlocking one password-protected link (dies when the password changes) |

---

## 8. Security design summary

| Threat | Protection |
|---|---|
| Stolen database | Passwords are bcrypt hashes (salted, slow) |
| Stolen disk / server backups | Files are AES-256-GCM encrypted at rest; the key lives only in `.env` |
| Tampered stored files | GCM authentication tag, plus chunks bound to their file and position |
| Guessing share links | 192-bit random tokens (`secrets.token_urlsafe(24)`) |
| Brute-forcing link passwords | bcrypt makes each guess slow; links can expire |
| Reading other users' files | Every route checks `owner / edit / view` (`services/access.py`) and returns 404 for no access |
| Stored XSS via uploaded HTML/SVG | Shown as text or download only, with `X-Content-Type-Options: nosniff` |
| Path traversal in storage | Blob names must be 32 hex characters; user file names never reach the disk |
| Account enumeration | Same error and same bcrypt timing for wrong email and wrong password |
| Weak deployment secrets | The server refuses to start with placeholder or short keys |
| Admin lockout | Admins cannot disable, demote or delete themselves |

---

## 9. Technology choices

| Need | Chosen | Why (vs. alternatives) |
|---|---|---|
| Web framework | **FastAPI** | Automatic validation and API docs at `/docs`; faster to build than Django REST for an API-only backend |
| ORM | **SQLAlchemy 2.0** | Same code on SQLite (development) and PostgreSQL (production) |
| Scheduler | **APScheduler** | Runs inside the API process; Celery + Redis would add two more services for little gain at this scale |
| Encryption | **AES-256-GCM** (`cryptography`) | Authenticated encryption detects tampering; AES-CBC alone would not |
| Passwords | **bcrypt** | Purpose-built slow hash with salt; SHA-256 is too fast for passwords |
| Frontend | **React + Vite** | Component model, fast dev server; shadcn/ui gives accessible components we own the code of |
| Deployment | **Docker Compose** | One command to run nginx + API (+ PostgreSQL) anywhere |

---

## 10. Data flow diagrams

**Level 0 (context diagram):** OpenVault as one process and the outside entities it exchanges data with.

```mermaid
flowchart LR
    U[User] -- "credentials, files,<br/>share & backup settings" --> P((OpenVault<br/>system))
    P -- "files, previews, links,<br/>dashboard, notifications" --> U
    G[Guest] -- "share link, password" --> P
    P -- "shared file / folder" --> G
    A[Administrator] -- "quota & account changes" --> P
    P -- "user list, audit log" --> A
    P <-- "encrypted blobs" --> S[(File storage)]
    P <-- "records" --> D[(Database)]
```

**Level 1:** the main processes inside the system.

```mermaid
flowchart TB
    U[User] --> P1((1. Authenticate))
    P1 <--> D1[(D1 users)]
    P1 -- JWT --> U

    U -- file --> P2((2. Manage files<br/>& folders))
    P2 <--> D2[(D2 files, folders,<br/>versions)]
    P2 <-- "encrypt / decrypt" --> S[(Encrypted storage)]

    U -- "share settings" --> P3((3. Share))
    P3 <--> D3[(D3 share links,<br/>user shares)]
    G[Guest] -- token --> P3
    P3 -- file --> G

    T[Scheduler] --> P4((4. Back up<br/>& restore))
    U -- "schedule, restore" --> P4
    P4 <--> D4[(D4 backup jobs, runs)]
    P4 <--> S
    P4 --> D2

    P2 & P3 & P4 --> P5((5. Log activity))
    P5 --> D5[(D5 activity log)]
    A[Administrator] --> P6((6. Administer))
    P6 <--> D1
    P6 --> D5
```