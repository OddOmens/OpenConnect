# OpenConnect Studio

The screenshot studio inside [OpenConnect](../README.md). A studio for App Store
screenshots that Claude can drive. Drop in raw screenshots (or let Claude capture them from the Simulator),
get styled slides with headline, rounded screenshot and stroke, style the whole set at once, and export
pixel-exact PNGs for iPhone, iPhone Duo, iPad and Mac.

It runs as its own container next to the dashboard (it needs headless Chromium to render), and the dashboard
serves it at **`/studio`**, behind the same sign-in. The command-line tool is `appshot` and the MCP
server is `openappshot`, so existing Claude setups and prompts keep working.

**No API credits.** The studio never calls the Claude API and needs no API key. Claude (your subscription)
drives it through the `appshot` CLI or the MCP server, and all rendering happens on your server.

## Run it

It starts with OpenConnect: `docker compose up -d` in the repo root runs the dashboard and the studio
(see the [main README](../README.md)). Open `https://<your OpenConnect>/studio`.

- Data lives in `data/studio/` next to the dashboard's data (projects, uploads, fonts, exports).
- The studio has no port of its own; only the dashboard reaches it.

## Use it from Claude on your Mac

1. In OpenConnect, **Settings → Security → API tokens**, create a token (e.g. "Claude on my Mac"). A token
   only opens the studio, never your sales data or settings, and can be revoked any time.
2. On the Mac, in a checkout of this repo:

   ```bash
   cd studio && npm install
   export OPENCONNECT_URL=https://openconnect.<tailnet>.ts.net   # your OpenConnect address
   export OPENCONNECT_TOKEN=oc_…                                 # the token from step 1
   npm run install:claude    # Claude Code: `appshot` on PATH + the skill in ~/.claude/skills
   npm run install:desktop   # Claude desktop chat: adds the MCP connector (with the URL and token)
   ```

   Put the two `export` lines in `~/.zshrc` so Claude Code always has them.

Capture still runs on the Mac (Simulator, `screencapture`) and uploads over HTTPS. `preview` downloads its
PNGs to a temp folder and `export` downloads and unpacks the zip into `--out`
(default `~/.openappshot/exports`).

## Develop

```bash
npm install
npm run setup:emoji    # once: downloads Fluent Emoji (MIT) into vendor/ for stickers (~110 MB)
npm run dev            # standalone at http://127.0.0.1:4317 (data in ~/.openappshot)
BASE_PATH=/studio npm run dev   # as OpenConnect serves it: http://127.0.0.1:4317/studio
```

Inside OpenConnect the editor and the data API are part of the dashboard; this server only renders. Run it with
`BASE_PATH=/studio APPSHOT_DATA=<dir> npm run dev`, and the dashboard (`npm run dev` in the repo root) with the
same `APPSHOT_DATA=<dir>` and `OPENCONNECT_STUDIO_URL=http://127.0.0.1:4317`; then open
`http://localhost:3000/studio`. Editor and API changes hot-reload through Next.js.

Without `OPENCONNECT_URL`, the CLI and MCP server talk to `APPSHOT_URL` or the local dev server (and the
MCP server starts it if needed). If export says no browser is available, run `npm run setup:browser` once.

## In the editor

The layout follows design tools: the **canvas** fills the window (each set is a section with its frames side
by side, names above each frame, selection in blue), with floating panels over it: **Layers** on the left
(every set and its frames; click to jump), the toolbar on top, and the **inspector** on the right
(Slide · Style · App). Close a panel with its ⟨panel⟩ button, or hide/show all with **⌘/Ctrl + \**.
**Interface size** (bottom left) scales panels and canvas together; *Auto* picks 150% on a 4K screen without
display scaling (common on Linux) and 100% where the OS already scales.

- **Apps** on the left, each with its own icon, name, style and slides.
- **Drop screenshots** anywhere on the board. Each one fills the next slide missing that device's
  screenshot, or creates a new slide. Drop on a slide to replace its screenshot; ⌘V pastes one.
