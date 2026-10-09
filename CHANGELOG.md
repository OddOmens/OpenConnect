# Changelog

## 1.1.0

### Added
- **Sync report.** When a sync you started finishes, a popup shows exactly what changed: sales totals and per-app deltas, new and revised report dates, impressions and subscriptions, new reviews and responses, rating changes, and chart positions gained, lost or moved. The latest report for each job is under **Sync → What changed**.
- **Optional password.** `OPENCONNECT_PASSWORD_REQUIRED=false` turns sign-in off for single-user, localhost-only setups. Cross-site request protection stays on, and pages are only served under local hostnames to block DNS rebinding (`OPENCONNECT_ALLOWED_HOSTS` adds more).
- `OPENCONNECT_PASSWORD_FILE` reads the password from a file, such as a Docker secret.
- A startup warning when the password is off or `OPENCONNECT_PASSWORD` is too short.
- Security policy, contributing guide, issue templates and CI.
- Dependabot updates for npm, the Docker base image and GitHub Actions.
- Published Docker images for Intel and ARM at `ghcr.io/oddomens/openconnect`. `docker compose up -d` now pulls the image, and `--build` builds from source.
- Licensed under MIT with the Commons Clause: free to use, modify and share; not to be sold.

### Changed
- Upgraded to Next.js 16 and React 19. Next.js 14 no longer receives security fixes, and production dependencies now have no known vulnerabilities.
- The Docker image runs on Node.js 22 LTS (Node 20 reached end of life).
- `npm run lint` uses ESLint 9 with a flat config.
- Password hashes use OWASP's recommended scrypt cost. Existing hashes upgrade on next sign-in.
- A password set with `OPENCONNECT_PASSWORD` is now checked against a scrypt hash too, instead of a plain SHA-256 comparison.
- Native scrollbars follow the light/dark theme.

### Fixed
- Production builds no longer trace the whole project. Before, a local `npm run build` could copy `data/` and `keys/` into `.next/standalone`; the Docker image was never affected, thanks to `.dockerignore`.
- `/api/reviews` no longer accepts a negative `limit`, which used to return every review in one response.
- Sync summaries use singular wording for single items ("1 daily sales report").

## 1.0.0

- Initial release.
