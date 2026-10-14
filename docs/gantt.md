# Project plan: 12-week Gantt chart

**Project:** OpenVault, a file sharing and backup application
**Course:** ITL704 Recent Open Source Project Lab, Sem VII (IT), University of Mumbai
**Team:** 3 members

| Member | Roll no. | Main responsibility | Also helps with |
|---|---|---|---|
| **Siddhesh Dalvi** | 776 | Backend core: database models, authentication (bcrypt + JWT), permission model, **sharing** (links + user shares), admin API | Code reviews, security Q&A for the viva |
| **Samarth Jedhe** | 775 | Storage and encryption (AES-GCM), file/folder API, versioning, backups and scheduler, **backend test suite, Docker + CI** | Open source files, `.env` configuration |
| **Vaibhav Narayankar** | 777 | Frontend: design system, app layout, files UI, previews, dashboard charts, **end-to-end UI tests, documentation and report** | Logbook, screenshots |

```mermaid
gantt
    title OpenVault: 12-week plan
    dateFormat YYYY-MM-DD
    axisFormat %d %b
    excludes weekends

    section Planning (all three)
    Topic finalisation & literature survey      :done, p1, 2026-07-20, 5d
    Requirements, use cases, architecture       :done, p2, after p1, 5d
    Synopsis submission                         :milestone, m1, 2026-07-31, 0d

    section Siddhesh · Backend & sharing
    Project setup, config, DB models            :done, a1, 2026-08-03, 5d
    Registration, login, JWT, bcrypt            :done, a2, after a1, 5d
    Permission model + share links              :done, a3, 2026-08-31, 5d
    Sharing with users, Shared with me          :done, a4, after a3, 5d
    Admin API (users, quotas, audit log)        :done, a5, 2026-09-28, 5d

    section Samarth · Storage, backups & DevOps
    Storage interface + AES-256-GCM encryption  :done, b1, 2026-08-17, 5d
    Upload / download / folders / trash         :done, b2, after b1, 5d
    File versioning & restore                   :done, b3, 2026-09-07, 4d
    Scheduled backups (APScheduler) & restore   :done, b4, after b3, 6d
    Backend test suite (pytest)                 :done, b5, 2026-09-21, 5d
    Docker, docker-compose, CI pipeline         :done, b6, 2026-10-05, 4d

    section Vaibhav · Frontend & docs
    Design system, landing & auth pages         :done, c1, 2026-09-07, 5d
    App shell, files grid/list, uploads         :done, c2, after c1, 5d
    Previews, share dialog, versions, backups UI:done, c3, after c2, 5d
    Dashboard charts & admin panel UI           :done, c4, after c3, 5d
    End-to-end UI tests (Playwright)            :done, c5, 2026-10-05, 3d
    Documentation, report & viva preparation    :active, c6, 2026-10-05, 10d

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
| 3 | 3–7 Aug | Repo setup, config, database models | Siddhesh |
| 4 | 10–14 Aug | Authentication (bcrypt, JWT), first tests | Siddhesh, Samarth |
| 5 | 17–21 Aug | Storage interface + AES-GCM encryption | Samarth |
| 6 | 24–28 Aug | Upload/download, folders, trash | Samarth |
| 7 | 31 Aug–4 Sep | Permission model, share links; **mid-term demo** | Siddhesh |
| 8 | 7–11 Sep | Sharing with users; versioning; frontend design system and auth pages | Siddhesh, Samarth, Vaibhav |
| 9 | 14–18 Sep | Scheduled backups; app shell and files UI | Samarth, Vaibhav |
| 10 | 21–25 Sep | Previews, share dialog, backups UI; backend test suite | Vaibhav, Samarth |
| 11 | 28 Sep–2 Oct | Dashboard, activity log, admin panel | Siddhesh, Vaibhav |
| 12 | 5–16 Oct | Docker, CI, end-to-end tests, docs, report, viva preparation, **submission** | Samarth, Vaibhav (+ all) |

> Adjust the dates to your semester calendar. In Mermaid, changing the first date of a task moves it, and `after <id>` keeps dependent tasks in order.
