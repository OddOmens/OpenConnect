---
name: openappshot
description: Build, revise and export App Store screenshots with the OpenConnect screenshot studio, and use OpenConnect Marketing. Use when the user asks to make, update or export App Store / Mac App Store screenshots, capture screenshots of their iOS/iPad/Mac app for the store, write screenshot headlines, or change the style of an app's screenshots in the studio; or to make social/marketing cards or posts for their app, or to read its App Store figures (downloads, proceeds, impressions, conversion) and projections from OpenConnect.
---

# Screenshot Studio

OpenConnect's screenshot studio (at `<OpenConnect>/studio`) is a web app that turns raw app screenshots into
App Store marketing slides: a colored background, a headline, and the screenshot with rounded corners and a
thin stroke. The user edits in the browser; you drive it with the `appshot` CLI.

## Cost

Nothing here calls the Claude API. The studio needs no Anthropic API key; *you* (Claude Code, on the
user's subscription) drive it through the `appshot` CLI. Keep it that way: don't add API calls to the app.

## Before anything

1. Check the server: `appshot status`. It talks to OpenConnect at `$OPENCONNECT_URL/studio` with the API token
   in `$OPENCONNECT_TOKEN`. If it says the token is invalid or missing, ask the user to create one in OpenConnect
   (Settings → Security → API tokens) and set both variables; don't try to start a server yourself. Without
   `OPENCONNECT_URL` it uses a local studio (`npm run dev` in `<OpenConnect>/studio`). `appshot` is on PATH after
   `npm run install:claude`; otherwise run `node <OpenConnect>/studio/bin/appshot.mjs`.
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

- **Slides are content**: headline, subtitle, one screenshot per device, which screen it shows, which part
  of each screenshot to call out, and whether it's the hero slide.
- **Style is global, slides can override it**: layout, colors, font, alignment, headline size, screenshot
  size and position, the frame (outline or drawn device) and how callouts look live on the app and apply to
  every slide. A slide can change any of these for itself (`--style`), and `--reset-style` goes back to the
  app style. Prefer app-wide changes; override a slide only when it should deliberately differ (e.g. one
  light slide in a dark set). The hero design is shared by all hero slides. No approval step.

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

### Screenshot sets (testing alternatives)

An app has a **primary** set and any number of test sets. Each set has its own slides, style and product page
assets; profile, icon, devices and sizes are shared. Add `--in "<set>"` to any command to work on a set.

```bash
appshot sets .                                   # list (* = primary)
appshot set-new . "Bold blue"                    # copy of the primary; --from <set> to copy another, --blank for none
appshot update . --in "Bold blue" --preset blue  # style changes stay in that set
appshot slide . 1 --in "Bold blue" --headline "Talk, *don't type*"
appshot preview . --in "Bold blue" --slide 1
appshot export . --in "Bold blue"
appshot set-primary . "Bold blue"                # the winner becomes primary; the old one stays as a set
appshot set-rename . "Bold blue" "Blue"; appshot set-rm . "Blue"
```

Never change the primary set when the user asked to try something — make a set for it. MCP tools take `set`;
`manage_sets` lists/creates/renames/deletes/promotes.

### Languages (localized screenshots)

Slides are written in the app's base language (default en-US). Each translation language gets its own
headlines, subtitles, product page text and hero badge text, and optionally its own screenshots (the app running
in that language); the design, stickers and callouts are shared. Codes are App Store Connect localizations
(de-DE, fr-FR, es-ES, es-MX, ja, ko, zh-Hans, zh-Hant, pt-BR, it, nl-NL, sv, ar-SA, he…). `--lang <code>` works
on any command, like `--in`. Untranslated text falls back to the base language (and is flagged).

```bash
appshot languages . --add de-DE,ja,fr-FR          # also --rm, --base
appshot translations . de-DE                      # base text next to each translation, what's missing
appshot translate . de-DE de.json                 # many at once (see below); "-" reads stdin
appshot slide . 2 --lang de-DE --headline "Jeden Euro\n*im Blick*"
appshot creative . header --lang de-DE --headline "Dein *Geld*, geordnet"
appshot update . --lang de-DE --badge-title "4,9 Sterne"
appshot shot . 2 shot-de.png --device iphone --lang de-DE   # a screenshot taken in German (or add/capture --lang)
appshot preview . --lang de-DE                    # look at it
appshot export .                                  # every language, a folder each; --lang de-DE,ja for some
```

`de.json`: `{"slides": [{"slide": 1, "headline": "…", "subtitle": "…"}], "creatives": {"header": {"headline": "…"}},
"hero": {"badgeTitle": "…", "badgeCaption": "…"}}` (a bare array means slides).

When translating:
- Write for the store in that country, not word for word: the same pitch, idiomatic, as short as the original.
  German and French run ~30% longer; shorten rather than shrink the type. Use the formal/informal register the
  app itself uses (check the profile notes, or ask).
- Keep the `*asterisks*` on the words that carry the point (they may move), and keep `\n` breaks sensible.
- Run the same Apple checks (no prices, no other platforms) and keep numbers in local format (4,9 / 4.9).
- Then **preview every language** and read the images: watch for headlines that wrap to too many lines.
  Japanese, Chinese, Korean, Arabic, Hebrew, Thai and Hindi are drawn with bundled Noto fonts; Arabic and
  Hebrew run right to left automatically.
- Remember choices (tone, terms not to translate) in the profile notes. MCP: `languages`, `translate`, and `lang`
  on get_app, update_slide, update_creative, set_screenshot, preview_slide and export (`languages`).

## Hero slide and callouts

```bash
appshot slide . 1 --hero on                          # badge, app icon + name, leaning device
appshot update . --badge rating --badge-title "4.9 Stars" --badge-caption "From 62k+ ratings"
appshot update . --badge downloads --badge-title "1M+ Downloads" --badge-caption "Worldwide"
appshot update . --badge none --lockup on --tilt -6
appshot slide . 3 --callout 40,820,1240,360          # box in that screenshot's pixels (x,y,w,h)
appshot slide . 3 --callout 0.03,0.28,0.94,0.12 --device ipad   # or 0–1 fractions, per device
appshot slide . 3 --callout off
appshot update . --callout-scale 1.15 --callout-shadow 0.4 --callout-radius 28
```

- Make slide 1 the hero; keep the others standard. Badge kinds: `rating` (five stars), `downloads` (download
  mark), `custom` (text only), `none`. Only show a rating or download count the App Store really shows —
  otherwise use `custom` with a true short claim ("Free", "No account needed") or `none`.
- A callout lifts one element (a card, a row, a key button) out of the screenshot, larger and with a shadow.
  Use it on 1–3 slides where one element *is* the point of the headline. Mark the whole element with a little
  margin, pick boxes from the screenshot's real pixels (`appshot data .` gives each size), and check with
  `appshot preview . --slide n`. iPhone and iPad screenshots differ, so mark each device separately.

## Styling (applies to every slide)

Backgrounds and effects:

```bash
appshot update . --background mesh --mesh-colors "#0b080f,#f66767,#5b21b6" --shuffle   # soft aurora blobs
appshot update . --panorama on              # one background across all slides (gradients, mesh, photos, textures)
appshot update . --texture grain --texture-strength 0.2    # or dots / grid / lines (--texture-spacing 28)
appshot update . --vignette 0.4 --glow 0.6 --glow-color highlight    # darker edges; light behind the screenshot
appshot update . --background frosted --set theme.palettes.primary.background.overlay=0.35  # blurred own screenshot
```

Panorama + mesh or a wide gradient is the strongest look; keep textures subtle (0.1–0.25). Mesh and gradient colors
come from the brand colors in the profile. Frosted suits colorful UIs; on dark UIs prefer mesh with a glow.

Stickers, headline marks and decorations:

```bash
appshot emoji rocket                         # find emoji slugs
appshot sticker . 1 add rocket --x 0.84 --y 0.13 --size 220 --rotate 12          # 3D emoji (--style color|flat|apple)
appshot sticker . 1 add arrow-curve --doodle --x 0.2 --y 0.2 --rotate 150 --color "#ffffff"
appshot sticker . 1 list; appshot sticker . 1 set 2 --layer back; appshot sticker . 1 rm 1
appshot update . --mark circle --mark-width 7          # marks on *highlighted* words (underline/double/strike are straight)
appshot update . --mark marker --marker-opacity 35 --marker-height 0.5 --marker-round 1   # highlighter; --marker-position, --marker-tilt
appshot update . --decor waves --panorama on --decor-opacity 0.6 --shuffle-decor
```

`--style apple` (Apple's emoji) works only when `appshot emoji` prints "Styles: … apple"; prefer it then, since it
matches what users see on their iPhone. Keep Apple emoji at size 250 or less (160 px bitmaps).

Use stickers sparingly: one or two per slide, near the corners, never covering the headline or the key UI. Pick
emoji that match the slide's point (🔒 privacy, ⚡ speed, 🎙️ voice). Arrows work best pointing from the headline
toward a callout. Keep decorations behind and subtle; one decoration style per set.

One slide can differ: `appshot slide . 4 --style palettes.primary.background.color=#fafafa --style
palettes.primary.textColor=#0a0a0a` (any theme path); `appshot slide . 4 --reset-style frame.kind` or
`--reset-style` alone to go back to the app style. `appshot status` lists each slide's own style.

```bash
appshot update . --preset green
appshot update . --layout top|bottom|side --align left|center --alternate on|off
appshot update . --font "Geist Variable" --size 96 --scale 1.1 --offset -120 --text-offset 40
appshot update . --stroke-color "#bbf7d0" --stroke-width 5 --radius 9 --shadow 0.2
appshot update . --frame device --device-color "#2b2b2e"   # drawn iPhone/iPad/Mac; --frame outline to go back
appshot update . --set theme.palettes.primary.background.color=#14532D --set theme.palettes.primary.accentColor=#FDE68A
appshot update . --devices iphone,duo,ipad,mac
appshot update . --set exportSizes.iphone='["Large 1320 × 2868","Medium 1206 × 2622"]'
```

- Layouts: `top` (headline over screenshot, default), `bottom` (screenshot over headline), `side` (text left,
  best for Mac / landscape iPad).
- `--alternate on` uses the second color scheme (`theme.palettes.alt`) on every other slide, like the
  dark-green / cream fitness style (the `forest` preset turns this on).
- There is one style per app, shared by iPhone, iPhone Duo, iPad and Mac; only sizing adapts to each canvas.
- A preset changes colors and type only; layout, alignment, screenshot size/position, frame kind, callout and
  hero settings and background photos stay.
- `--frame device` draws the hardware: iPhone with Dynamic Island and side buttons, iPad, or a Mac laptop.
  Device colors: `#2b2b2e` black, `#d9dadc` silver, `#bdb6aa` natural, `#c9a98a` desert, `#3d4a5c` blue.
  Screenshots should include a clean status bar (`capture --clean-status-bar`) so the device looks real.
- Themes are built on the shadcn/ui palette: `neutral` (default), `zinc`, `blue`, `green`, `rose`, `orange`,
  `violet`, `yellow`, plus `forest`. Pick the one closest to the brand colors in the profile, then adjust.
- Fonts: Geist Variable, Outfit Variable, Inter Variable, Plus Jakarta Sans Variable, DM Sans Variable,
  Manrope Variable, Sora Variable, Urbanist Variable, Space Grotesk Variable, Fraunces Variable, Poppins,
  -apple-system. Match the app's brand colors (asset catalog AccentColor / color sets) when no preset fits.

## Product page header and search results (iOS 27+)

One header and one search results asset per app. They use the app's Style and screenshots from the slides.

```bash
appshot creative . header --headline "Speak. *It writes.*" --subtitle "Private dictation" --text center --include on
appshot creative . search --headline "Voice notes that\n*organize themselves*" --text left --shots 1,3,2 --include on
appshot creative . search --shots 2:ipad,4 --shot-scale 1.2      # slide positions, iPhone unless :device
appshot preview . --creative header                              # look at it before exporting
```

- Header: 3840×1646, safe area 1646×661. Search: 3840×2560, safe area 2168×1030. Text and screenshots are
  kept inside the safe area automatically; screenshots shrink to fit.
- Apple: one short phrase, one clear focal point. The header sets the tone for a first-time visitor; the
  search asset must make what the app does obvious, so show the real interface (`--text left` with 2–3
  screenshots works well). Same text rules as screenshots (no prices, URLs, other platforms).
- `--include on` adds it to `appshot export` (files land in `product-page/`). `appshot data .` shows both
  under `creatives`.

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
`<device>/<W>x<H>/NN-headline.png`, plus a zip. With translations, each language gets a folder:
`<lang>/<device>/<W>x<H>/…` (same file names in every language); the output lists slides that weren't translated. Defaults follow App Store Connect's current requirements:
iPhone Large 1320×2868 **and** Medium 1206×2622 (Medium is required), iPhone Duo inner 2007×2853
(required from April 2027 for iOS 27.1 SDK apps), iPad 13" 2064×2752, Mac 2880×1800. Landscape sizes are
available too.

## Marketing (OpenConnect)

OpenConnect's Marketing page and dashboard figures, through the same CLI. The token needs the **Marketing**
scope (Settings → Security → API tokens); if a command says it doesn't have it, ask the user for one that does.
`[app]` is OpenConnect's app id, name or bundle id, or `all` (not the studio's app id).

```bash
appshot marketing apps                                  # apps, card templates, formats, styles, stat tiles
appshot marketing stats "My App" --range 90d            # the figures the cards show, vs the previous period
appshot marketing forecast "My App" --horizon 90        # projections, funnel, what-if, next milestone
appshot marketing promo "My App"                        # screenshot ids, default wording, quotable reviews
appshot marketing card "My App" overview --range 30d --format 9x16
appshot marketing card "My App" launch --style glow --format 1x1 --headline "Meet\nMy App" --shots s:abc,a:1
```

- Read `stats` (and `forecast` when talking about the future) before writing a post, and quote figures exactly
  as returned. Projections are estimates with a range, never promises: say "on track for about X".
- Stats cards: overview, reach, map, rating, review, milestone (4x5 or 9x16). Promo cards for one app: launch,
  update, screens, loved, reviews, download (1x1, 4x5, 9x16, 16x9). Open the PNG it prints and look at it
  before handing it over.
- The what-if scenarios answer "what could we get": more impressions at today's conversion, or converting like
  the best 28 days again. Conversion work (screenshots, product page) is where the studio comes in.

## API

Everything the CLI does is plain HTTP on the same server (`/api/apps`, `/api/apps/:app/slides/:slide`,
`/api/apps/:app/screenshots` multipart, `/api/apps/:app/apply`, `/api/apps/:app/export`, …) — see
`server/index.ts`. The editor updates live when the API changes something.