- **Stickers** (Slide tab): 1,600 3D / Color / Flat emoji (Microsoft Fluent Emoji, MIT) and 21 hand-drawn
  doodles (arrows, circles, stars, sparkles, squiggles…). Search, then drag them into place on the slide preview,
  size, rotate, flip, fade, and put them behind or in front of the screenshot.
  **Apple emoji**: Apple's artwork can't be bundled, but you can bring your own. Copy
  `/System/Library/Fonts/Apple Color Emoji.ttc` from a Mac into `fonts/` in the data directory (`./data/fonts`
  with Docker, `~/.openappshot/fonts` otherwise) and restart. The server cuts each emoji out once and an **Apple**
  look appears next to 3D / Color / Flat. Any sbix or CBDT color emoji font with "emoji" in its file name works.
  Apple's largest bitmaps are 160 px, so keep Apple emoji at moderate sizes (about 250 or less).
- **Headline marks** (Style): underline, double underline, strike (straight, set from the baseline), circle, box,
  brackets or squiggle (hand-drawn) on the `*highlighted*` words, with thickness, gap and color; or a **marker**
  (highlighter) with its own opacity (0–100%), height, position, rounded ends, tilt and brush edges.
- **Decorations** (Style): generated blobs, waves, rings, sparkles, confetti or bokeh in your colors, with
  amount, size, opacity and Shuffle; they flow across slides with Panorama.
- **Fonts** include Figtree, Onest, Lexend, Rubik, Nunito, Fredoka, Bricolage Grotesque, Unbounded, Playfair
  Display, DM Serif Display, Instrument Serif, Bebas Neue and Caveat (handwritten), all bundled.
- **Full screen**: double-click a slide (or its ⤢ button on hover) to see it large. ← → step through slides, Esc closes.
- **Device tabs** switch between iPhone, iPhone Duo, iPad and Mac. Slides share their words across devices
  and each device has its own screenshot.
- **Slide** tab: headline (`*word*` highlights, Return for line breaks), subtitle, screenshot, which screen it
  shows, whether it's the **hero slide** (its badge — rating, downloads or custom — app icon and name, and
  tilt show up here when it is), and a **callout**: drag a box on the screenshot to lift that part out, larger
  and with a shadow (per device). **Style for this slide** changes any Style setting on this slide only;
  ↺ next to a setting, or Revert all, goes back to the app style.
- **Style** tab: everything visual — shadcn-based themes, layout, alignment, screenshot size and position,
  colors (optionally alternating every other slide), typeface, the frame (an outline, or drawn iPhone / iPad /
  Mac hardware in a choice of finishes), how callouts look, how callouts look, and **background effects**: Mesh (soft blobs of three colors, shuffle for a new
  arrangement) and Frosted (the slide's own screenshot, blurred) fills, **Panorama** (one background running
  across all slides), textures (grain, dots, grid, lines), a vignette, and a glow behind the screenshot.
  **Style is the look of every slide**; a slide
  can override any of it in its Slide tab.
- **App** tab: icon, devices, export sizes, and the profile Claude remembers between sessions.
- **Export** renders every chosen size natively to `~/.openappshot/exports/<app>-<time>/<device>/<W>x<H>/NN-headline.png`
  and downloads a zip.

## With Claude

Everything runs on your subscription. The studio has its own API (reached through OpenConnect with your
token) and never calls Anthropic's API, so it uses no credits.

There are two ways in:

- **Claude Code** (terminal or the desktop app's Code tab): run `npm run install:claude` once (with
  `OPENCONNECT_URL` and `OPENCONNECT_TOKEN` set, see above). Claude uses the
  `appshot` CLI and the skill in `.claude/skills/openappshot`. Best when Claude is also building and
  running your app in the Simulator.
