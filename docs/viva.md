# Viva preparation: 25 likely questions

Short answers based on **our actual code**. Each answer names the file to open if the examiner asks to see it. Practise explaining them in your own words, and make sure every member can answer every question, not just the ones about their own module.

---

### Project & open source

**1. What is OpenVault, and why did you make it open source?**
A self-hostable web app for storing, sharing and backing up files: an alternative to Google Drive or Dropbox that runs on your own server. It is open source under **GPL-3.0**, so anyone can read, audit and improve the code. Trust matters for a privacy tool, and anyone can check that we really encrypt files.

**2. Why GPL-3.0 and not MIT?**
GPL-3.0 is *copyleft*: anyone who distributes a modified version must also release their changes under GPL-3.0, so improvements stay open. MIT lets others make closed-source versions. The licence text is in `LICENSE`.

**3. What architecture did you choose, and why?**
A **REST API (FastAPI) plus a single-page app (React)**. We also considered server-rendered pages (Jinja/HTMX) and microservices with Celery/Redis. The SPA gives the modern UI we needed (drag-and-drop, previews, animations). Microservices would add Redis, a worker and several containers for no real benefit at our scale. See `docs/architecture.md` §1 and §9.

### Authentication & security

**4. How are passwords stored?**
They are never stored in plain text. `hash_password()` in `backend/app/security.py` uses **bcrypt** with a random salt, so two users with the same password get different hashes, and bcrypt is deliberately slow, which makes guessing expensive. bcrypt only reads 72 bytes, so `schemas.py` rejects longer passwords instead of silently cutting them.

**5. What is a JWT, and what does ours contain?**
A JSON Web Token is a signed piece of JSON. Ours contains `sub` (user id), `type`, `iat` (issued at) and `exp` (expiry), signed with **HS256** using `SECRET_KEY`. The server can verify it without a database lookup of sessions. `create_token()` and `decode_token()` are in `security.py`, and `get_current_user()` is the FastAPI dependency that protects routes.

**6. Why does the token have a `type` field?**
We issue several kinds of token: `access` (login, 60 min), `file` (one download link, 5 min), `backup` and `share`. `decode_token(token, expected_type)` rejects the wrong kind, so a leaked 5-minute download link can never be used as a login. This is tested in `test_expired_and_wrong_type_tokens_rejected`.

**7. How do you stop users from seeing each other's files?**
Every route loads items through `get_file()` / `get_folder()` in `services/file_service.py` with a required level (`view`, `edit` or `owner`). The level comes from `services/access.py`: you own the item, or it (or a folder above it) is shared with you. With **no** access we return **404, not 403**, so an attacker can't even learn that an id exists. `test_users_cannot_touch_each_others_items` checks six routes.

**8. An `<img>` tag can't send the Authorization header. How do previews work?**
The frontend first calls `POST /api/files/{id}/links` (authenticated), which returns a URL containing a **5-minute JWT that is valid for that one file only**. The `<img>`, `<video>` or download uses that URL. See `make_file_links()` in `routers/files.py`.

**9. A user uploads an HTML file with JavaScript. Is that dangerous?**
It would be stored XSS if the browser ran it on our domain. `_response_type()` in `routers/files.py` only shows images, PDFs, audio and video inline. All text, including HTML, is sent as `text/plain`, SVG is download-only, and every response has `X-Content-Type-Options: nosniff` so the browser can't guess a different type. Tested in `test_html_is_never_rendered_inline`.

### Encryption & storage

**10. How are files encrypted at rest?**
With **AES-256-GCM** from the `cryptography` library, in `backend/app/storage/crypto.py`. Each file is split into **1 MB chunks**. Each chunk gets a fresh random 12-byte nonce and is stored as `[length][nonce][ciphertext + 16-byte tag]`. The 32-byte key comes from `ENCRYPTION_KEY` in `.env`.

**11. Why GCM and not AES-CBC? What is the "associated data"?**
GCM is *authenticated encryption*: the tag detects any modification, while CBC alone would silently decrypt tampered data into garbage. As associated data we add `storage_key + chunk index + is_last flag`. That way chunks can't be reordered, swapped between files, or the file cut short without decryption failing. `test_crypto.py` has a test for each attack.

**12. Why encrypt in chunks instead of the whole file?**
Memory and streaming. A 100 MB upload is never fully in RAM, and downloads are decrypted and sent chunk by chunk (`EncryptedStorage.get()` is a generator used by `StreamingResponse`).

**13. What happens if the encryption key is lost or changed?**
All stored files become unreadable. Decryption fails with `CorruptedFileError`, which `test_wrong_key_cannot_decrypt` checks. That's why `.env.example` warns about it, and why the key must be backed up separately from the data. The server also refuses to start if the key isn't valid base64 of exactly 32 bytes (`config.py`).

**14. How could you switch to MinIO / Amazon S3?**
`storage/base.py` defines the abstract class `StorageBackend` with `save`, `open`, `delete` and `exists`. `LocalStorage` implements it today. We would write `MinIOStorage(StorageBackend)` and use it in `storage/__init__.py`. The encryption layer and all routes stay unchanged.

### Files, versions & trash

**15. How does versioning work?**
Each upload stores a new blob and a `FileVersion` row (`version_no`, `size`, `sha256`). Uploading a name that already exists in the folder adds a version instead of a new file (`upload_file()`). The current version is simply the newest one. Only `MAX_VERSIONS` (default 10) are kept: `add_version()` deletes the oldest.

