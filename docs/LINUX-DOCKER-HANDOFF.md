# Handoff: run OpenAppShot in Docker on a Linux server

Status (October 2026): the app runs locally on a Mac (`npm run dev`, port 4317, data in `~/.openappshot`).
Next step is hosting the server in Docker on a Linux box and using it from the Mac's browser.
Read `CLAUDE.md` and `README.md` first.

## Target setup

- Linux server runs the OpenAppShot server (editor, API, storage, PNG export) in Docker.
- The Mac opens the editor at `http://<server>:4317` (LAN/Tailscale) or `http://localhost:4317` through
  `ssh -L 4317:localhost:4317 user@server`.
- Capture stays on the Mac: `bin/appshot.mjs capture` needs Xcode (`xcrun simctl`) and macOS
  `screencapture`. The Mac runs the CLI with `APPSHOT_URL=http://<server>:4317`, which uploads over HTTP.

## Work to do

1. **Container**
   - Dockerfile on `mcr.microsoft.com/playwright` (matching the installed `playwright` version) so headless
     Chromium works for export. `npm ci`, `npm run build`, run `NODE_ENV=production tsx server/index.ts`.
   - `server/renderer.ts` falls back to cached macOS Chromium paths; on Linux the default
     `chromium.launch()` should work in the Playwright image.
   - docker-compose with a volume for `APPSHOT_DATA` (e.g. `/data`), port 4317, restart policy.
2. **Bind address**: `server/index.ts` listens on `HOST ?? 127.0.0.1`. Set `HOST=0.0.0.0` in the container.
   Rendering calls back into the server via `BASE_URL = http://127.0.0.1:${PORT}`, which is fine inside the container.
3. **Remote-aware CLI** (`bin/appshot.mjs`): `preview` and `export` currently write files on the server and
   print server paths. When `APPSHOT_URL` is not local, download the PNGs/zip to the Mac (e.g. into a temp or
   `--out` dir) — the zip is served at `/exports/<name>.zip`, single slides at
   `/api/apps/:app/slides/:slide/render/:device.png?scale=`. Claude on the Mac must be able to read previews.
4. **MCP server** (`bin/appshot-mcp.mjs`): `ensureServer()` spawns a local server when the URL is unreachable.
   Skip auto-start when `APPSHOT_URL` points at a remote host; report the error instead.
5. **Access control**: there is no auth. Fine on a trusted LAN/Tailscale or behind an SSH tunnel. If exposed
   further, add a shared token (e.g. `APPSHOT_TOKEN` checked in an Express middleware; CLI/MCP/editor send it).
6. **Move existing data**: copy the Mac's `~/.openappshot/apps/` into the server volume. Asset files are
   referenced by relative name, so a straight copy works.

## Don'ts

- Don't add Anthropic API calls — the user drives this with Claude Code / the Claude app on their subscription.
- Keep slides content-only and all styling app-wide (see `CLAUDE.md`).
