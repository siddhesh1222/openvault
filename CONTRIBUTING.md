# Contributing to OpenVault

Thanks for your interest in improving OpenVault! This guide explains how to set up the project and submit changes.

## Ground rules
- Be respectful. All participants must follow our [Code of Conduct](CODE_OF_CONDUCT.md).
- Keep code **simple and commented**. This project is also a learning resource.
- Every feature or bug fix needs tests.
- Never commit secrets. Configuration belongs in `.env` (see `.env.example`).

## Getting started
1. Fork the repository and clone your fork.
2. Follow the **Quick start** in the [README](README.md) to run the backend (and frontend).
3. Create a branch for your change:
   ```bash
   git checkout -b feature/short-description
   ```

## Making changes
- **Backend**: routes go in `backend/app/routers/`, business logic in `backend/app/services/`, and tables in `backend/app/models.py`.
- **Frontend**: pages go in `frontend/src/pages/` and reusable components in `frontend/src/components/`.
- Run the tests before pushing:
  ```bash
  cd backend && pytest
  cd frontend && npm run lint && npm run build
  ```

## Commit messages
Use a short summary in the imperative mood, for example:
```
Add password protection to share links
Fix quota check for files in trash
```

## Pull requests
1. Push your branch and open a pull request against `main`.
2. Fill in the pull request template: what changed, why, and how you tested it.
3. A maintainer reviews the PR. Please respond to feedback and keep the PR focused on one change.

## Reporting bugs and requesting features
Use the GitHub issue templates (**Bug report** or **Feature request**). For security vulnerabilities, **do not open a public issue**. Contact the maintainers listed in the README privately instead.

By contributing, you agree that your contributions are licensed under the GPL-3.0 license.
