# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Contact the maintainers listed in the README's Team section privately, describing:

- what the problem is and where it is (file / endpoint);
- steps to reproduce it;
- the impact you expect.

We aim to reply within 7 days and will credit you in the fix unless you prefer otherwise.

## Deployment checklist

- Generate a strong, random `SECRET_KEY` and `ENCRYPTION_KEY` (see `.env.example`). The server refuses weak ones.
- **Back up `ENCRYPTION_KEY` separately from your data.** Losing it makes every stored file unreadable.
- Serve OpenVault over **HTTPS** (for example behind Caddy, Traefik or nginx with Let's Encrypt).
- Change the default PostgreSQL password in `docker-compose.yml` if you use the `postgres` profile.
- Keep Docker images and dependencies up to date.

See [`docs/architecture.md` §8](docs/architecture.md#8-security-design-summary) for the security design.
