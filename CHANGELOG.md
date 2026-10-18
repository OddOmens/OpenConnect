# Changelog

## Unreleased

### Added
- **Screenshot studio**, formerly OpenAppShot, now part of OpenConnect at `/studio`, behind the same sign-in. Design, localize and export App Store screenshots for iPhone, iPhone Duo, iPad and Mac. It runs as a second container with headless Chromium (`openconnect-studio`), and its data lives in `./data/studio`.
- **API tokens** (Settings → Security). Claude's `appshot` CLI and MCP server reach the studio with `OPENCONNECT_URL` and `OPENCONNECT_TOKEN`. A token only opens the studio, never your sales data or settings, and each one can be revoked.
- **App promos.** The Marketing page has a second mode that makes promo cards for one app you pick, built from its live App Store listing: **Launch** (screenshots in phone frames), **What's New** (the current version's release notes), **Screenshots**, **Loved By** (rating and your best short 5★ reviews) and **Download** (call to action with rating, downloads, countries and price). Every template renders at once, so **Download all** gives you a full set.
- Promo cards come in five styles (**Studio**, **Light**, **Gradient**, **Bold**, **Glow**), any accent colour, and four sizes: 1:1, 4:5, 9:16 and 16:9. You can override the headline, tagline, button text and release notes, and the text is kept per app. You can also hide the App Store button or the rating.

### Changed
- The studio's editor and its data API are part of the dashboard app itself; the studio container only renders (slide images, previews, exports) and can be restarted without interrupting editing.
- The dashboard's icons are on lucide-react 1.x, the same as the studio.
- **Share is now Marketing**, at `/marketing`. The old `/share` address redirects there.

## 1.2.0

### Added
- **More share card designs.** Alongside Overview, the Share page now makes **Global Reach**, **World Map**, **Rating**, **Review** (one of your best recent 5★ written reviews, with "Another review" to pick a different one) and **Milestone** cards, all in the dashboard's look and in both 4:5 and 9:16.
- **Global Reach** on the dashboard: in how many of the 175 App Store storefronts each app has been downloaded, all time, with a map, a per-app comparison and the countries not reached yet. A **Countries Reached** KPI shows the count and how many are new in the selected range.

### Changed
- The **World Map** counts **first-time downloads** (new customers) instead of first-time plus redownloads, on the dashboard and on the World Map share card. The country tooltip still lists redownloads.
- Dashboard sections added in an update appear next to the section they belong with, instead of at the end of a saved layout.

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
