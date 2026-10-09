# Changelog

## 1.1.0

### Added
- **Sync report.** When a sync you started finishes, a popup shows exactly what changed: sales totals and per-app deltas, new and revised report dates, impressions and subscriptions, new reviews and responses, rating changes, and chart positions gained, lost or moved. The latest report for each job is under **Sync → What changed**.
- **Optional password.** `OPENCONNECT_PASSWORD_REQUIRED=false` turns sign-in off for single-user, localhost-only setups. Cross-site request protection stays on, and pages are only served under local hostnames to block DNS rebinding (`OPENCONNECT_ALLOWED_HOSTS` adds more).
- `OPENCONNECT_PASSWORD_FILE` reads the password from a file, such as a Docker secret.
- A startup warning when the password is off or `OPENCONNECT_PASSWORD` is too short.
- Security policy, contributing guide, issue templates and CI.
- Licensed under MIT with the Commons Clause: free to use, modify and share; not to be sold.

### Changed
- Password hashes use OWASP's recommended scrypt cost. Existing hashes upgrade on next sign-in.
- Native scrollbars follow the light/dark theme.

### Fixed
- `/api/reviews` no longer accepts a negative `limit`, which used to return every review in one response.
- Sync summaries use singular wording for single items ("1 daily sales report").

## 1.0.0

- Initial release.
