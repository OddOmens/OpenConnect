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
- `bin/appshot-mcp.mjs` — MCP server for the Claude desktop app (stdio; starts the HTTP server if needed). Keep its tools in step with the CLI.
- `src/shared/summary.ts` — `buildAppData`, the clean per-app record behind `/api/apps/:app/data`, `appshot data` and the MCP `get_app` tool.

## Conventions
- Theme/slide sizes are in units of `min(canvasW, canvasH) / 1000` so one design works on iPhone, iPad and Mac.
- New slide/theme fields need a default in `newSlide`/`newApp` (presets.ts); `migrate()` in the store backfills old files.
- The app must never call the Claude API — Claude Code drives it via the CLI so it costs no API credits.
- Editor chrome follows shadcn/ui tokens in `src/styles.css` (light + dark).
- Slides hold content only (headline, subtitle, shots, screen). Every visual setting belongs on `app.theme` and applies to all slides — don't add per-slide styling. No approval workflow.

## Next

Hosting on a Linux server with Docker is planned; see `docs/LINUX-DOCKER-HANDOFF.md`.
