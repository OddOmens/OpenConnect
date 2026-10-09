---
name: openappshot
description: Build, revise and export App Store screenshots with the local OpenAppShot studio. Use when the user asks to make, update or export App Store / Mac App Store screenshots, capture screenshots of their iOS/iPad/Mac app for the store, write screenshot headlines, or change the style of an app's screenshots in OpenAppShot.
---

# OpenAppShot

OpenAppShot is a local web studio (default `http://127.0.0.1:4317`) that turns raw app screenshots into
App Store marketing slides: a colored background, a headline, and the screenshot with rounded corners and a
thin stroke. The user edits in the browser; you drive it with the `appshot` CLI.

## Cost

Nothing here calls the Claude API. OpenAppShot is a local app with no API key; *you* (Claude Code, on the
user's subscription) drive it through the `appshot` CLI. Keep it that way: don't add API calls to the app.

## Before anything

1. Check the server: `appshot status`. If it can't connect, start it from the OpenAppShot folder
   (`npm run dev`, as a background process) and retry. `appshot` is on PATH after `npm run install:claude`;
   otherwise run `node <OpenAppShot>/bin/appshot.mjs`.
2. **Recall the app.** From inside the app's repo run `appshot here`. It prints the app linked to this folder
   with its remembered profile (bundle id, what it does, audience, brand colors, which screens to capture
   and how, past decisions), the app-wide style, every slide, and guideline issues. Read it before doing
   anything else and follow what it says.
3. If nothing is linked, check `appshot status` for an app with the same name and link it with
   `appshot profile "<App>" --project .`; otherwise create it:
   `appshot create "App Name" --preset neutral --subtitle "Short tagline" --icon path/to/icon.png --project .`
   Look for the icon in `Assets.xcassets/AppIcon.appiconset/` (the 1024px PNG).
4. **Remember what you learn.** Fill in the profile the first time and add to it as you go, so the next session
   doesn't rediscover it:

```bash
appshot profile . --bundle-id com.acme.stretch --category "Health & Fitness" \
  --description "Guided stretching routines in five minutes or less" --audience "Desk workers" \
  --brand-colors "#16a34a,#f0fdf4" --screens "1. Today (launch)\n2. Programs tab\n3. Routine: tap first card"
appshot profile . --add-note "User prefers left-aligned headlines; avoid the word 'workout'"
```

`appshot data .` prints the same as clean JSON (style; per device: screenshot count and slides missing one;
per slide: headline, subtitle, screen shown, screenshot size and source per device).
Record which screen each slide shows with `--screen "Stats tab" --screen-notes "how to get there"` on
`capture`/`slide` (or `--screens "A|B|C"` on `add`) so screenshots can be re-captured later.

`<app>` can be the id, exact name, bundle id, or `.` for the app linked to the current folder.
`<slide>` is a slide id or 1-based position. Apps are stored in `~/.openappshot`.

## Capturing screenshots

**iOS / iPadOS Simulator.** Build and run the app, navigate to each screen listed in the profile, then:

```bash
appshot capture . --clean-status-bar            # first capture: sets 9:41, full battery/signal
appshot capture . --headline "Plan *every* workout"
appshot capture . --slide 3                     # replace slide 3's screenshot instead of adding
```

`capture` uses the booted simulator (`--udid` to choose one). The device is detected from the exact pixel
size: iPhone, iPhone Duo (foldable, inner 2007×2853 / outer 1398×2034) or iPad. Boot the matching simulator
for each device; screenshots fill the same slides' slot for that device.

**Existing files** (PNG/JPEG; device auto-detected, or pass `--device iphone|duo|ipad|mac`):

```bash
appshot add . shots/*.png --headlines "First *headline*|Second one|Third"
```

`add` fills slides that are missing a screenshot for that device, in order, then creates new slides. So
adding 5 iPad screenshots to an app with 5 iPhone slides pairs them up slide by slide.

**Mac.** `appshot capture . --mac "App Name"` screenshots the app's frontmost window without its shadow
(the terminal needs Screen Recording permission the first time).

## How it's organized

- **Slides are content only**: headline, subtitle, one screenshot per device, and which screen it shows.
- **Style is app-wide**: layout, colors, font, alignment, headline size, screenshot size and position, and
  the screenshot frame live on the app and apply to every slide. There is no per-slide styling and no
  approval step.

## Writing slides

```bash
appshot slide . 2 --headline "Tailored *Programs*\n& Routines" --subtitle "Built around your goals"
appshot slide . 2 --screen "Programs tab" --screen-notes "Tab bar → Programs"
appshot new-slide . --at 1 --headline "Get *Flexible*\nStarting Now"
appshot move . 5 2
appshot rm-slide . 4
```

- `*asterisks*` color words with the highlight color. `\n` breaks a line. Keep headlines to 2–6 words per
  line, two lines max, and lead with the benefit ("Stretch in under *5 minutes*"), not the feature name.
- Apple's rules (checked automatically; `appshot status` lists violations with `!`): no prices or
  discounts, URLs, ©/®/™, other platforms or stores, or Apple recognitions (App of the Day, Editors'
  Choice). Avoid unverifiable claims (#1, award-winning). Max 10 screenshots per device. The first three
  can show in search results, so put the strongest pitch there and tell a story in usage order.
- Apple asks for short phrases that add to the visual rather than describe it, and the focal point near
  the center so nothing important is clipped.
- A slide is exported for every device it has a screenshot for.

## Styling (applies to every slide)

```bash
appshot update . --preset green
appshot update . --layout top|bottom|side --align left|center --alternate on|off
appshot update . --font "Geist Variable" --size 96 --scale 1.1 --offset -120
appshot update . --stroke-color "#bbf7d0" --stroke-width 5 --radius 9 --shadow 0.2
appshot update . --set theme.palettes.primary.background.color=#14532D --set theme.palettes.primary.accentColor=#FDE68A
appshot update . --devices iphone,duo,ipad,mac
appshot update . --set exportSizes.iphone='["Large 1320 × 2868","Medium 1206 × 2622"]'
```

- Layouts: `top` (headline over screenshot, default), `bottom` (screenshot over headline), `side` (text left,
  best for Mac / landscape iPad).
- `--alternate on` uses the second color scheme (`theme.palettes.alt`) on every other slide, like the
  dark-green / cream fitness style (the `forest` preset turns this on).
- There is one style per app, shared by iPhone, iPhone Duo, iPad and Mac; only sizing adapts to each canvas.
- A preset changes colors and type only; layout, alignment, screenshot size/position and background photos stay.
- Themes are built on the shadcn/ui palette: `neutral` (default), `zinc`, `blue`, `green`, `rose`, `orange`,
  `violet`, `yellow`, plus `forest`. Pick the one closest to the brand colors in the profile, then adjust.
- Fonts: Geist Variable, Outfit Variable, Inter Variable, Plus Jakarta Sans Variable, DM Sans Variable,
  Manrope Variable, Sora Variable, Urbanist Variable, Space Grotesk Variable, Fraunces Variable, Poppins,
  -apple-system. Match the app's brand colors (asset catalog AccentColor / color sets) when no preset fits.

## Bulk: apply a spec

For a whole set at once, write a JSON spec and `appshot apply spec.json`. Paths are relative to the spec
file. It updates the app named in `name` (or `--app`) or creates it.

```json
{
  "name": "Stretic",
  "profile": { "projectPath": "/Users/me/Developer/Stretic", "bundleId": "com.acme.stretic" },
  "subtitle": "120+ guided stretches",
  "icon": "./AppIcon-1024.png",
  "preset": "forest",
  "layout": "top",
  "align": "center",
  "devices": ["iphone", "duo", "ipad"],
  "replaceSlides": true,
  "slides": [
    { "headline": "Tailored *Programs*\n& Routines", "screen": { "name": "Programs tab" }, "shots": { "iphone": "./shots/programs.png", "ipad": "./ipad/programs.png" } },
    { "headline": "Stretch in Under\n*5 Minutes*", "shots": { "iphone": "./shots/routine.png" } }
  ]
}
```

Without `replaceSlides`, slides update by position and extras are appended. Slides take `headline`,
`subtitle`, `screen` and `shots`; style keys (`preset`, `layout`, `align`, `alternate`, `font`, `theme`)
go at the top level. `appshot spec .` prints the full current JSON.

## Check your work

1. `appshot preview .` (or `--slide 2,3 --device iphone`) renders PNGs and prints their paths.
   **Read the images** and fix clipped headlines, awkward line breaks, wrong screenshots, or low contrast
   before telling the user it's ready.
2. `appshot open .` opens the editor so the user can look and tweak.

## Export

```bash
appshot export .                             # every enabled device and chosen size
appshot export . --device iphone,ipad --out ~/Desktop/AppStore
```

Each device renders every export size chosen in the editor (App tab), natively, into
`<device>/<W>x<H>/NN-headline.png`, plus a zip. Defaults follow App Store Connect's current requirements:
iPhone Large 1320×2868 **and** Medium 1206×2622 (Medium is required), iPhone Duo inner 2007×2853
(required from April 2027 for iOS 27.1 SDK apps), iPad 13" 2064×2752, Mac 2880×1800. Landscape sizes are
available too.

## API

Everything the CLI does is plain HTTP on the same server (`/api/apps`, `/api/apps/:app/slides/:slide`,
`/api/apps/:app/screenshots` multipart, `/api/apps/:app/apply`, `/api/apps/:app/export`, …) — see
`server/index.ts`. The editor updates live when the API changes something.
