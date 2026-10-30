# Changelog

## 1.4.0

### Added
- **ASO**, a new page in the top bar for App Store search. **Keyword ranks:** track keywords per app and storefront and get your daily rank in the top 200, 90 days of history, a popularity estimate from App Store search suggestions, a difficulty score, the top results, and suggestions to track next. **Listing audit:** every locale's name, subtitle, keywords and promotional text from App Store Connect, scored, with the wasted characters spelled out and a keyword editor that cleans them up live. **Search funnel:** search vs browse vs links, impressions → page views → Get taps, by week and storefront, with the storefronts worth localizing. **Changes & impact:** keyword and description changes from version history, name and subtitle changes from each sync, and your own notes, each with search and downloads two weeks before and after. **What to do next** sums it up. Also at `GET /api/aso`. Listings sync with Sales & analytics (needs an App Manager, Developer, Marketing or Admin key; Settings → Sync → App Store listings) and keyword ranks with Ratings & Rankings. The page has the dashboard's app sidebar, and **All Apps** compares every app's listing, keyword ranks and search side by side with what to do first in each.
- **Keyword fields are tracked automatically.** Every term in each locale's keyword field is ranked in that language's storefront (German in Germany, Japanese in Japan…) and follows the field as it changes in App Store Connect; tabs on the ASO page switch between the listing's languages. Turn it off in Settings → Sync → Track keyword fields.
- **ASO from Claude.** New `aso_*` MCP tools and `appshot aso` commands read every app's ASO, search keywords live, track keywords, and change listings in App Store Connect: keywords, subtitle, name, promotional text, description and What's New. Changes are planned first (old → new text, score before and after) and only written when applied. A new token scope, **ASO changes**, allows it; Marketing tokens can read ASO. The page's keyword editor can also **Save** to the version being prepared.
- **Signal notifications** (Settings → Notifications), through your own signal-cli-rest-api server, to a phone number or a group by name: a message as soon as an app enters a top 100 chart, and a **daily recap** at a time you pick of each app's downloads and proceeds, ratings, new reviews and chart moves. The recap is also at `GET /api/notify`.
- **Projections** on the dashboard: first-time downloads, impressions, product page views and proceeds over the next 30 days, 90 days or 12 months, each with a likely range and its pace against the last 28 days, charted after the actual numbers. It also shows your impressions → page views → downloads funnel and conversion rate (and your best 28 days), a **what-if** with sliders for more impressions and a better conversion rate (extra downloads, and proceeds at your recent proceeds per download), and when you'll pass your next download milestone. Also at `GET /api/forecast`.
- **Marketing for Claude and scripts.** API tokens now have scopes: **Screenshot studio**, **Marketing**, or both. With Marketing, the `appshot` CLI (`appshot marketing apps|stats|forecast|promo|card`) and the MCP connector (`marketing_catalog`, `marketing_stats`, `marketing_forecast`, `marketing_promo_material`, `marketing_card`) read the figures the cards show, the projections, and render any stats or promo card to PNG. New endpoints: `/api/marketing/catalog` and `/api/marketing/stats`. Existing tokens keep opening the studio only.
- **A faster Marketing page with more cards.** **Customize** folds away the option rows so the cards get the room, and **S / M / L** sets the card size. Four new promo cards: **Features** (a checklist from your description), **App Store Page** (a mock product page with your screenshots and rating), **Top Rated** and **Milestone**. Cards draw on several cores at once; App Store listings, icons, screenshots and drawn cards are kept on disk (under `data/cache/marketing`), and the cards you use are drawn ahead after each sync and on start, so the page opens with them ready and stays fast after a restart or update.
- **OpenConnect as an app on your phone.** Add it to your iPhone's Home Screen (Share → Add to Home Screen) or install it from Chrome, and it opens full screen with its own icon, like an app. On phones, Dashboard · ASO · Marketing · Studio · Settings sit in a **tab bar** along the bottom, each page's title and controls sit in the top bar, popups slide up from the bottom as **sheets**, and pages fit around the notch and home indicator. In the installed app, **pull down** at the top of a page to refresh it, and if the server can't be reached, an offline screen shows (and reopens the page when the server's back).

### Changed
- **better-sqlite3 12**, which ships prebuilt binaries for Node 22 and 24, so running OpenConnect outside Docker on Node 24 no longer needs a compiler.
- On touch screens, buttons dim while pressed, hover highlights no longer stick after a tap, taps respond at once, and tapping a field no longer zooms the page. On phones, Marketing's option rows scroll away with the page instead of staying pinned under the top bar.
- Under the hood: Tailwind CSS 4 (pages look the same), eslint 10, and newer Docker actions for the release builds.

