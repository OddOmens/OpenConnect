# OpenAppShot

A local studio for App Store screenshots that Claude can drive. Drop in raw screenshots (or let Claude
capture them from the Simulator), get styled slides with headline, rounded screenshot and stroke, style
the whole set at once, and export pixel-exact PNGs for iPhone, iPhone Duo, iPad and Mac.

## Start

```bash
npm install
npm run dev            # http://127.0.0.1:4317
npm run install:claude # optional: `appshot` on PATH + Claude skill in ~/.claude/skills
```

Export renders with headless Chromium. If it says no browser is available, run `npm run setup:browser` once.
Apps, screenshots and exports are saved in `~/.openappshot`, outside the repo.

**No API credits.** The app never calls the Claude API and needs no API key. Claude Code (your
subscription) drives it through the `appshot` CLI, and all rendering happens locally.

## In the editor

- **Apps** on the left, each with its own icon, name, style and slides.
- **Drop screenshots** anywhere on the board. Each one fills the next slide missing that device's
  screenshot, or creates a new slide. Drop on a slide to replace its screenshot; ⌘V pastes one.
- **Device tabs** switch between iPhone, iPhone Duo, iPad and Mac. Slides share their words across devices
  and each device has its own screenshot.
- **Slide** tab: headline (`*word*` highlights, Return for line breaks), subtitle, screenshot, and which
  screen it shows. That's all a slide holds.
- **Style** tab: everything visual — shadcn-based themes, layout, alignment, screenshot size and position,
  colors (optionally alternating every other slide), typeface, and the frame's stroke color, width, radius
  and shadow. **Every change applies to all slides in the app.**
- **App** tab: icon, devices, export sizes, and the profile Claude remembers between sessions.
- **Export** renders every chosen size natively to `~/.openappshot/exports/<app>-<time>/<device>/<W>x<H>/NN-headline.png`
  and downloads a zip.

## With Claude

Everything runs on your subscription. OpenAppShot has its own **local** API (your Mac talking to itself)
and never calls Anthropic's API, so it uses no credits.

There are two ways in:

- **Claude Code** (terminal or the desktop app's Code tab): run `npm run install:claude` once. Claude uses the
  `appshot` CLI and the skill in `.claude/skills/openappshot`. Best when Claude is also building and
  running your app in the Simulator.
- **Claude desktop chat**: run `npm run install:desktop` once and restart the Claude app. It adds a local
  MCP connector with tools to list apps, read an app's data, edit slides and app-wide style, add or
  capture screenshots, preview a slide as an image, and export. It starts the studio server by itself.

### Per-app data

Every app has one clean record — `GET http://127.0.0.1:4317/api/apps/<app>/data`, `appshot data <app>`,
or the `get_app` tool:

- **profile**: project folder, bundle id, what it does, audience, keywords, brand colors, screens to
  capture and how, notes
- **style**: layout, font, colors, alignment, sizes, frame — one set for the whole app
- **devices**: sizes, number of screenshots, slides missing one, guideline issues
- **slides**: position, headline, subtitle, the screen it shows and how to reach it, whether it can appear in
  search results, and each device's screenshot: pixel size, file, date added and source
  (e.g. "Simulator · iPhone 18 Pro")

`GET /api/data` returns all apps; `GET /api` lists every endpoint.

## Sizes

From [App Store Connect's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications), October 2026.

| Device | Exported by default | Also available |
| --- | --- | --- |
| iPhone | Large 1320 × 2868, Medium 1206 × 2622 (required) | 1290 × 2796, 1260 × 2736, 1179 × 2556, Face ID and Home button sizes, landscape |
| iPhone Duo | Inner 2007 × 2853 | Outer 1398 × 2034, landscape. Required from April 2027 for iOS 27.1 SDK apps |
| iPad | 13" 2064 × 2752 | 2048 × 2732, 11" sizes, landscape |
| Mac | 2880 × 1800 | 2560 × 1600, 1440 × 900, 1280 × 800 |
