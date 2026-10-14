# Project plan: 12-week Gantt chart

**Project:** OpenVault, a file sharing and backup application
**Course:** ITL704 Recent Open Source Project Lab, Sem VII (IT), University of Mumbai
**Team:** 4 members (replace the placeholders with your names and roll numbers)

| Member | Main responsibility | Also helps with |
|---|---|---|
| **M1**: _Name (Roll no.)_ | Backend core: database models, authentication (bcrypt + JWT), security, admin API | Code reviews, viva Q&A on security |
| **M2**: _Name (Roll no.)_ | Storage and encryption (AES-GCM), file/folder API, versioning, backups and scheduler | Backend tests |
| **M3**: _Name (Roll no.)_ | Frontend: design system, app layout, files UI, previews, dashboard charts | UI screenshots for the report |
| **M4**: _Name (Roll no.)_ | Sharing (API + UI), testing and QA, Docker + CI, documentation and report | Project management, logbook |

```mermaid
gantt
    title OpenVault: 12-week plan
    dateFormat YYYY-MM-DD
    axisFormat %d %b
    excludes weekends

    section Planning (all)
    Topic finalisation & literature survey      :done, p1, 2026-07-20, 5d
    Requirements, use cases, architecture       :done, p2, after p1, 5d
    Synopsis submission                         :milestone, m1, 2026-07-31, 0d

    section M1 · Backend core
    Project setup, config, DB models            :done, a1, 2026-08-03, 5d
    Registration, login, JWT, bcrypt            :done, a2, after a1, 5d
    Permission model (owner / edit / view)      :done, a3, 2026-08-31, 5d
    Admin API (users, quotas, audit log)        :done, a4, 2026-09-28, 5d

    section M2 · Storage & backups
    Storage interface + AES-256-GCM encryption  :done, b1, 2026-08-17, 5d
    Upload / download / folders / trash         :done, b2, after b1, 5d
    File versioning & restore                   :done, b3, 2026-09-07, 4d
    Scheduled backups (APScheduler) & restore   :done, b4, after b3, 6d

    section M3 · Frontend
    Design system, landing & auth pages         :done, c1, 2026-09-07, 5d
    App shell, files grid/list, uploads         :done, c2, after c1, 5d
    Previews, share dialog, versions, backups UI:done, c3, after c2, 5d
    Dashboard charts & admin panel UI           :done, c4, after c3, 5d

    section M4 · Sharing, QA & delivery
    Share links (password, expiry) + user shares:done, d1, 2026-08-31, 5d
    Test suite (pytest) & end-to-end UI checks  :done, d2, 2026-09-21, 10d
    Docker, docker-compose, CI pipeline         :done, d3, 2026-10-05, 4d
    Documentation, report & viva preparation    :active, d4, 2026-10-05, 10d

    section Milestones
    Mid-term review (backend demo)              :milestone, m2, 2026-09-04, 0d
    Feature complete                            :milestone, m3, 2026-10-02, 0d
    Final submission & viva                     :milestone, m4, 2026-10-16, 0d
```

## Week-by-week summary

| Week | Dates (2026) | Goal | Owner(s) |
|---|---|---|---|
| 1 | 20–24 Jul | Topic, literature survey of Drive / Dropbox / Nextcloud / Seafile | All |
| 2 | 27–31 Jul | Requirements, architecture, ER and use-case diagrams, synopsis | All |
| 3 | 3–7 Aug | Repo setup, config, database models | M1 |
| 4 | 10–14 Aug | Authentication (bcrypt, JWT), first tests | M1 |
| 5 | 17–21 Aug | Storage interface + AES-GCM encryption | M2 |
| 6 | 24–28 Aug | Upload/download, folders, trash | M2 |
| 7 | 31 Aug–4 Sep | Sharing: links + users; permission model; **mid-term demo** | M4, M1 |
| 8 | 7–11 Sep | Versioning; frontend design system and auth pages | M2, M3 |
| 9 | 14–18 Sep | Scheduled backups; app shell and files UI | M2, M3 |
| 10 | 21–25 Sep | Previews, share dialog, backups UI; test suite | M3, M4 |
| 11 | 28 Sep–2 Oct | Dashboard, activity log, admin panel | M1, M3 |
| 12 | 5–16 Oct | Docker, CI, docs, report, viva preparation, **submission** | M4 (+ all) |

> Adjust the dates to your semester calendar. In Mermaid, changing the first date of a task moves it, and `after <id>` keeps dependent tasks in order.
