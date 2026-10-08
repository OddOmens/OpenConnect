# OpenConnect

A self-hosted App Store Connect dashboard: downloads, proceeds, in-app purchases, subscriptions, customer reviews, plus ratings and top-chart positions in all 175 App Store storefronts. Every section, metric, column and chart series can be shown or hidden, and sections can be reordered.

## Run with Docker

```bash
cp .env.example .env          # fill in Key ID, Issuer ID, Vendor Number
cp ~/Downloads/AuthKey_XXXXXXXXXX.p8 keys/
docker compose up -d
```

Open http://localhost:3000. You can also leave `.env` empty and enter everything in **Settings**, including pasting the `.p8` contents.

- **Data** lives in `./data` (SQLite), mounted into the container. Rebuilding or upgrading the image keeps it.
- **Keys** are mounted read-only from `./keys`. The app looks for `AuthKey_<KEY_ID>.p8` there automatically.
- The container has a health check at `/api/health`.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

## API key permissions

Create a Team Key in App Store Connect → Users and Access → Integrations.

| Data | Needs |
| --- | --- |
| Apps, customer reviews | Any role (e.g. Customer Support, App Manager) |
| Sales, proceeds, IAPs, subscriptions | **Sales** role (or Finance / Admin) |
| Ratings & rankings in 175 storefronts | Nothing; uses Apple's public lookup and top-chart feeds |

## How syncing works

- The sync keeps a ledger of every report date it holds. Each run downloads only dates that are missing or failed last time, newest first, so a routine sync is a handful of requests rather than a 365-day backfill.
- Daily reports cover the last 365 days. Before that, monthly reports provide up to 5 more years (configurable). Nothing before your first app's release date is requested.
- Each report date is replaced as a unit, so re-syncing never double counts.
- Syncs run automatically: sales every 6h, ratings and rankings daily. Both intervals are configurable in Settings, and the Sync dialog shows coverage and lets you retry failed dates or force a full re-sync.
- Proceeds are converted from each report's currency to USD with daily exchange rates (open.er-api.com), then to your chosen display currency.

## Privacy

Everything personal stays out of git and out of the image. `.gitignore` and `.dockerignore` exclude `.env*` (except `.env.example`), `data/`, `keys/`, `*.p8` and `*.pem`. Credentials reach the container only at runtime, through `.env` and the mounted `keys/` folder.
