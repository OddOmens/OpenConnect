#!/usr/bin/env node
// appshot — command-line client for a running OpenAppShot server (npm run dev).
// Designed to be driven by Claude: every command prints a short human summary, or JSON with --json.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BASE, fetchExport, fetchPreviews, serverIsLocal } from './remote.mjs';


const HELP = `appshot — drive OpenAppShot from the terminal

Server: ${BASE}  (OpenConnect: set OPENCONNECT_URL and OPENCONNECT_TOKEN; or APPSHOT_URL, or "npm run dev" here)
<app> is an app id, exact name, bundle id, or "." for the app linked to the current folder.
--in "<set>" works on any command: slides, style, creatives, preview and export of that screenshot set
(id or name). Without it, commands use the primary set.
--lang <code> works the same way for a translation language (e.g. de-DE): status/preview show that language,
--headline/--subtitle and screenshots (shot, add, capture) go to its translation. Without it: the base language.
<slide> is a slide id or 1-based position.

Apps
  status [app]                         List apps, or one app's profile, style, slides and guideline issues
  here                                 Show the app linked to the current folder (profile.projectPath)
  create <name> [--preset p] [--subtitle s] [--icon file] [--devices iphone,duo,ipad,mac] [--project dir]
                                       Presets: neutral zinc blue green rose orange violet yellow forest
  profile <app> [--project dir] [--bundle-id id] [--app-store-url u] [--category c] [--description s]
                [--audience s] [--keywords a,b] [--brand-colors #hex,#hex] [--screens s] [--notes s] [--add-note s]
                                       Show or update what's remembered about the app
  icon <app> <file>                    Set the app icon
  data [app]                           Clean JSON record of one app (or all apps): style, per-device counts,
                                       per-slide headline, screen, screenshot size and source
  spec <app>                           Print the raw app document as JSON
  delete-app <app>

Style (app-wide: every change applies to all slides)
  update <app> [--preset p] [--layout top|bottom|side] [--alternate on|off] [--align left|center]
               [--font f] [--size n] [--scale 1.0] [--offset 0] [--text-offset 0]   (offsets: + moves down)
               [--stroke-color c] [--stroke-width n] [--radius pct] [--shadow 0-1]
               [--frame outline|device] [--device-color c]       device = drawn iPhone/iPad/Mac hardware
               [--callout-scale 1.12] [--callout-shadow 0-1] [--callout-radius n]
               [--badge none|rating|downloads|custom] [--badge-title "4.9 Stars"] [--badge-caption "From 62k+ ratings"]
               [--lockup on|off] [--tilt -6]   (hero design, shared by slides marked --hero)
               [--background solid|gradient|glow|mesh|photo|frosted] [--mesh-colors base,blob,blob2] [--shuffle]
               [--panorama on|off] [--texture none|grain|dots|grid|lines] [--texture-strength 0.15] [--texture-spacing 28]
               [--vignette 0-1] [--glow 0-1] [--glow-size 1.2] [--glow-color c|highlight]
               [--decor none|blobs|waves|rings|sparkles|confetti|bokeh] [--decor-amount 1] [--decor-size 1]
               [--decor-opacity 0.5] [--decor-color c|auto] [--shuffle-decor]
               [--mark none|underline|double|circle|box|marker|strike|brackets|squiggle] [--mark-width 6]
               [--mark-roughness 1.4] [--mark-padding 14] [--mark-color c|highlight] [--mark-recolor on|off]
               [--marker-opacity 0-100] [--marker-height 0.1-1.2] [--marker-position -0.3-0.6]
               [--marker-round 0-1] [--marker-tilt -6-6]   (the highlighter; sizes are shares of the text size)
               [--sticker-shadow 0-1]
               [--font f]  fonts also include Figtree, Onest, Lexend, Rubik, Nunito, Fredoka, Bricolage Grotesque,
                           Unbounded, Playfair Display, DM Serif Display, Instrument Serif, Bebas Neue, Caveat (handwritten)
                                       (background: --background sets the main colors' fill; panorama runs
                                       one background across all slides)
               [--name s] [--subtitle s] [--devices list] [--set path.to.key=value ...]
               e.g. --set theme.palettes.primary.accentColor=#F2DE8C

Screenshots
  add <app> <files...> [--device d] [--headlines "One|Two|Three"] [--screens "Today|Stats|Settings"]
                                       Fill slides missing a screenshot for that device, then add new slides.
                                       Device is auto-detected from pixel size when omitted.
  capture <app> [--slide n] [--device d] [--udid id] [--clean-status-bar] [--headline s] [--screen name]
                                       Screenshot the booted iOS Simulator straight into the app.
  capture <app> --mac "App Name" [--slide n] [--headline s]
                                       Screenshot a running Mac app's window (no shadow).
  shot <app> <slide> <file> [--device d]   Replace one slide's screenshot

Slides (content: words, screenshots, callout, role)
  slide <app> <slide> [--headline s] [--subtitle s] [--screen "Stats tab"] [--screen-notes "how to get there"]
                      [--hero on|off] [--callout x,y,w,h|off [--device d]]
                      [--style path=value ...] [--reset-style [path]]
                                       --style overrides app style on this slide only, e.g.
                                       --style frame.kind=device --style palettes.primary.background.color=#fafafa
                                       --reset-style goes back to the app style (one path, or everything)
                                       --callout marks part of the screenshot (pixels of that screenshot, or 0–1
                                       fractions) to lift out larger. Per device; default the first with a screenshot
  new-slide <app> [--at n] [same flags as slide]
  rm-slide <app> <slide>
  move <app> <slide> <position>
  apply <spec.json> [--app <app>]      Create or update an app from a declarative spec (see SKILL.md)

Screenshot sets (the primary set plus mockups you're testing; each has its own slides, style and creatives)
  sets <app>                           List sets
  set-new <app> [name] [--from set] [--blank]
                                       Copy a set (default the primary) into a new one, or start blank
  set-rename <app> <set> <name>
  set-rm <app> <set>                   Delete a set (not the primary)
  set-primary <app> <set>              Make a set the primary one (the old primary becomes a set)

Stickers (3D emoji and hand-drawn doodles on a slide)
  emoji <words>                        Find emoji slugs, e.g. appshot emoji rocket
  sticker <app> <slide> list
  sticker <app> <slide> add <emoji-slug|doodle> [--doodle] [--style 3d|color|flat|apple] [--x 0.8] [--y 0.2]
                 [--size 200] [--rotate -8] [--layer front|back] [--color c] [--opacity 1] [--flip]
                                       x/y are the center as fractions of the slide; size in 1/1000 of the short side.
                                       apple: Apple's emoji, once Apple Color Emoji.ttc is in the server's data/fonts.
                                       Doodles: arrow-curve arrow-down arrow-loop arrow-straight underline squiggle circle
                                       star star-filled sparkle burst heart heart-filled spiral check cross exclaim
                                       lightning crown scribble bracket
  sticker <app> <slide> set <n> [same flags]   ·   sticker <app> <slide> rm <n|all>

Languages (slides are written in the base language; translations share the design)
  languages <app> [--add de-DE,ja] [--rm fr-FR] [--base en-US]
                                       Show or change the app's languages (App Store Connect codes)
  translations <app> [lang]            Base text next to each translation, and what's still missing
  translate <app> <lang> <file.json>   Set many translations at once. JSON: {"slides": [{"slide": 1, "headline": "…",
                                       "subtitle": "…"}], "creatives": {"header": {"headline": "…"}}, "hero": {"badgeTitle": "…"}}
                                       ("-" reads stdin). One slide: appshot slide <app> 2 --lang de-DE --headline "…"

Product page (iOS 27+: one header and one search results asset per app)
  creative <app> header|search [--headline s] [--subtitle s] [--text left|center|none] [--lockup on|off]
                 [--shots 1,2,3|1:ipad,2|auto] [--shot-scale 1.2] [--include on|off]
                                       Header 3840×1646 (safe area 1646×661), search 3840×2560 (safe 2168×1030).
                                       Uses the app's colors, type and frame. --shots picks slides by position
                                       (iPhone unless :device); auto uses the first slides. --include adds it to export

Output
  preview <app> --creative header|search   Render the asset to a PNG and print its path
  preview <app> [--device d] [--slide n]   Render PNGs to disk and print their paths (to look at).
                                       With a remote server they're downloaded to a temp folder
  export <app> [--device iphone,ipad] [--lang de-DE,ja] [--out dir]
                                       Renders every export size chosen in the editor (App tab), in every
                                       language (a folder each) unless --lang picks some.
                                       With a remote server the zip is downloaded and unpacked into --out
                                       (default ~/.openappshot/exports)
  open <app>                           Open the editor in the browser

Add --json to any command for machine-readable output.
Headlines: wrap words in *asterisks* to highlight them; use \\n for a line break.
Apps are stored in ~/.openappshot (override with APPSHOT_DATA on the server).`;

