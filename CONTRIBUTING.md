# Contributing

Thanks for helping make OpenConnect better. Bug reports, ideas and pull requests are all welcome.

By contributing, you agree that your contribution is licensed under the project's [MIT + Commons Clause license](LICENSE).

## Reporting bugs and ideas

Open an [issue](https://github.com/OddOmens/OpenConnect/issues/new/choose). For bugs, include:
- how you run it (Docker / `npm run dev`) and the version (Settings → About)
- what you did, what you expected, and what happened
- relevant lines from `docker logs openconnect`

**Never paste your `.p8` key, Issuer ID, Vendor Number or `.env`.** Remove sales figures you'd rather not share.

Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Development

```bash
npm install
cp .env.example .env.local   # your own API key details
npm run dev                  # http://localhost:3000
```

Before opening a pull request:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

CI runs the same checks, plus a Docker build.

## Code layout

| Path | What lives there |
| --- | --- |
| `app/` | Pages and API routes (Next.js App Router) |
| `components/` | UI: `dashboard/`, `settings/`, `share/`, `auth/`, and `ui/` primitives |
| `lib/sync.ts` | Sync jobs: which report dates to fetch, storing them |
| `lib/sync-report.ts` | The "what changed" report after each sync |
| `lib/asc-client.ts`, `lib/itunes-client.ts` | Apple APIs |
| `lib/queries.ts`, `lib/data.ts` | Dashboard queries over SQLite |
| `lib/auth.ts` | Password, sessions, CSRF and rate limiting |
| `lib/db.ts` | Schema and migrations |

## Releasing (maintainers)

1. Bump `version` in `package.json` (and `package-lock.json` via `npm install`), and add a section for it to `CHANGELOG.md`.
2. Merge to `main`, then tag: `git tag v1.2.3 && git push origin v1.2.3`.
3. The Release workflow publishes `ghcr.io/oddomens/openconnect` and creates the GitHub Release from the changelog.

## Guidelines

- Keep pull requests focused. One change per PR is easiest to review.
- Match the surrounding style: short comments that explain *why*, and plain names.
- Every API route must call `guard()`, and every page `requireSignIn()`.
- Database changes go in `lib/db.ts` and must upgrade existing installs (`addColumns`, or a schema version bump).
- UI changes should work in light and dark mode and on narrow screens. Include a screenshot in the PR.
- Never commit anything from `data/`, `keys/` or `.env`.