- **Claude desktop chat**: run `npm run install:desktop` once and restart the Claude app. It adds an
  MCP connector with tools to list apps, read an app's data, edit slides and app-wide style, add or
  capture screenshots, preview a slide as an image, and export.

### Per-app data

Every app has one clean record — `GET <OpenConnect>/studio/api/apps/<app>/data` (with the token), `appshot data <app>`,
or the `get_app` tool:

- **profile**: project folder, bundle id, what it does, audience, keywords, brand colors, screens to
  capture and how, notes
- **style**: layout, font, colors, alignment, sizes, frame — one set for the whole app
- **devices**: sizes, number of screenshots, slides missing one, guideline issues
- **slides**: position, headline, subtitle, the screen it shows and how to reach it, whether it can appear in
  search results, and each device's screenshot: pixel size, file, date added and source
  (e.g. "Simulator · iPhone 18 Pro")

`GET /api/data` returns all apps; `GET /api` lists every endpoint.

## Screenshot sets

Keep your **primary** screenshots and try alternatives next to them. Each set has its own slides, Style
and product page assets; the app's name, icon, devices, sizes and profile are shared. Every set is a row on
the canvas: click a slide in a row to work on that set (the Slide and Style tabs then only change it).
Row headers rename a set, **Duplicate** it, **Make primary** (swaps it with the current primary) or delete it;
**New set** / **Blank set** sit under the rows. Export uses the selected set, and its zip is named after it.

## Languages

Localize the screenshots for other App Store countries. **App tab → Languages** sets the language the slides
are written in and adds translations (App Store Connect codes, e.g. German, Japanese, Brazilian Portuguese).
Pick a language in the top bar to edit it: each slide shows its translation fields with the original under them,
and you can drop a screenshot taken in that language to use for that language only. The design, stickers and
callouts are shared. Untranslated slides show the base text and are marked *Not translated*.

Claude can translate for you (`appshot translations`, `appshot translate`; see the skill). Export makes one folder
per language with the same file names in each. Japanese, Chinese, Korean, Arabic, Hebrew, Thai and Hindi are drawn
with bundled Noto fonts so the editor and the export match; Arabic and Hebrew run right to left.

## Product page header and search results

iOS 27 / iPadOS 27 show two creative assets per app: a **product page header** and a **search results**
asset. The **Product page** tab edits both: headline, subtitle, app icon and name, where the text sits
(left, center, or none), up to four screenshots from your slides, and an optional own background. They use
the app's Style (colors, type, frame) so they match the screenshots. The dashed box is Apple's art safe area;
text and screenshots are kept inside it. Tick **Include in export** and they're rendered with the
screenshots into `product-page/`.

| Asset | Exported | Art safe area (centered) |
| --- | --- | --- |
| Product page header | 3840 × 1646 (21:9) | 1646 × 661 |
| Search results | 3840 × 2560 (3:2) | 2168 × 1030 |

Sizes from [App Store Connect's creative assets specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/);
safe areas from Apple's templates on [App Store asset best practices](https://developer.apple.com/app-store/asset-best-practices/), October 2026.
PNG, no transparency. (Apple also accepts one 16:9 5244 × 2950 PNG for both; not built yet.)

## Sizes

From [App Store Connect's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications), October 2026.

| Device | Exported by default | Also available |
| --- | --- | --- |
| iPhone | Large 1320 × 2868, Medium 1206 × 2622 (required) | 1290 × 2796, 1260 × 2736, 1179 × 2556, Face ID and Home button sizes, landscape |
| iPhone Duo | Inner 2007 × 2853 | Outer 1398 × 2034, landscape. Required from April 2027 for iOS 27.1 SDK apps |
| iPad | 13" 2064 × 2752 | 2048 × 2732, 11" sizes, landscape |
| Mac | 2880 × 1800 | 2560 × 1600, 1440 × 900, 1280 × 800 |
