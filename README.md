<div align="center">

# OpenConnect

**A self-hosted App Store Connect dashboard.**
Downloads, proceeds, in-app purchases, subscriptions, reviews, impressions, plus ratings and top-chart positions in all 175 App Store storefronts. Everything stays on your own machine.

[Quick start](#quick-start) · [Features](#features) · [Configuration](#configuration) · [Security](#security) · [How syncing works](#how-syncing-works) · [Contributing](CONTRIBUTING.md)

[![CI](https://github.com/OddOmens/OpenConnect/actions/workflows/ci.yml/badge.svg)](https://github.com/OddOmens/OpenConnect/actions/workflows/ci.yml)
[![License: MIT + Commons Clause](https://img.shields.io/badge/license-MIT%20%2B%20Commons%20Clause-blue)](LICENSE)

![OpenConnect dashboard](docs/screenshots/dashboard.png)

</div>

## Why

App Store Connect spreads your numbers over several slow pages and only keeps daily sales for a year. OpenConnect pulls everything into one fast dashboard backed by a local SQLite file. It keeps the history, and nothing leaves your machine except requests to Apple.

## Features

- **Sales & proceeds:** first-time downloads, re-downloads, updates, in-app purchases and proceeds, by day, week, month or year. Proceeds are converted to your choice of display currency.
- **Subscriptions:** active subscribers, trials, offers, billing retry, and subscription events.
- **Customer reviews:** every review from every storefront, with developer responses.
- **Impressions & product page views** from Apple's Analytics Reports API.
- **Ratings & rankings in 175 storefronts:** rating counts and averages per country, plus where your apps sit in the Top Free, Top Paid and Top Grossing charts, overall and by category.
- **ASO:** daily App Store search ranks for the keywords you track in any storefront, with a popularity estimate, a difficulty score and the apps you're up against; an audit of every locale's name, subtitle and keyword field that finds wasted characters, with a keyword editor that cleans them up; your search funnel (search vs browse conversion, by storefront); and every listing change with search and downloads two weeks before and after it. See [ASO](#aso).
- **Signal notifications:** a message the moment an app enters a top 100 chart, and a daily recap of every app (downloads, proceeds, ratings, new reviews and chart moves) at the time you pick. See [Notifications](#notifications).
- **World map, device and territory breakdowns.**
- **Sync report:** after every sync you get a popup that lists exactly what changed. It covers new and revised report dates, per-app deltas, new reviews, rating changes, and chart moves.
- **Projections:** where first-time downloads, impressions, page views and proceeds are heading over the next 30, 90 or 365 days, with likely ranges, your impressions → page views → downloads funnel, a what-if for more impressions or a better conversion rate, and when you'll pass your next download milestone.
- **Marketing:** render PNG stats cards to post anywhere, plus promo cards for one app (launch, what's new, screenshots, reviews, download) built from its App Store listing, in five styles, any accent colour and four sizes.
- **Screenshot studio:** design, localize and export App Store screenshots for iPhone, iPad and Mac at `/studio` (see [studio/README.md](studio/README.md)). Claude can drive it, and Marketing, through its CLI and MCP server with an API token, from your Mac.
- **Fully customizable:** show, hide or reorder every section, metric, column and chart series. Light, dark or system theme.
- **Incremental sync:** a routine sync takes a handful of requests, not a 365-day backfill.
- **Private by default:** one password protects everything, and the container runs read-only with no Linux capabilities.

<table>
  <tr>
    <td><img src="docs/screenshots/sync-report.png" alt="Sync report popup"></td>
    <td><img src="docs/screenshots/sync-dialog.png" alt="Sync status and report coverage"></td>
  </tr>
  <tr>
    <td align="center"><sub>The sync report: what each sync changed</sub></td>
    <td align="center"><sub>Sync status and report coverage</sub></td>
  </tr>
</table>

## Quick start

You need Docker and an App Store Connect API key ([how to create one](#api-key)).

```bash
git clone https://github.com/OddOmens/OpenConnect.git
cd OpenConnect
cp .env.example .env                    # fill in Key ID, Issuer ID, Vendor Number
cp ~/Downloads/AuthKey_XXXXXXXXXX.p8 keys/
docker compose up -d
```

This pulls the published image (Intel and ARM, including Apple Silicon and Raspberry Pi). To build from source instead, use `docker compose up -d --build`.

Then:

1. Open **http://localhost:3000**.
2. On first start, OpenConnect asks you to choose a password. To prove you own the server, it also asks for a one-time setup code. Find the code with:
   ```bash
   docker logs openconnect
   ```
3. The first sync starts on its own and backfills your history, which takes a few minutes. After that, syncs run every 6 hours.

You can also leave `.env` empty and enter everything in **Settings → App Store Connect**, including pasting the contents of the `.p8` file.

### API key

Create a **Team Key** in App Store Connect → Users and Access → Integrations → App Store Connect API.

| Data | Key role needed |
| --- | --- |
| Apps, customer reviews | Any role (e.g. Customer Support, App Manager) |
| Sales, proceeds, IAPs, subscriptions | **Sales** (or Finance / Admin) |
| Impressions & page views | **Admin** once, to ask Apple to start generating analytics reports. A Sales key can download them afterwards. |
| Ratings & rankings in 175 storefronts | Nothing. Uses Apple's public lookup and top-chart feeds. |
| App Store listings (ASO) | **App Manager**, Developer or Marketing (or Admin) |
| Keyword ranks (ASO) | Nothing. Uses Apple's public search. |

Your **Vendor Number** is in App Store Connect → Payments and Financial Reports, at the top left under your name.

## Configuration

Set these in `.env` next to `docker-compose.yml`. Anything marked *Settings* can also be entered in the browser instead.

| Variable | Default | What it does |
| --- | --- | --- |
| `ASC_KEY_ID` | | API key ID. *Settings* |
| `ASC_ISSUER_ID` | | API issuer ID. *Settings* |
| `ASC_VENDOR_NUMBER` | | Vendor number for sales reports. *Settings* |
| `ASC_PRIVATE_KEY_PATH` | auto | Path to the `.p8` inside the container. Without it, `AuthKey_<KEY_ID>.p8` is found in `./keys` automatically. |
| `ASC_KEYS_DIR_HOST` | `./keys` | Host folder holding the `.p8`, mounted read-only. |
| `OPENCONNECT_VERSION` | `latest` | Which published image to run, e.g. `1.1.0`. |
| `PORT` | `3000` | Port on the host. |
| `BIND_ADDRESS` | `127.0.0.1` | `127.0.0.1` means only this computer can connect. `0.0.0.0` lets your whole network connect. |
| `OPENCONNECT_PASSWORD_REQUIRED` | `true` | `false` turns the password off completely. See [Running without a password](#running-without-a-password). |
| `OPENCONNECT_PASSWORD` | | Fixes the password here instead of choosing it in the browser. |
| `OPENCONNECT_PASSWORD_FILE` | | Reads the password from a file (e.g. a Docker secret) instead. |
| `OPENCONNECT_ALLOWED_HOSTS` | | Only used with the password off: extra hostnames you open the dashboard by, comma-separated. |
| `TS_AUTHKEY`, `TS_HOSTNAME` | | For [HTTPS on your tailnet](#https-with-tailscale). |

Sync intervals, which data to sync, which charts and storefronts to check, display currency and the dashboard layout are all in **Settings**.

## Security

OpenConnect holds your App Store Connect key and your revenue data, so it is locked down by default.

**Sign-in**
- One password protects every page and API. The only exception is `/api/health`, which reveals nothing.
- On first start, nobody can claim a fresh install before you do. Choosing the password requires a random one-time setup code that is printed only in the server log.
- Passwords are stored as salted **scrypt** hashes using OWASP's recommended cost. Older hashes are upgraded the next time you sign in.
- A session is a random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie, marked `Secure` over HTTPS. The database stores only a SHA-256 hash of it. Sessions last 30 days. Changing the password, or using "Sign out everywhere", ends all other sessions.
- After 5 wrong passwords from one client, each further attempt waits longer: 30 s, then 60 s, and so on, up to 15 minutes. After 20 wrong attempts across all clients, the same wait applies to everyone. The global limit exists because the client address comes from a header that can be faked.

**Requests and browser**
- Every request that changes something is refused when the browser says it came from another site. This is CSRF protection.
- A strict Content-Security-Policy stops scripts from loading from anywhere but the server, and stops the page from being framed. The page also does not send a referrer.
- The `.p8` key is never sent back to the browser. Settings only shows whether a key is present.

**Container and files**
- The container filesystem is read-only, has no Linux capabilities and cannot gain privileges (`no-new-privileges`). It runs as a non-root user.
- The database is created readable by its owner only (`0600`, in a `0700` folder).
- The `.p8` key is mounted read-only.
- `.env`, `keys/`, `data/`, `*.p8` and `*.pem` are excluded by both `.gitignore` and `.dockerignore`. They never end up in git or in the image.

**Recommendations**
- Keep `BIND_ADDRESS=127.0.0.1` unless you need access from other devices. To reach the dashboard from elsewhere, prefer [Tailscale](#https-with-tailscale) over opening a port.
- Never expose OpenConnect directly to the internet.
- If you set `OPENCONNECT_PASSWORD`, anyone who can run `docker inspect` can read it. `OPENCONNECT_PASSWORD_FILE` with a Docker secret avoids this. Choosing the password in the browser also avoids it.
- Found a vulnerability? See [SECURITY.md](SECURITY.md).

### Running without a password

If OpenConnect only listens on `127.0.0.1` and you are the only person using the computer, a password may just be in the way:

```bash
# .env
OPENCONNECT_PASSWORD_REQUIRED=false
```

With the password off:
- Anyone who can reach the port can see your data and change settings. A warning is printed to the log on every start.
- Protection against cross-site requests still applies.
- Pages are only served under local hostnames: `localhost`, IP addresses, single-word names, `*.local`, `*.lan`, `*.home.arpa`, `*.internal` and `*.ts.net`. This blocks *DNS rebinding*, a trick that lets a malicious website read services on `localhost`. If you use another hostname, add it to `OPENCONNECT_ALLOWED_HOSTS`.

Set it back to `true` (or remove the line) and restart to turn the password on again.

## How syncing works

- **Only what's missing.** OpenConnect keeps a ledger of every report date it holds. Each run downloads only dates that are missing or failed last time, newest first. Each date is replaced as a unit, so re-syncing never double counts.
- **As far back as Apple allows.** Daily reports cover the last 365 days. The partial month before that comes from a monthly report, and everything older comes from yearly totals, back to your first app's release. Nothing before your first release is requested.
- **On a schedule.** Sales sync every 6 hours, ratings and rankings once a day. Both intervals can be changed in Settings. The **Sync** dialog shows coverage per report type and lets you retry failed dates or force a full re-sync.
- **Currencies.** Proceeds are converted to USD using the latest exchange rates from open.er-api.com, refreshed every 12 hours, and then to your display currency.

### The sync report

When a sync you started finishes, a popup shows exactly what changed:

- **Sales totals**: downloads, re-downloads, updates, in-app purchases and proceeds, before and after, plus which apps moved.
- **Report dates**: each new day, and each day whose numbers Apple *revised*, with old and new figures.
- **Engagement & subscriptions**: impressions, product page views, active subscriptions and subscription events.
- **Reviews**: every new review, plus developer responses that were added or edited.
- **Ratings & rankings**: rating count and average changes per app, plus chart positions gained, lost and moved. Biggest moves are listed first.

Scheduled syncs don't pop up. Open **Sync → What changed** to see the report of the latest run of each job.

## ASO

The **ASO** page shows how your apps do in App Store search, and what to change. It has the dashboard's app sidebar: **All Apps** compares every app (listing score, wasted keyword characters, keywords in the top 10, search impressions and conversion, storefronts to localize) and says what to do first in each; pick an app for the details, and its storefront in the top bar.

- **What to do next:** plain recommendations from everything below: popular keywords missing from the listing, wasted keyword characters, search converting worse than browse, storefronts worth localizing, rank moves, and the best openings.
- **Keyword ranks:** every term in each locale's keyword field is tracked automatically in that language's storefront (English (U.S.) in the U.S., German in Germany, Japanese in Japan…) and follows the field when you change it in App Store Connect; tabs switch between the listing's languages. Add up to 60 more per app by hand, in any storefront. Each is searched once a day with Ratings & Rankings (and as soon as you add it) and shows your rank in the top 200, the change over 7 days and 90 days of history, whether its words are in your name, subtitle or keyword field, and the top results. Open a keyword for the top 10 now and what App Store search suggests around it. **Popularity** (0–100) is estimated from App Store search suggestions: the fewer letters someone types before the keyword is suggested, the more it's searched. **Difficulty** (0–100) comes from the ratings of the top 10 and how many have the keyword in their name. ★ marks openings: searched often, beatable, and you're not in the top 10 yet. Words that recur in your competitors' names are offered as new keywords.
- **Listing:** the name, subtitle, keywords and promotional text of every locale, as App Store Connect holds them, on the store and for the version you're preparing. Each locale gets a score and a list of fixes: spaces after commas, repeated keywords, words already in the name or subtitle, words search adds on its own, unused room. The keyword editor runs the same checks as you type, **Clean up** removes the waste, and **Copy** puts the result on your clipboard. While a version is being prepared, **Save** writes the keywords to it in App Store Connect (after you confirm); otherwise nothing is sent to Apple. **Locales worth adding** lists storefronts where people find you in search without a listing in their language.
- **Search funnel:** impressions → product page views → Get taps for search, browse, other apps and websites, with conversion against the period before, by week and by storefront. From the analytics reports.
- **Changes & impact:** keyword and description changes from each version's history (fetched once per version), name, subtitle and promotional text changes recorded at each sync, and notes you add (new screenshots, Search Ads). Each shows search impressions, tap-through, conversion, first downloads and keyword ranks in the 14 days before and after it.

**Where the numbers come from.** Listing text, the search funnel and the before/after figures are Apple's own, from the App Store Connect API and its analytics reports. Ranks come from Apple's public search API, which follows App Store search closely but not exactly (it isn't personalized and has no Search Ads). Popularity, difficulty and the listing score are OpenConnect's estimates: Apple only publishes keyword popularity in Search Ads, and has no listing score.

Listings are fetched with **Sales & analytics**; turn that off in **Settings → Sync → App Store listings**, and the automatic keyword-field tracking (about one search per term a day) in **Track keyword fields**. `GET /api/aso?app=<id>&country=US&days=30` returns everything on the page, and without `app` the All Apps comparison, to API tokens with the Marketing or ASO changes scope.

**ASO from Claude.** The `appshot` CLI and MCP connector have ASO tools (`aso_overview`, `aso_keyword`, `aso_track_keywords`, `aso_update_listing`, `aso_refresh`, `aso_note`; `appshot aso …`), so Claude on your Mac can read all of this and propose listing changes. `aso_update_listing` plans first and shows old → new text and the score before and after; it writes to App Store Connect only when called again with `apply`, which Claude is told to do only after you agree. Changing listings needs a token with the **ASO changes** scope and an App Store Connect key with the App Manager role (or Admin). Apple only lets keywords, the description, name and subtitle change on a version being prepared; promotional text changes on the live version straight away.

## Notifications

OpenConnect can message you on Signal through a [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) server you run, with a Signal account linked to it. Set it up in **Settings → Notifications**:

- **Signal API address:** where OpenConnect reaches that server, e.g. `http://signal-api:8080` when both containers share a Docker network.
- **Send from:** the account linked to the server, as `+15551234567`.
- **Send to:** a phone number, or the name of a group that account is in (e.g. `Apple Apps`).

Then pick what to send:

- **When an app enters a chart:** right after each ratings & rankings check, one message listing every top 100 chart an app wasn't in at the check before, e.g. `#17 Top Free Productivity · Austria`. Each entry is sent once. Chart checks run as often as **Settings → Sync → Ratings & Rankings** says, so set that to every 24 hours (or less) for timely alerts.
- **Daily recap:** at the time and time zone you choose, for each app: its last reported day of first-time downloads and proceeds (with the 7-day average), ratings, reviews since the last recap, and chart moves: entered, up, down and left the top 100. Apps with nothing to report are listed on one line. `GET /api/notify` returns the same recap as text (also open to API tokens with the Marketing scope).

**Save & send a test** checks the setup, and **Send the recap now** shows what the recap looks like.

## HTTPS with Tailscale

Browsers block some features (like downloading marketing cards) on plain `http://` pages that aren't `localhost`. To get HTTPS on your tailnet at `https://openconnect.<tailnet>.ts.net`:

```bash
docker compose -f docker-compose.yml -f docker-compose.tailscale.yml up -d
docker logs openconnect-tailscale   # first start only: open the login link
```

This needs MagicDNS and HTTPS certificates enabled for your tailnet (admin console → DNS). Set `TS_AUTHKEY` in `.env` to skip the login link.

## Screenshot studio

The studio runs as a second container, `openconnect-studio`, which includes headless Chromium for rendering. It has no port of its own: the dashboard serves it at **`/studio`**, behind the same sign-in. Its projects, uploads and exports live in `./data/studio`.

**Claude on your Mac.** Create a token in **Settings → Security → API tokens** and tick what it may open: the **Screenshot studio**, **Marketing**, **ASO changes**, or several. A Marketing token can render cards and read the figures they show, the projections and ASO (`/api/marketing/*`, `/api/forecast`, `/api/aso`); an ASO changes token can also track keywords and change App Store listings (see [ASO](#aso)); no token opens the dashboard, settings or other tokens. Tokens made before scopes existed open the studio only. Then set `OPENCONNECT_URL` (your OpenConnect address) and `OPENCONNECT_TOKEN` on the Mac and install the CLI, skill and MCP connector. The steps are in [studio/README.md](studio/README.md#use-it-from-claude-on-your-mac).

## Updating, backups and data

```bash
git pull
docker compose pull && docker compose up -d     # published image
# or: docker compose up -d --build              # from source
```

Releases and their notes are on the [Releases page](https://github.com/OddOmens/OpenConnect/releases).

- All data lives in `./data`: `dashboard.db` (SQLite) for the dashboard and `studio/` for the screenshot studio. It's mounted into the containers, so rebuilds and upgrades keep it.
- **Back up** by copying `./data` while the container is stopped, or at any time with `docker exec openconnect node -e "require('better-sqlite3')('/app/data/dashboard.db').backup('/app/data/backup.db')"`.
- **Start over** by stopping the container and deleting `./data`.
- **Forgot the password?** If it is set with `OPENCONNECT_PASSWORD`, change it there and restart. Otherwise, run `docker exec openconnect node -e "require('better-sqlite3')('/app/data/dashboard.db').prepare(\"DELETE FROM settings WHERE key='auth_password'\").run()"` and restart. Then set a new password with a fresh setup code from `docker logs openconnect`.

## Run without Docker

Requires Node.js 22+.

```bash
npm install
cp .env.example .env.local   # fill in
npm run dev                  # http://localhost:3000
```

Data goes to `./data` (or `DATA_DIR`). The setup code is printed in the terminal. For the screenshot studio, also set `APPSHOT_DATA=./data/studio` and run its renderer (see [studio/README.md](studio/README.md#develop)).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Private key file not found" | Put `AuthKey_<KEY_ID>.p8` in `./keys`, or paste the key in Settings. |
| Sales sections empty, `HTTP 403` in the Sync dialog | The key lacks the **Sales** role. Create a new key with Sales, Finance or Admin. |
| Impressions say "needs a one-time setup" | Enter an **Admin** key once and sync, then switch back to your Sales key. |
| The newest day or two show as "to fetch" | Normal. Apple publishes daily reports with a delay, and they are retried on every sync. |
| "Too many attempts" on sign-in | Wait it out, at most 15 minutes. Restarting the container also clears it. |
| "This hostname is not allowed" | You are running without a password under a non-local hostname. Add it to `OPENCONNECT_ALLOWED_HOSTS`. |

## Tech

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS · Radix UI · Recharts · SQLite (better-sqlite3) · Satori + resvg for marketing cards. The studio: Express, React + Vite, Playwright (headless Chromium) for rendering.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

OpenConnect is free to use under the [MIT License with the Commons Clause](LICENSE).

- **Allowed:** using it for your own apps, studio or company (including tracking apps that make money), changing it, forking it, and sharing it or your changes.
- **Not allowed:** selling OpenConnect, for example as a paid product, a paid hosted service, or paid support whose value comes mainly from OpenConnect.

The Commons Clause makes this "source-available" rather than open source by the OSI definition. The code is fully open, but nobody gets to profit from reselling it.

OpenConnect is not affiliated with or endorsed by Apple Inc. App Store and App Store Connect are trademarks of Apple Inc.