**16. How does restoring an old version work without losing data?**
`restore_version()` **copies** the old version as a new, latest version, so nothing is overwritten and the restore itself can be undone. Because chunks are tied to their storage key, the copy is decrypted and re-encrypted (`EncryptedStorage.copy()`).

**17. How does the Trash work?**
It's a *soft delete*: `deleted_at` is set instead of removing rows. Trashing a folder stamps the **same timestamp** on everything inside it (`trash_folder()`), so Restore brings back exactly that group. Items deleted separately earlier stay in the Trash. Blobs are deleted only on "Delete forever" or "Empty Trash".

**18. Why are blobs deleted only after the database commit?**
If we deleted the file first and the commit then failed, the database would point to a missing file. `delete_blob_after_commit()` parks the keys in the session, and an SQLAlchemy `after_commit` event deletes them only once the transaction has succeeded (`services/file_service.py`).

### Sharing

**19. How are share links made secure?**
- **Unguessable token:** `secrets.token_urlsafe(24)`, 192 bits from a cryptographically secure source.
- **Optional password:** stored as a bcrypt hash.
- **Optional expiry:** an expired link returns **410 Gone**.
- **Unlocking:** entering the correct password returns a 60-minute unlock token containing a fingerprint of the password hash, so changing the password immediately locks out earlier visitors.
- **Containment:** folder links can never reach outside the shared folder (`public_folder()` / `public_file()` in `services/share_service.py`).

**20. What is the difference between view and edit permission?**
**View:** browse, preview, download, see version history. **Edit:** also rename, upload (including new versions) and create sub-folders. Moving, deleting and re-sharing stay with the owner, so a collaborator can never destroy the owner's data. Files uploaded into a shared folder belong to the folder's owner and use **their** quota.

### Backups

**21. How do scheduled backups work?**
APScheduler's `BackgroundScheduler` runs inside the API process (`app/scheduler.py`). Each enabled `BackupJob` becomes a `CronTrigger`, for example daily at 02:00 UTC or weekly on a weekday. `sync_job()` updates the scheduler whenever a job is created, edited or paused.
- `coalesce=True` runs missed backups only once.
- `max_instances=1` prevents overlapping runs.
- `misfire_grace_time` still runs a backup if the server was briefly down.

Times are stored in UTC, and the UI converts them to and from local time (`frontend/src/lib/schedule.js`).

**22. What is inside a backup, and how is a restore verified?**
An encrypted zip with every file under `files/<path>` (including empty folders) plus a `manifest.json` holding each file's size and **SHA-256**. Restore unpacks into a **new** folder, `Restored – <job> – <date>`, and compares every checksum. On any mismatch it deletes what it created and returns "backup is damaged". Existing files are never overwritten (`backup_service.restore_run()`).

**23. What if the server restarts in the middle of a backup?**
At startup, `recover_interrupted_runs()` marks every run still in `running` state as `failed` with "Interrupted because the server stopped", so nothing hangs forever. Retention keeps the newest *N* **successful** backups plus 10 failed ones, so a run of failures can never push out your good backups.

### Frontend, testing & deployment

**24. How does the frontend manage data and uploads?**
- **Server data:** TanStack Query caches it under keys like `["folder", id]` and `["me"]`. After a change we *invalidate* the key and it refetches automatically, and its loading state drives the skeleton loaders.
- **App-wide state:** React contexts handle it: `AuthContext` (JWT in localStorage), `ThemeContext` (light/dark, saved to the account) and `UploadContext`.
- **Uploads:** react-dropzone captures files dropped anywhere on the page. Axios's `onUploadProgress` feeds the per-file progress bars, and a promise chain uploads one file at a time.

**25. How did you test it, and how is it deployed?**
- **Backend tests:** 113 pytest tests (`backend/tests/`), using FastAPI's `TestClient`. `conftest.py` sets environment variables to a temporary database and storage folder *before* importing the app, so tests never touch real data. They cover unit tests (crypto), API tests, permission tests and failure cases.
- **UI tests:** the UI was also checked end-to-end with Playwright (register → upload → share with password → download as a guest).
- **Deployment:** `docker compose up -d` runs two containers. **nginx** serves the React build and proxies `/api`, and the **backend** runs as a non-root user with a health check and a volume for data. PostgreSQL is optional via a compose profile.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) runs the tests, lint and Docker builds on every push.

---

## Quick facts to remember

| Thing | Value |
|---|---|
| Encryption | AES-256-GCM, 1 MB chunks, 12-byte nonce, 16-byte tag |
| Password hashing | bcrypt (salted), max 72 bytes |
| Login token | JWT HS256, 60 minutes |
| Download link token | JWT, 5 minutes, one file only |
| Share link token | 32 characters = 192 random bits |
| Versions kept | 10 per file (`MAX_VERSIONS`) |
| Default quota | 1 GB per user (`DEFAULT_QUOTA_MB`) |
| Database tables | 9 |
| Automated tests | 113 backend tests |
| Licence | GPL-3.0 |

> **Demo tip:** open `http://localhost:8000/docs` to show the auto-generated API documentation (Swagger UI), and open a stored blob in a hex viewer (`backend/data/storage/blobs/..`) to prove it's encrypted.