// ---------- args ----------
function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split(/=(.*)/s);
      let v = inline;
      if (v === undefined) v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      if (k === 'set' || k === 'style') (flags[k] ??= []).push(v);
      else flags[k] = v;
    } else pos.push(a);
  }
  return { pos, flags };
}

const { pos, flags } = parseArgs(process.argv.slice(2));
const cmd = pos.shift();
const JSON_OUT = !!flags.json;

function die(msg) {
  console.error(`appshot: ${msg}`);
  process.exit(1);
}

function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) && !/^#/.test(v)) return Number(v);
  if (typeof v === 'string' && /^[[{]/.test(v)) {
    try {
      return JSON.parse(v);
    } catch {}
  }
  return v;
}

/** "--set a.b.c=value" → { a: { b: { c: value } } } */
function setPatch(list = [], target = {}) {
  for (const entry of list) {
    const eq = entry.indexOf('=');
    if (eq < 0) die(`--set expects key=value, got "${entry}"`);
    const keys = entry.slice(0, eq).split('.');
    let o = target;
    keys.slice(0, -1).forEach((k) => (o = o[k] ??= {}));
    o[keys.at(-1)] = coerce(entry.slice(eq + 1));
  }
  return target;
}

// ---------- http ----------
async function http(method, url, body) {
  const init = { method, headers: { 'x-client-id': 'cli' } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  // --in <set>: every app-scoped call goes to that screenshot set.
  if (flags.in && flags.in !== true && /^\/api\/apps\/[^/?]+/.test(url) && !/\/sets(\/|$|\?)/.test(url)) {
    url += `${url.includes('?') ? '&' : '?'}set=${encodeURIComponent(String(flags.in))}`;
  }
  // --lang <code>: the same calls in a translation language. (A list, for export, goes in the export body.)
  if (flags.lang && flags.lang !== true && !String(flags.lang).includes(',') && /^\/api\/apps\/[^/?]+/.test(url) && !/\/(sets|translations|export)(\/|$|\?)/.test(url)) {
    url += `${url.includes('?') ? '&' : '?'}lang=${encodeURIComponent(String(flags.lang))}`;
  }
  let res;
  try {
    res = await fetch(BASE + url, init);
  } catch {
    die(`can't reach the OpenAppShot server at ${BASE}. Start it with "npm run dev" in the OpenAppShot folder.`);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    die(err.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  const type = res.headers.get('content-type') ?? '';
  return type.includes('json') ? res.json() : Buffer.from(await res.arrayBuffer());
}

async function fileForm(field, files, extra = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) fd.append(k, String(v));
  for (const f of files) {
    const p = path.resolve(f);
    if (!fs.existsSync(p)) die(`file not found: ${f}`);
    fd.append(field, await fs.openAsBlob(p), path.basename(p));
  }
  return fd;
}

const enc = encodeURIComponent;
const getApp = (ref) =>
  ref === '.' || ref === 'here'
    ? http('GET', `/api/lookup?path=${enc(process.cwd())}`)
    : http('GET', `/api/apps/${enc(ref)}`);
const expandPath = (p) => (p === '.' || p === true ? process.cwd() : path.resolve(String(p).replace(/^~/, os.homedir())));

function out(data, human) {
  if (JSON_OUT) console.log(JSON.stringify(data, null, 2));
  else console.log(typeof human === 'function' ? human(data) : human ?? data);
}

// ---------- formatting ----------
const DEVICES = ['iphone', 'duo', 'ipad', 'mac'];
const label = { iphone: 'iPhone', duo: 'iPhone Duo', ipad: 'iPad', mac: 'Mac' };

function describeProfile(app) {
  const p = app.profile ?? {};
  const rows = [
    ['project', p.projectPath],
    ['bundle id', p.bundleId],
    ['app store', p.appStoreUrl],
    ['category', p.category],
    ['what it does', p.description],
    ['audience', p.audience],
    ['keywords', p.keywords?.join(', ')],
    ['brand colors', p.brandColors?.join(', ')],
    ['screens', p.screens],
    ['notes', p.notes],
  ].filter(([, v]) => v);
  if (!rows.length) return ['profile: empty — fill it in with `appshot profile` so the next session knows this app'];
  return ['profile:', ...rows.map(([k, v]) => `  ${k}: ${String(v).replace(/\n/g, '\n    ')}`)];
}

function describeApp(app, check) {
  const t = app.theme;
  const lines = [`${app.name}  (id ${app.id})  ${BASE}/?app=${app.id}${app.activeSet ? `&set=${app.activeSet}` : ''}`];
  if (app.sets?.length) {
    const current = app.activeSet ? app.sets.find((x) => x.id === app.activeSet)?.name : app.primarySetName;
    lines.push(`set: ${current}${app.activeSet ? '' : ' (primary)'}   all sets: ${[app.primarySetName, ...app.sets.map((x) => x.name)].join(', ')}  (pick with --in)`);
  }
  lines.push(`devices: ${app.devices.map((d) => `${label[d]} (export ${(app.exportSizes?.[d] ?? [app.sizes[d]]).join(', ')})`).join('; ')}`);
  lines.push(
    `style (all slides): layout ${t.layout}, ${t.fontFamily}, align ${t.align}, colors ${t.palettes.primary.background.color}` +
      `${t.alternate ? ` alternating with ${t.palettes.alt.background.color}` : ''}, highlight ${t.palettes.primary.accentColor}`,
  );
  if (app.languages?.length || app.activeLang) {
    lines.push(`language: ${app.activeLang ?? app.baseLanguage}${app.activeLang ? '' : ' (base)'}   all: ${[app.baseLanguage, ...app.languages].join(', ')}  (pick with --lang)`);
  }
  lines.push(`icon: ${app.iconAssetId ? 'set' : 'none'}   slides: ${app.slides.length}`);
  lines.push(...describeProfile(app));
  for (const [d, issues] of Object.entries(check?.devices ?? {})) for (const i of issues) lines.push(`! ${label[d]}: ${i.message}`);
  lines.push('');
  app.slides.forEach((s, i) => {
    const has = app.devices.map((d) => `${label[d]} ${s.shots?.[d] ? '✓' : '—'}`).join(' · ');
    lines.push(`${String(i + 1).padStart(2)}. ${s.headline.replace(/\n/g, ' / ')}`);
    if (s.subtitle) lines.push(`      subtitle: ${s.subtitle}`);
    if (s.role === 'hero') lines.push('      hero slide');
    const marked = Object.entries(s.callouts ?? {}).filter(([, c]) => c).map(([d]) => label[d] ?? d);
    if (marked.length) lines.push(`      callout: ${marked.join(', ')}`);
    const own = Object.keys(flat(s.style ?? {}));
    if (own.length) lines.push(`      own style: ${own.join(', ')}`);
    if (s.screen?.name || s.screen?.notes) lines.push(`      screen: ${[s.screen.name, s.screen.notes].filter(Boolean).join(' — ')}`);
    lines.push(`      screenshots: ${has}   id ${s.id}`);
    for (const i of check?.slides?.[s.id] ?? []) lines.push(`      ${i.level === 'error' ? '! ' : '~ '}${i.message}`);
  });
  return lines.join('\n');
}

/** --callout x,y,w,h in screenshot pixels (or 0–1 fractions) → { device: rect as fractions }. */
function calloutPatch(app, slideRef, f) {
  const slide = app.slides.find((s) => s.id === slideRef) ?? app.slides[Number(slideRef) - 1];
  if (!slide) die(`no slide ${slideRef}`);
  const device = f.device ? String(f.device) : app.devices.find((d) => slide.shots[d]);
  if (!device) die('this slide has no screenshot yet; add one before marking a callout');
  if (['off', 'none', 'false'].includes(String(f.callout))) return { [device]: null };
  const asset = app.assets[slide.shots[device]];
  if (!asset) die(`slide ${slideRef} has no ${device} screenshot`);
  const n = String(f.callout).split(',').map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v) || v < 0)) die('--callout takes x,y,w,h, e.g. --callout 40,820,1240,360');
  const fractions = n.every((v) => v <= 1);
  const [x, y, w, h] = fractions ? n : [n[0] / asset.width, n[1] / asset.height, n[2] / asset.width, n[3] / asset.height];
  const c = (v) => Math.max(0, Math.min(1, v));
  return { [device]: { x: c(x), y: c(y), w: c(Math.min(w, 1 - x)), h: c(Math.min(h, 1 - y)) } };
}