### Security
- **fflate 0.7.5**, which the card renderer uses to read its fonts, for an infinite loop on malformed ZIP64 archives (GHSA). OpenConnect never opens ZIP files from anyone else, but it clears the alert.

## 1.3.0

### Added
- **One top bar on every page:** OpenConnect, Dashboard · Marketing · Studio, the page's own controls and Settings, always in the same place (the studio included, in its own colours). The studio starts in your OpenConnect light/dark setting.
- **Edit each promo card on its own.** Clicking a card opens it large with a settings panel beside it: size, style, accent, iPhone colour, App Store button and rating, its own text (headlines keep line breaks), its own screenshots, and for Reviews which reviews to quote. Anything left alone follows the toolbar, which now sets every card; Reset puts a card back.
- **Loved By shows where people love it:** "Loved In / 42 Countries" over the dashboard's world map with every App Store country, green where the app has downloads and red where it doesn't yet.
- **Reviews**, a new promo card for your 5★ reviews: one review, or three with the first in front and the other two fanned out behind it. Pick which reviews it shows, in order, with the rating above them.
- **Promo screenshots from the studio.** App promo cards show screenshots you pick on the Marketing page, in order: the app's raw screens from its studio project (matched by Apple ID, bundle ID or name) or its App Store ones. They're drawn in the studio's iPhone, with Dynamic Island and side buttons, in a frame colour you choose.
- **Screenshot studio** at `/studio`, behind the same sign-in. Design, localize and export App Store screenshots for iPhone, iPhone Duo, iPad and Mac. It runs as a second container with headless Chromium (`openconnect-studio`), and its data lives in `./data/studio`.
- **API tokens** (Settings → Security). Claude's `appshot` CLI and MCP server reach the studio with `OPENCONNECT_URL` and `OPENCONNECT_TOKEN`. A token only opens the studio, never your sales data or settings, and each one can be revoked.
- **App promos.** The Marketing page has a second mode that makes promo cards for one app you pick, built from its live App Store listing: **Launch** (screenshots in phone frames), **What's New** (the current version's release notes), **Screenshots**, **Loved By** (where in the world it's downloaded), **Reviews** (rating and your best short 5★ reviews) and **Download** (call to action with rating, downloads, countries and price). Every template renders at once, so **Download all** gives you a full set.
- Promo cards come in five styles (**Studio**, **Light**, **Gradient**, **Bold**, **Glow**), any accent colour, and four sizes: 1:1, 4:5, 9:16 and 16:9. You can override the headline, tagline, button text and release notes, and the text is kept per app. You can also hide the App Store button or the rating.

### Changed
- **Marketing loads much faster.** The grid's previews are drawn smaller (full size when you open or download a card), Reviews cards no longer use a costly blurred shadow, and app icons and listings download once, outside the one-at-a-time render queue.
- **Loved By's legend** counts the countries without downloads too: "10 of 175 App Store countries · 165 not yet".
- **A more consistent look:** every input and select shares one style (with placeholders and focus rings), status colours match in light and dark, popups use the same headings, Settings lines up with the top bar and shows "Saved" once, and every button has a keyboard focus ring. Section names in Customize match the dashboard's (History, Breakdowns).
- **Screenshots** cards read "See Afternoon / In Action" on two lines.
- Card images are tied to the build, so a browser never keeps showing a card drawn by an older version after an update.
- **What's New** cards read "Version / 1.4.0 / Is Here!" on three lines, and release notes are trimmed to what fits.
- **Reviews** cards shorten a long front review to what fits under the headline and rating, so it never runs into the header.
- The studio's editor and its data API are part of the dashboard app itself; the studio container only renders (slide images, previews, exports) and can be restarted without interrupting editing.
- The dashboard's icons are on lucide-react 1.x, the same as the studio.
- **Share is now Marketing**, at `/marketing`. The old `/share` address redirects there.

### Security
- **Next.js 16.4.3**, fixing a critical remote code execution in the image optimizer (OpenConnect has it turned off) and a denial of service in Server Actions. Next.js now refuses to build 16.4.0.
- The screenshot studio's dependencies: body-parser (denial of service), fast-uri, ip-address and zod; zod and postcss-selector-parser in the dashboard too. The studio container moves to **Playwright 1.64.1** and its Chromium.
- **satori 0.33.5**, the card layout engine, which escapes text properly in the SVG it draws (GHSA-wx4j-mvgx-mqwp): review text, app names and descriptions come from other people. Cards look the same apart from headlines wrapping more evenly.
- Every other dependency is on its latest compatible release (React 19.3.1, Radix UI, Lucide, Express 5.3, Vite 8.3.5, dotted-map 3).

### Fixed
- **Revoking an API token** works again: Revoke asks inside the page (Revoke / Cancel) instead of a browser pop-up that some browsers block, and says so if the server refuses. Full re-sync and Reset layout ask the same way.

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
