# OpenAppShot

Local studio for App Store screenshots. Express + Vite (single process on :4317), React editor, Playwright for PNG export.

- Run: `npm run dev` (serves API + editor with Vite middleware). `npm run typecheck` before finishing changes.
- To *use* the tool (make screenshots for an app), follow `.claude/skills/openappshot/SKILL.md` and the `appshot` CLI (`bin/appshot.mjs`).

## Layout
- `src/shared/` — data model (`types.ts`), device specs and App Store sizes (`devices.ts`), shadcn-based theme presets and merge helpers (`presets.ts`), Apple guideline checks (`guidelines.ts`). Shared by server, editor and render page.
- `src/render/SlideView.tsx` — the one slide renderer. Used by the editor preview (scaled) and by `/render`, which Playwright screenshots at native size. Change visuals here only.
- `src/components/` — editor UI. `src/Editor.tsx` holds state, debounced saves and the live-update SSE subscription.
- `server/store.ts` — JSON-on-disk storage in `~/.openappshot/apps/<id>/app.json` + `assets/` (`APPSHOT_DATA` overrides). `profile.projectPath` links an app to its repo.
- `server/renderer.ts` — headless Chromium export; falls back to any cached Playwright Chromium, then system Chrome.
- `bin/appshot.mjs` — dependency-free CLI over the HTTP API.
- `bin/appshot-mcp.mjs` — MCP server for the Claude desktop app (stdio; starts the HTTP server if needed, unless `APPSHOT_URL` is remote). Keep its tools in step with the CLI.
- `bin/remote.mjs` — when the server's files aren't on this disk (Docker on another box), downloads preview PNGs and export zips for the CLI and MCP.
- `src/shared/summary.ts` — `buildAppData`, the clean per-app record behind `/api/apps/:app/data`, `appshot data` and the MCP `get_app` tool.

## Conventions
- Theme/slide sizes are in units of `min(canvasW, canvasH) / 1000` so one design works on iPhone, iPad and Mac.
- New slide/theme fields need a default in `newSlide`/`newApp` (presets.ts); `migrate()` in the store backfills old files.
- The app must never call the Claude API — Claude Code drives it via the CLI so it costs no API credits.
- Editor chrome follows shadcn/ui tokens in `src/styles.css` (light + dark).
- Slides hold content: headline, subtitle, shots, screen, `role` ('hero' or 'standard') and `callouts` (per device, a rect as 0–1 fractions of that screenshot), plus an optional `style` override.
- Style is global with per-slide overrides: `app.theme` is the look of every slide; `slide.style` (a partial theme, `StyleOverride`) changes any of it for that slide only. Always render with `slideTheme(app, slide)`, never `app.theme` directly. A null leaf or `style: null` reverts to the app style (`pruneOverride` cleans it up). In the editor, `StyleControls` serves both the Style tab and a slide's "Style for this slide" section through a `StyleScope`.
- The hero design (`theme.hero`: badge kind/text, logo lockup, tilt) is app-wide, shared by every hero slide, and edited in the Slide tab only when the slide is a hero. No approval workflow.
- Screenshot sets: an app's own `theme`/`slides`/`creatives` are the primary set; `app.sets` holds the others (`ScreenshotSet`). Everything else on the app is shared. `setView(app, set)` (src/shared/sets.ts) returns an App-shaped view of one set, so renderers, checks and summaries work unchanged; render with a view, never mix. Store writes go through `open(app, set)` + `commit()`, which writes the set's parts back to the set and shared parts to the app; `save()` refuses a view. API routes take `?set=`, the CLI `--in`, MCP tools `set`. The editor canvas (`SetsBoard`) shows a row per set; `actionsFor(setId)` scopes edits.
- Backgrounds are drawn by `src/render/background.tsx` as layers under the slide content: fill (`fillCss`: solid, linear, radial, image, mesh), frosted screenshot, texture, vignette. With `theme.panorama` the fill and texture are laid out over a strip as wide as all slides and each slide shows its slice; a panorama always uses the primary palette's background. The glow is drawn by `Frame`.
- Stickers (`slide.stickers`, content per slide): emoji from `vendor/fluent-emoji` (fetched by `scripts/fetch-emoji.sh`, gitignored, served at `/vendor/emoji`, searched via `/api/emoji`) or doodles from `DOODLES` in `src/render/rough.ts`, drawn by `StickerLayer` behind (z1) or in front of (z3) the slide content. Headline marks (`theme.annotation`) are measured from the highlighted spans and drawn with rough.js in `Headline`; decorations (`theme.decor`) are seeded SVG shapes in `src/render/decor.tsx`, inside the background layers. rough.js shapes always use a fixed seed so editor and export match.
- `app.creatives` holds the product page header and search results assets (iOS 27+). Specs and Apple's safe areas live in `src/shared/creatives.ts`; `src/render/CreativeView.tsx` draws them with the app theme and keeps text and screenshot fans inside the safe area; `renderCreative` in the renderer exports them; the editor shows them in the Product page tab (`CreativesBoard`, `CreativePanel`).
- `theme.frame.kind` is 'outline' (stroke) or 'device' (hardware drawn in CSS in `SlideView.tsx`, `HARDWARE` per device).

## Docker

`Dockerfile` (Playwright image; keep its tag in step with the `playwright` version) + `docker-compose.yml`
(port 4317, data in `./data`, runs as the host user) + optional `docker-compose.tailscale.yml` for HTTPS on
the tailnet. Background in `docs/LINUX-DOCKER-HANDOFF.md`.