/** { frame: { kind: 'device' } } → { 'frame.kind': 'device' } */
function flat(o, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, `${prefix}${k}.`, out);
    else if (v !== null && v !== undefined) out[prefix + k] = v;
  }
  return out;
}

function slideFlags(f) {
  const p = {};
  if (f.headline !== undefined) p.headline = String(f.headline);
  if (f.subtitle !== undefined) p.subtitle = f.subtitle === true ? '' : String(f.subtitle);
  if (f.screen !== undefined) p.screen = { ...(p.screen ?? {}), name: f.screen === true ? '' : String(f.screen) };
  if (f['screen-notes'] !== undefined) p.screen = { ...(p.screen ?? {}), notes: f['screen-notes'] === true ? '' : String(f['screen-notes']) };
  if (f.hero !== undefined) p.role = ['on', 'true', true, 'yes'].includes(f.hero) ? 'hero' : 'standard';
  const style = ['layout', 'palette', 'align', 'size', 'scale', 'offset', 'chips'].filter((k) => f[k] !== undefined);
  if (style.length) die(`--${style.join(', --')} ${style.length > 1 ? 'are' : 'is'} app-wide now. Use: appshot update <app> --${style[0]} …`);
  return p;
}

const looksLikeAssetId = (v) => typeof v === 'string' && /^[0-9a-z]{8}$/.test(v) && !fs.existsSync(v);

async function uploadOne(appId, file, kind, baseDir) {
  const p = path.resolve(baseDir, file);
  const [asset] = await http('POST', `/api/apps/${appId}/assets?kind=${kind}`, await fileForm('files', [p]));
  return asset.id;
}

function captureSimulator(target, file) {
  if (flags['clean-status-bar']) {
    execFileSync('xcrun', [
      'simctl', 'status_bar', target, 'override',
      '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3',
      '--cellularMode', 'active', '--cellularBars', '4', '--batteryState', 'charged', '--batteryLevel', '100',
    ]);
  }
  try {
    execFileSync('xcrun', ['simctl', 'io', target, 'screenshot', '--type=png', file], { stdio: 'pipe' });
  } catch (e) {
    die(`simulator screenshot failed: ${e.stderr?.toString().trim() || e.message}`);
  }
}

/** Screenshot the frontmost window of a running Mac app, without the drop shadow. */
function captureMacWindow(appName, file) {
  const script = path.join(os.tmpdir(), 'appshot-window.swift');
  fs.writeFileSync(
    script,
    `import CoreGraphics
let name = CommandLine.arguments[1].lowercased()
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
for w in list where ((w[kCGWindowOwnerName as String] as? String) ?? "").lowercased() == name && (w[kCGWindowLayer as String] as? Int) == 0 {
  print(w[kCGWindowNumber as String]!); break
}`,
  );
  let id = '';
  try {
    id = execFileSync('swift', [script, appName], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch (e) {
    die(`couldn't list windows: ${e.stderr?.toString().trim() || e.message}`);
  }
  if (!id) die(`no on-screen window found for "${appName}". Launch it and make sure the window is visible.`);
  try {
    execFileSync('screencapture', ['-o', '-x', '-l', id, file], { stdio: 'pipe' });
  } catch (e) {
    die(`screencapture failed (the terminal may need Screen Recording permission): ${e.stderr?.toString().trim() || e.message}`);
  }
}

/** Name of the booted (or given) simulator, e.g. "iPhone 18 Pro". */
function simulatorName(target) {
  try {
    const list = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', '-j'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
    for (const devices of Object.values(list.devices)) {
      for (const d of devices) {
        if (target === 'booted' ? d.state === 'Booted' : d.udid === target || d.name === target) return d.name;
      }
    }
  } catch {}
  return undefined;
}

async function placeCapture(app, file, source) {
  const meta = { source: JSON.stringify(source ?? { kind: 'upload' }) };
  if (flags.slide) {
    // Prefer the device the capture actually came from.
    const device = flags.device ?? (/ipad/i.test(source?.device ?? '') ? 'ipad' : /duo|fold/i.test(source?.device ?? '') ? 'duo' : 'iphone');
    const s = await http(
      'PUT',
      `/api/apps/${app.id}/slides/${enc(flags.slide)}/shot`,
      await fileForm('file', [file], { device, ...meta }),
    );
    const patch = {};
    if (flags.headline) patch.headline = String(flags.headline);
    if (flags.screen) patch.screen = { name: String(flags.screen) };
    if (Object.keys(patch).length) await http('PATCH', `/api/apps/${app.id}/slides/${s.id}`, patch);
    return out(s, `Captured into slide ${flags.slide} (${label[device]})`);
  }
  const headlines = flags.headline ? JSON.stringify([String(flags.headline)]) : undefined;
  const screens = flags.screen ? JSON.stringify([String(flags.screen)]) : undefined;
  const r = await http(
    'POST',
    `/api/apps/${app.id}/screenshots`,
    await fileForm('files', [file], { device: flags.device, headlines, screens, ...meta }),
  );
  const fresh = await getApp(app.id);
  out(r, () =>
    r.placed.length
      ? r.placed.map((p) => `Captured into slide ${fresh.slides.findIndex((s) => s.id === p.slideId) + 1} (${label[p.device]})`).join('\n')
      : `skipped: ${r.skipped.map((s) => s.reason).join('; ')}`,
  )
}

// ---------- commands ----------
const commands = {
  async help() {
    console.log(HELP);
  },

  async status() {
    if (pos[0]) {
      const app = await getApp(pos[0]);
      const check = await http('GET', `/api/apps/${app.id}/check`);
      if (JSON_OUT) return console.log(JSON.stringify(await http('GET', `/api/apps/${app.id}/data`), null, 2));
      return out(app, () => describeApp(app, check));
    }
    const apps = await http('GET', '/api/apps');
    out(apps, (list) =>
      list.length
        ? list
            .map((a) => `${a.name}  (id ${a.id})  ${a.devices.map((d) => `${a.counts?.[d] ?? 0} ${label[d]}`).join(', ')} screenshots`)
            .join('\n')
        : 'No apps yet. Create one with: appshot create "My App"',
    );
  },

  async create() {
    const name = pos[0] ?? die('usage: appshot create <name>');
    const body = { name, preset: flags.preset, subtitle: flags.subtitle };
    if (flags.devices) body.devices = String(flags.devices).split(',');
    if (flags.project) body.profile = { projectPath: expandPath(flags.project) };
    if (flags['bundle-id']) body.profile = { ...(body.profile ?? {}), bundleId: String(flags['bundle-id']) };
    let app = await http('POST', '/api/apps', body);
    if (flags.icon) app = await http('POST', `/api/apps/${app.id}/icon`, await fileForm('file', [flags.icon]));
    out(app, (a) => `Created ${a.name} (id ${a.id})\n${BASE}/?app=${a.id}`);
  },

  async here() {
    const res = await fetch(`${BASE}/api/lookup?path=${enc(process.cwd())}`).catch(() =>
      die(`can't reach the OpenAppShot server at ${BASE}. Start it with "npm run dev" in the OpenAppShot folder.`),
    );
    if (!res.ok) {
      return out({ app: null }, `No app is linked to ${process.cwd()}.\nLink one with: appshot profile <app> --project .`);
    }
    const app = await res.json();
    const check = await http('GET', `/api/apps/${app.id}/check`);
    out(app, () => describeApp(app, check));
  },

  async profile() {
    const app = await getApp(pos[0] ?? die('usage: appshot profile <app> [flags]'));
    const p = {};
    const text = { 'bundle-id': 'bundleId', 'app-store-url': 'appStoreUrl', category: 'category', description: 'description', audience: 'audience', screens: 'screens', notes: 'notes' };
    for (const [flag, key] of Object.entries(text)) if (flags[flag] !== undefined) p[key] = flags[flag] === true ? '' : String(flags[flag]).replace(/\\n/g, '\n');
    if (flags.project !== undefined) p.projectPath = expandPath(flags.project);
    if (flags.keywords !== undefined) p.keywords = String(flags.keywords).split(',').map((x) => x.trim()).filter(Boolean);
    if (flags['brand-colors'] !== undefined) p.brandColors = String(flags['brand-colors']).split(',').map((x) => x.trim()).filter(Boolean);
    if (flags['add-note']) {
      const stamp = new Date().toISOString().slice(0, 10);
      p.notes = [app.profile?.notes, `${stamp}: ${flags['add-note']}`].filter(Boolean).join('\n');
    }
    const next = Object.keys(p).length ? await http('PATCH', `/api/apps/${app.id}`, { profile: p }) : app;
    out(next.profile, () => [`${next.name}${Object.keys(p).length ? ' — profile updated' : ''}`, ...describeProfile(next)].join('\n'));
  },

  async update() {
    const app = await getApp(pos[0] ?? die('usage: appshot update <app> [flags]'));
    const patch = {};
    if (flags.name) patch.name = flags.name;
    if (flags.subtitle !== undefined) patch.subtitle = String(flags.subtitle === true ? '' : flags.subtitle);
    if (flags.preset) patch.preset = flags.preset;
    if (flags.devices) patch.devices = String(flags.devices).split(',');
    const theme = {};
    if (flags.font) theme.fontFamily = flags.font;
    if (flags.align) theme.align = flags.align;
    if (flags.layout) theme.layout = flags.layout;
    if (flags.alternate !== undefined) theme.alternate = ['on', 'true', true, 'yes'].includes(flags.alternate);
    if (flags.size !== undefined) theme.headlineSize = Number(flags.size);
    if (flags.scale !== undefined) theme.shotScale = Number(flags.scale);
    if (flags.offset !== undefined) theme.shotOffsetY = Number(flags.offset);
    if (flags['text-offset'] !== undefined) theme.textOffsetY = Number(flags['text-offset']);
    const frame = {};
    if (flags['stroke-color']) frame.strokeColor = flags['stroke-color'];
    if (flags['stroke-width'] !== undefined) frame.strokeWidth = Number(flags['stroke-width']);
    if (flags.radius !== undefined) frame.radius = Number(flags.radius);
    if (flags.shadow !== undefined) frame.shadow = Number(flags.shadow);
    if (flags.frame) frame.kind = flags.frame;
    if (flags['device-color']) frame.deviceColor = flags['device-color'];
    if (Object.keys(frame).length) theme.frame = frame;
    const callout = {};
    if (flags['callout-scale'] !== undefined) callout.scale = Number(flags['callout-scale']);
    if (flags['callout-shadow'] !== undefined) callout.shadow = Number(flags['callout-shadow']);
    if (flags['callout-radius'] !== undefined) callout.radius = Number(flags['callout-radius']);
    if (Object.keys(callout).length) theme.callout = callout;
    const hero = {};
    const str = (v) => (v === true ? '' : String(v));
    if (flags.badge !== undefined) {
      if (!['none', 'rating', 'downloads', 'custom'].includes(flags.badge)) die('--badge is none, rating, downloads or custom; the text is --badge-title');
      hero.badge = flags.badge;
    }
    if (flags['badge-title'] !== undefined) hero.badgeTitle = str(flags['badge-title']);
    if (flags['badge-caption'] !== undefined) hero.badgeCaption = str(flags['badge-caption']);
    if (flags.lockup !== undefined) hero.lockup = ['on', 'true', true, 'yes'].includes(flags.lockup);
    if (flags.tilt !== undefined) hero.tilt = Number(flags.tilt);
    if (Object.keys(hero).length) theme.hero = hero;
    // Background fill and effects.
    const fill = {};
    if (flags.background) {
      const type = { solid: 'solid', gradient: 'linear', linear: 'linear', glow: 'radial', radial: 'radial', mesh: 'mesh', photo: 'image', image: 'image', frosted: 'screenshot', screenshot: 'screenshot' }[flags.background];
      if (!type) die('--background is solid, gradient, glow, mesh, photo or frosted');
      fill.type = type;
    }
    if (flags['mesh-colors']) {
      const [color, color2, color3] = String(flags['mesh-colors']).split(',').map((c) => c.trim());
      Object.assign(fill, { color, color2, color3: color3 ?? color2 }, flags.background ? {} : { type: 'mesh' });
    }
    if (flags.shuffle) fill.seed = Math.floor(Math.random() * 997) + 1;
    if (Object.keys(fill).length) theme.palettes = { primary: { background: fill } };
    if (flags.panorama !== undefined) theme.panorama = ['on', 'true', true, 'yes'].includes(flags.panorama);
    const texture = {};
    if (flags.texture) {
      if (!['none', 'grain', 'dots', 'grid', 'lines'].includes(flags.texture)) die('--texture is none, grain, dots, grid or lines');
      texture.kind = flags.texture;
    }
    if (flags['texture-strength'] !== undefined) texture.opacity = Number(flags['texture-strength']);
    if (flags['texture-spacing'] !== undefined) texture.size = Number(flags['texture-spacing']);
    if (Object.keys(texture).length) theme.texture = texture;
    if (flags.vignette !== undefined) theme.vignette = Number(flags.vignette);
    const glow = {};
    if (flags.glow !== undefined) glow.strength = Number(flags.glow);
    if (flags['glow-size'] !== undefined) glow.size = Number(flags['glow-size']);
    if (flags['glow-color'] !== undefined) glow.color = flags['glow-color'] === 'highlight' || flags['glow-color'] === true ? '' : String(flags['glow-color']);
    if (Object.keys(glow).length) theme.glow = glow;
    const decor = {};
    if (flags.decor) {
      if (!['none', 'blobs', 'waves', 'rings', 'sparkles', 'confetti', 'bokeh'].includes(flags.decor)) die('--decor is none, blobs, waves, rings, sparkles, confetti or bokeh');
      decor.kind = flags.decor;
    }
    if (flags['decor-amount'] !== undefined) decor.density = Number(flags['decor-amount']);
    if (flags['decor-size'] !== undefined) decor.scale = Number(flags['decor-size']);
    if (flags['decor-opacity'] !== undefined) decor.opacity = Number(flags['decor-opacity']);
    if (flags['decor-color'] !== undefined) decor.color = ['auto', true].includes(flags['decor-color']) ? '' : String(flags['decor-color']);
    if (flags['shuffle-decor']) decor.seed = Math.floor(Math.random() * 997) + 1;
    if (Object.keys(decor).length) theme.decor = decor;
    const mark = {};
    if (flags.mark) {
      if (!['none', 'underline', 'double', 'circle', 'box', 'marker', 'strike', 'brackets', 'squiggle'].includes(flags.mark)) die('--mark is none, underline, double, circle, box, marker, strike, brackets or squiggle');
      mark.kind = flags.mark;
    }
    if (flags['mark-width'] !== undefined) mark.width = Number(flags['mark-width']);
    if (flags['mark-roughness'] !== undefined) mark.roughness = Number(flags['mark-roughness']);
    if (flags['mark-padding'] !== undefined) mark.padding = Number(flags['mark-padding']);
    if (flags['mark-color'] !== undefined) mark.color = ['highlight', true].includes(flags['mark-color']) ? '' : String(flags['mark-color']);
    if (flags['mark-recolor'] !== undefined) mark.recolor = ['on', 'true', true, 'yes'].includes(flags['mark-recolor']);
    const marker = {};
    if (flags['marker-opacity'] !== undefined) marker.opacity = Math.max(0, Math.min(100, Number(flags['marker-opacity']))) / 100;
    if (flags['marker-height'] !== undefined) marker.height = Number(flags['marker-height']);
    if (flags['marker-position'] !== undefined) marker.lift = Number(flags['marker-position']);
    if (flags['marker-round'] !== undefined) marker.radius = Number(flags['marker-round']);
    if (flags['marker-tilt'] !== undefined) marker.tilt = Number(flags['marker-tilt']);
    if (Object.keys(marker).length) mark.marker = marker;
    if (Object.keys(mark).length) theme.annotation = mark;
    if (flags['sticker-shadow'] !== undefined) theme.stickerShadow = Number(flags['sticker-shadow']);
    if (Object.keys(theme).length) patch.theme = theme;
    setPatch(flags.set, patch);
    const next = await http('PATCH', `/api/apps/${app.id}`, patch);
    out(next, (a) => `Updated ${a.name} — applies to all ${a.slides.length} slides`);
  },

  async icon() {
    const [ref, file] = pos;
    if (!ref || !file) die('usage: appshot icon <app> <file>');
    const app = await getApp(ref);
    const next = await http('POST', `/api/apps/${app.id}/icon`, await fileForm('file', [file]));
    out(next, `Icon set for ${next.name}`);
  },

  async data() {
    const data = pos[0] ? await http('GET', `/api/apps/${(await getApp(pos[0])).id}/data`) : await http('GET', '/api/data');
    console.log(JSON.stringify(data, null, 2));
  },

  async spec() {
    const app = await getApp(pos[0] ?? die('usage: appshot spec <app>'));
    console.log(JSON.stringify(app, null, 2));
  },

  async 'delete-app'() {
    const app = await getApp(pos[0] ?? die('usage: appshot delete-app <app>'));
    await http('DELETE', `/api/apps/${app.id}`);
    out({ deleted: app.id }, `Deleted ${app.name}`);
  },

  async add() {
    const [ref, ...files] = pos;
    if (!ref || !files.length) die('usage: appshot add <app> <files...>');
    const app = await getApp(ref);
    const headlines = flags.headlines ? JSON.stringify(String(flags.headlines).split('|')) : undefined;
    const r = await http(
      'POST',
      `/api/apps/${app.id}/screenshots`,
      await fileForm('files', files, {
        device: flags.device,
        headlines,
        screens: flags.screens ? JSON.stringify(String(flags.screens).split('|')) : undefined,
        source: JSON.stringify({ kind: 'file' }),
        layout: flags.layout,
      }),
    );
    const fresh = await getApp(app.id);
    out(r, () => {
      const lines = r.placed.map((p) => {
        const i = fresh.slides.findIndex((s) => s.id === p.slideId) + 1;
        return `${p.created ? 'new slide' : 'filled slide'} ${i} (${label[p.device]})`;
      });
      r.skipped.forEach((s) => lines.push(`skipped ${s.name}: ${s.reason}`));
      return lines.join('\n');
    });
  },

  async capture() {
    const app = await getApp(pos[0] ?? die('usage: appshot capture <app> [--slide n]'));
    const target = flags.udid ?? 'booted';
    const file = path.join(os.tmpdir(), `appshot-${Date.now()}.png`);
    let source;
    if (flags.mac) {
      captureMacWindow(String(flags.mac), file);
      flags.device = 'mac';
      source = { kind: 'mac-window', device: String(flags.mac) };
    } else {
      captureSimulator(target, file);
      source = { kind: 'simulator', device: simulatorName(target) };
    }
    await placeCapture(app, file, source);
    fs.rmSync(file, { force: true });
  },

  async shot() {
    const [ref, slide, file] = pos;
    if (!ref || !slide || !file) die('usage: appshot shot <app> <slide> <file> [--device iphone]');
    const app = await getApp(ref);
    const device = flags.device ?? app.devices[0];
    const s = await http('PUT', `/api/apps/${app.id}/slides/${enc(slide)}/shot`, await fileForm('file', [file], { device }));
    out(s, `Replaced ${label[device]} screenshot on slide ${slide}`);
  },

  async slide() {
    const [ref, slideRef] = pos;
    if (!ref || !slideRef) die('usage: appshot slide <app> <slide> [flags]');
    const app = await getApp(ref);
    const patch = slideFlags(flags);
    if (flags.callout !== undefined) patch.callouts = calloutPatch(app, slideRef, flags);
    if (flags.style) patch.style = setPatch(flags.style, {});
    if (flags['reset-style'] === true) patch.style = null;
    else if (flags['reset-style']) patch.style = { ...(patch.style ?? {}), ...setPatch([`${flags['reset-style']}=null`], {}) };
    const s = await http('PATCH', `/api/apps/${app.id}/slides/${enc(slideRef)}`, patch);
    out(s, `Updated slide ${slideRef}: ${s.headline.replace(/\n/g, ' / ')}`);
  },

  async 'new-slide'() {
    const app = await getApp(pos[0] ?? die('usage: appshot new-slide <app> [flags]'));
    const body = slideFlags(flags);
    if (flags.at !== undefined) body.index = Number(flags.at) - 1;
    const s = await http('POST', `/api/apps/${app.id}/slides`, body);
    const fresh = await getApp(app.id);
    out(s, `Added slide ${fresh.slides.findIndex((x) => x.id === s.id) + 1} (id ${s.id})`);
  },

  async 'rm-slide'() {
    const [ref, slideRef] = pos;
    if (!ref || !slideRef) die('usage: appshot rm-slide <app> <slide>');
    const app = await getApp(ref);
    await http('DELETE', `/api/apps/${app.id}/slides/${enc(slideRef)}`);
    out({ deleted: slideRef }, `Deleted slide ${slideRef}`);
  },

  async move() {
    const [ref, slideRef, to] = pos;
    if (!ref || !slideRef || !to) die('usage: appshot move <app> <slide> <position>');
    const app = await getApp(ref);
    const n = Number(slideRef);
    const s = app.slides.find((x) => x.id === slideRef) ?? app.slides[n - 1] ?? die(`slide ${slideRef} not found`);
    const order = app.slides.map((x) => x.id).filter((id) => id !== s.id);
    order.splice(Math.max(0, Math.min(order.length, Number(to) - 1)), 0, s.id);
    await http('PUT', `/api/apps/${app.id}/order`, { order });
    out({ order }, `Moved slide to position ${to}`);
  },

  async apply() {
    const specPath = pos[0] ?? die('usage: appshot apply <spec.json> [--app <app>]');
    const baseDir = path.dirname(path.resolve(specPath));
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

    // Resolve or create the target app.
    let app = null;
    const ref = flags.app ?? spec.app ?? spec.id ?? spec.name;
    if (ref) {
      const res = await fetch(`${BASE}/api/apps/${enc(ref)}`).catch(() => die(`can't reach ${BASE}`));
      if (res.ok) app = await res.json();
    }
    if (!app) {
      app = await http('POST', '/api/apps', { name: spec.name ?? 'Untitled app', preset: spec.preset, subtitle: spec.subtitle, devices: spec.devices });
    }

    const body = {};
    for (const k of ['name', 'subtitle', 'preset', 'devices', 'theme', 'sizes', 'exportSizes', 'profile', 'replaceSlides']) if (spec[k] !== undefined) body[k] = spec[k];
    // App-wide style shortcuts.
    for (const [k, key] of Object.entries({ layout: 'layout', alternate: 'alternate', align: 'align', font: 'fontFamily' })) {
      if (spec[k] !== undefined) body.theme = { ...(body.theme ?? {}), [key]: spec[k] };
    }
    if (spec.icon) {
      await http('POST', `/api/apps/${app.id}/icon`, await fileForm('file', [path.resolve(baseDir, spec.icon)]));
    }
    // Theme palettes may reference background photos by path.
    for (const k of ['primary', 'alt']) {
      const img = body.theme?.palettes?.[k]?.background?.image;
      if (img) {
        body.theme.palettes[k].background.imageAssetId = await uploadOne(app.id, img, 'background', baseDir);
        body.theme.palettes[k].background.type ??= 'image';
        delete body.theme.palettes[k].background.image;
      }
    }

    if (Array.isArray(spec.slides)) {
      body.slides = [];
      for (const s of spec.slides) {
        const slide = { headline: s.headline, subtitle: s.subtitle, screen: s.screen };
        if (s.shots) {
          slide.shots = {};
          for (const [device, v] of Object.entries(s.shots)) {
            slide.shots[device] = v === null ? null : looksLikeAssetId(v) ? v : await uploadOne(app.id, v, 'screenshot', baseDir);
          }
        }
        body.slides.push(slide);
      }
    }
    const next = await http('POST', `/api/apps/${app.id}/apply`, body);
    out(next, (a) => `Applied ${path.basename(specPath)} to ${a.name}\n\n${describeApp(a)}`);
  },

  async preview() {
    const app = await getApp(pos[0] ?? die('usage: appshot preview <app> [--device d] [--slide n]'));
    if (flags.creative) {
      const id = String(flags.creative);
      if (!['header', 'search'].includes(id)) die('--creative is header or search');
      const png = await http('GET', `/api/apps/${app.id}/creatives/${id}/render.png?scale=0.5`);
      const file = path.join(os.tmpdir(), 'openappshot', 'creatives', `${app.id}-${id}.png`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, png);
      return out({ creative: id, path: file }, file);
    }
    let slides;
    if (flags.slide) {
      slides = String(flags.slide)
        .split(',')
        .map((r) => (app.slides.find((s) => s.id === r) ?? app.slides[Number(r) - 1])?.id)
        .filter(Boolean);
    }
    let r = await http('POST', `/api/apps/${app.id}/preview`, { device: flags.device, slides });
    // Server on another machine: bring the PNGs here so they can be opened.
    if (!(await serverIsLocal(BASE))) r = await fetchPreviews(BASE, app.id, r).catch((e) => die(e.message));
    out(r, () => (r.files.length ? r.files.map((f) => f.path).join('\n') : 'Nothing to render.'));
  },

  async export() {
    const app = await getApp(pos[0] ?? die('usage: appshot export <app> [--device list] [--out dir]'));
    const local = await serverIsLocal(BASE);
    const outDir = flags.out ? expandPath(flags.out) : undefined;
    let r = await http('POST', `/api/apps/${app.id}/export`, {
      devices: flags.device ? String(flags.device).split(',') : undefined,
      languages: flags.lang && flags.lang !== true ? String(flags.lang).split(',') : undefined,
      outDir: local ? outDir : undefined,
    });
    // Server on another machine: download the zip (into --out, or ~/.openappshot/exports) and unpack it.
    if (!local) r = await fetchExport(BASE, r, outDir).catch((e) => die(e.message));
    out(r, () => {
      const by = {};
      r.files.forEach((f) => {
        const k = `${label[f.device]} ${f.size}`;
        by[k] = (by[k] ?? 0) + 1;
      });
      const lines = [`Exported ${r.files.length} PNGs to ${r.dir}`];
      for (const [k, n] of Object.entries(by)) lines.push(`  ${k}: ${n}`);
      if (r.skipped.length) lines.push(`Skipped ${r.skipped.length} slide(s) with no screenshot for that device`);
      for (const c of r.creatives ?? []) lines.push(`  ${c.creative === 'header' ? 'Product page header' : 'Search results'} ${c.size}: ${c.path}`);
      if (r.languages?.length > 1) lines.push(`Languages: ${r.languages.join(', ')} (a folder each)`);
      const todo = {};
      for (const u of r.untranslated ?? []) (todo[u.language] ??= []).push(u.position);
      for (const [l, list] of Object.entries(todo)) lines.push(`! ${l}: slide${list.length > 1 ? "s" : ""} ${list.join(', ')} used base-language text (not translated yet)`);
      lines.push(`Zip: ${r.zip}`);
      return lines.join('\n');
    });
  },

  async languages() {
    const app = await getApp(pos[0] ?? die('usage: appshot languages <app> [--add codes] [--rm codes] [--base code]'));
    const list = (v) => (v && v !== true ? String(v).split(',').map((x) => x.trim()).filter(Boolean) : []);
    let languages = [...app.languages];
    languages.push(...list(flags.add));
    const rm = list(flags.rm).map((x) => x.toLowerCase());
    languages = languages.filter((l) => !rm.includes(l.toLowerCase()));
    const patch = {};
    if (flags.add || flags.rm) patch.languages = languages;
    if (flags.base && flags.base !== true) Object.assign(patch, { baseLanguage: String(flags.base), languages });
    const next = Object.keys(patch).length ? await http('PATCH', `/api/apps/${app.id}`, patch) : app;
    const report = next.languages.length ? await http('GET', `/api/apps/${next.id}/translations`) : { languages: [] };
    out({ baseLanguage: next.baseLanguage, languages: report.languages.map(({ code, name, done, total }) => ({ code, name, done, total })) }, () =>
      [
        `${next.name}: written in ${next.baseLanguage}`,
        ...report.languages.map((l) => `  ${l.code}  ${l.name}  ${l.done}/${l.total} slides translated`),
        next.languages.length ? 'Translate with: appshot translations <app> <lang>, then appshot translate <app> <lang> file.json' : 'No translations. Add some with --add de-DE,ja',
      ].join('\n'),
    );
  },

  async translations() {
    const app = await getApp(pos[0] ?? die('usage: appshot translations <app> [lang]'));
    const r = await http('GET', `/api/apps/${app.id}/translations${pos[1] ? `?lang=${enc(pos[1])}` : ''}`);
    if (!r.languages.length) return out(r, `${app.name} has no translations. Add some: appshot languages ${pos[0]} --add de-DE,ja`);
    const one = (s) => s.replace(/\n/g, ' / ');
    out(r, () =>
      r.languages
        .map((l) => {
          const lines = [`${l.name} (${l.code}): ${l.done}/${l.total} slides translated`];
          for (const s of l.slides) {
            lines.push(`${String(s.position).padStart(2)}. ${one(s.base.headline)}`);
            lines.push(`    ${l.code}: ${s.translation.headline ? one(s.translation.headline) : '— missing'}`);
            if (s.base.subtitle) lines.push(`    subtitle: ${s.base.subtitle}\n    ${l.code}: ${s.translation.subtitle || '— missing'}`);
            if (s.screenshots.length) lines.push(`    own screenshots: ${s.screenshots.map((d) => label[d] ?? d).join(', ')}`);
          }
          for (const c of l.creatives) lines.push(`${c.creative}: ${one(c.base.headline)}\n    ${l.code}: ${c.translation.headline ? one(c.translation.headline) : '— missing'}`);
          if (l.hero) lines.push(`hero badge: ${l.hero.base.badgeTitle} ${l.hero.base.badgeCaption}\n    ${l.code}: ${[l.hero.translation.badgeTitle, l.hero.translation.badgeCaption].filter(Boolean).join(' ') || '— missing'}`);
          return lines.join('\n');
        })
        .join('\n\n'),
    );
  },

  async translate() {
    const [ref, lang, file] = pos;
    if (!ref || !lang || !file) die('usage: appshot translate <app> <lang> <file.json | ->');
    const app = await getApp(ref);
    let body;
    try {
      body = JSON.parse(file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(file), 'utf8'));
    } catch (e) {
      die(`couldn't read ${file}: ${e.message}`);
    }
    if (Array.isArray(body)) body = { slides: body };
    const r = await http('PUT', `/api/apps/${app.id}/translations/${enc(lang)}`, body);
    const l = r.languages[0];
    const missing = l.slides.filter((s) => s.missing.length).map((s) => s.position);
    out(r, `${l.name}: ${l.done}/${l.total} slides translated${missing.length ? ` (missing: ${missing.join(', ')})` : ''}. Check with: appshot preview ${ref} --lang ${l.code}`);
  },

  async sets() {
    const app = await getApp(pos[0] ?? die('usage: appshot sets <app>'));
    const list = await http('GET', `/api/apps/${app.id}/sets`);
    out(list, () => list.map((x) => `${x.primary ? '* ' : '  '}${x.name}  (${x.slides} slides${x.primary ? ', primary' : ''})  id ${x.id}`).join('\n'));
  },

  async 'set-new'() {
    const app = await getApp(pos[0] ?? die('usage: appshot set-new <app> [name] [--from set] [--blank]'));
    const s = await http('POST', `/api/apps/${app.id}/sets`, {
      name: pos[1],
      from: flags.from && flags.from !== true ? String(flags.from) : undefined,
      blank: !!flags.blank,
    });
    out(s, `Created set "${s.name}" with ${s.slides.length} slides. Work on it with --in "${s.name}".`);
  },

  async 'set-rename'() {
    const [ref, set, name] = pos;
    if (!ref || !set || !name) die('usage: appshot set-rename <app> <set> <name>');
    const app = await getApp(ref);
    const list = await http('PATCH', `/api/apps/${app.id}/sets/${enc(set)}`, { name });
    out(list, `Renamed to "${name}"`);
  },

  async 'set-rm'() {
    const [ref, set] = pos;
    if (!ref || !set) die('usage: appshot set-rm <app> <set>');
    const app = await getApp(ref);
    const list = await http('DELETE', `/api/apps/${app.id}/sets/${enc(set)}`);
    out(list, `Deleted set "${set}"`);
  },

  async 'set-primary'() {
    const [ref, set] = pos;
    if (!ref || !set) die('usage: appshot set-primary <app> <set>');
    const app = await getApp(ref);
    const list = await http('POST', `/api/apps/${app.id}/sets/${enc(set)}/primary`);
    out(list, `"${list.find((x) => x.primary).name}" is now the primary set`);
  },

  async emoji() {
    const q = pos.join(' ');
    const r = await http('GET', `/api/emoji?q=${enc(q)}&limit=40`);
    if (!r.available) die('emoji are not downloaded on the server; run "npm run setup:emoji" in OpenAppShot');
    const head = r.font ? `Styles: 3d, color, flat, apple (${r.font.source})\n` : '';
    out(r, () => (r.emoji.length ? head + r.emoji.map((e) => `${e.glyph}  ${e.slug}  (${e.group})`).join('\n') + (r.total > 40 ? `\n… ${r.total - 40} more` : '') : 'No emoji found.'));
  },

  async sticker() {
    const [ref, slideRef, action = 'list', target] = pos;
    if (!ref || !slideRef) die('usage: appshot sticker <app> <slide> list|add|set|rm …');
    const app = await getApp(ref);
    const slide = app.slides.find((s) => s.id === slideRef) ?? app.slides[Number(slideRef) - 1];
    if (!slide) die(`no slide ${slideRef}`);
    let list = [...(slide.stickers ?? [])];
    const fields = (s) => {
      if (flags.style) s.style = String(flags.style);
      for (const [flag, key] of [['x', 'x'], ['y', 'y'], ['size', 'size'], ['rotate', 'rotation'], ['opacity', 'opacity']]) if (flags[flag] !== undefined) s[key] = Number(flags[flag]);
      if (flags.layer) s.layer = flags.layer === 'back' ? 'back' : 'front';
      if (flags.color !== undefined) s.color = flags.color === true || flags.color === 'highlight' ? '' : String(flags.color);
      if (flags.flip !== undefined) s.flip = flags.flip !== 'off' && flags.flip !== 'false';
      return s;
    };
    const describe = (s, i) => `${i + 1}. ${s.kind} ${s.ref}${s.kind === 'emoji' ? ` (${s.style})` : ''} at ${s.x},${s.y} size ${s.size} ${s.rotation}° ${s.layer}`;
    if (action === 'list') return out(list, () => (list.length ? list.map(describe).join('\n') : 'No stickers on this slide.'));
    if (action === 'add') {
      if (!target) die('usage: appshot sticker <app> <slide> add <emoji-slug|doodle>');
      const doodle = !!flags.doodle;
      const id = Math.random().toString(36).slice(2, 10);
      list.push(fields({ id, kind: doodle ? 'doodle' : 'emoji', ref: target, style: '3d', x: 0.82, y: 0.16, size: doodle ? 260 : 200, rotation: -8, layer: 'front', color: '', flip: false, opacity: 1 }));
    } else if (action === 'set') {
      const i = Number(target) - 1;
      if (!list[i]) die(`no sticker ${target}`);
      list[i] = fields({ ...list[i] });
    } else if (action === 'rm') {
      list = target === 'all' ? [] : list.filter((_, i) => i !== Number(target) - 1);
    } else die('sticker actions: list, add, set, rm');
    const s = await http('PATCH', `/api/apps/${app.id}/slides/${slide.id}`, { stickers: list });
    out(s.stickers, () => s.stickers.map(describe).join('\n') || 'No stickers on this slide.');
  },

  async creative() {
    const [ref, id] = pos;
    if (!ref || !['header', 'search'].includes(id)) die('usage: appshot creative <app> header|search [flags]');
    const app = await getApp(ref);
    const on = (v) => ['on', 'true', true, 'yes'].includes(v);
    const p = {};
    if (flags.headline !== undefined) p.headline = flags.headline === true ? '' : String(flags.headline).replace(/\\n/g, '\n');
    if (flags.subtitle !== undefined) p.subtitle = flags.subtitle === true ? '' : String(flags.subtitle);
    if (flags.text !== undefined) {
      if (!['left', 'center', 'none'].includes(flags.text)) die('--text is left, center or none');
      p.textPosition = flags.text;
    }
    if (flags.lockup !== undefined) p.lockup = on(flags.lockup);
    if (flags.include !== undefined) p.enabled = on(flags.include);
    if (flags['shot-scale'] !== undefined) p.shotScale = Number(flags['shot-scale']);
    if (flags.shots !== undefined) {
      p.shots =
        String(flags.shots) === 'auto'
          ? []
          : String(flags.shots)
              .split(',')
              .slice(0, 4)
              .map((ref) => {
                const [n, device = 'iphone'] = ref.split(':');
                const s = app.slides.find((x) => x.id === n) ?? app.slides[Number(n) - 1];
                if (!s) die(`no slide ${n}`);
                if (!s.shots[device]) die(`slide ${n} has no ${device} screenshot`);
                return { slideId: s.id, device };
              });
    }
    const next = await http('PATCH', `/api/apps/${app.id}`, { creatives: { [id]: p } });
    const c = next.creatives[id];
    out(c, `${id === 'header' ? 'Product page header' : 'Search results'}: "${c.headline.replace(/\n/g, ' / ')}" · ${c.enabled ? 'in export' : 'not exported (--include on)'}\nCheck it: appshot preview ${ref} --creative ${id}`);
  },

  async open() {
    const app = pos[0] ? await getApp(pos[0]) : null;
    const url = app ? `${BASE}/?app=${app.id}` : BASE;
    try {
      execFileSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [url]);
    } catch {}
    out({ url }, url);
  },
};

if (!cmd || cmd === '--help' || cmd === '-h' || flags.help) {
  console.log(HELP);
} else if (!commands[cmd]) {
  die(`unknown command "${cmd}". Run "appshot help".`);
} else {
  await commands[cmd]();
}
