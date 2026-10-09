#!/usr/bin/env node
// appshot — command-line client for a running OpenAppShot server (npm run dev).
// Designed to be driven by Claude: every command prints a short human summary, or JSON with --json.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = (process.env.APPSHOT_URL ?? 'http://127.0.0.1:4317').replace(/\/$/, '');

const HELP = `appshot — drive OpenAppShot from the terminal

Server: ${BASE}  (start it with "npm run dev"; override with APPSHOT_URL)
<app> is an app id, exact name, bundle id, or "." for the app linked to the current folder.
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
               [--font f] [--size n] [--scale 1.0] [--offset 0]
               [--stroke-color c] [--stroke-width n] [--radius pct] [--shadow 0-1]
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

Slides (content only: words and screenshots)
  slide <app> <slide> [--headline s] [--subtitle s] [--screen "Stats tab"] [--screen-notes "how to get there"]
  new-slide <app> [--at n] [same flags as slide]
  rm-slide <app> <slide>
  move <app> <slide> <position>
  apply <spec.json> [--app <app>]      Create or update an app from a declarative spec (see SKILL.md)

Output
  preview <app> [--device d] [--slide n]   Render PNGs to disk and print their paths (to look at)
  export <app> [--device iphone,ipad] [--out dir]
                                       Renders every export size chosen in the editor (App tab)
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
      if (k === 'set') (flags.set ??= []).push(v);
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
  const lines = [`${app.name}  (id ${app.id})  ${BASE}/?app=${app.id}`];
  lines.push(`devices: ${app.devices.map((d) => `${label[d]} (export ${(app.exportSizes?.[d] ?? [app.sizes[d]]).join(', ')})`).join('; ')}`);
  lines.push(
    `style (all slides): layout ${t.layout}, ${t.fontFamily}, align ${t.align}, colors ${t.palettes.primary.background.color}` +
      `${t.alternate ? ` alternating with ${t.palettes.alt.background.color}` : ''}, highlight ${t.palettes.primary.accentColor}`,
  );
  lines.push(`icon: ${app.iconAssetId ? 'set' : 'none'}   slides: ${app.slides.length}`);
  lines.push(...describeProfile(app));
  for (const [d, issues] of Object.entries(check?.devices ?? {})) for (const i of issues) lines.push(`! ${label[d]}: ${i.message}`);
  lines.push('');
  app.slides.forEach((s, i) => {
    const has = app.devices.map((d) => `${label[d]} ${s.shots?.[d] ? '✓' : '—'}`).join(' · ');
    lines.push(`${String(i + 1).padStart(2)}. ${s.headline.replace(/\n/g, ' / ')}`);
    if (s.subtitle) lines.push(`      subtitle: ${s.subtitle}`);
    if (s.screen?.name || s.screen?.notes) lines.push(`      screen: ${[s.screen.name, s.screen.notes].filter(Boolean).join(' — ')}`);
    lines.push(`      screenshots: ${has}   id ${s.id}`);
    for (const i of check?.slides?.[s.id] ?? []) lines.push(`      ${i.level === 'error' ? '! ' : '~ '}${i.message}`);
  });
  return lines.join('\n');
}

function slideFlags(f) {
  const p = {};
  if (f.headline !== undefined) p.headline = String(f.headline);
  if (f.subtitle !== undefined) p.subtitle = f.subtitle === true ? '' : String(f.subtitle);
  if (f.screen !== undefined) p.screen = { ...(p.screen ?? {}), name: f.screen === true ? '' : String(f.screen) };
  if (f['screen-notes'] !== undefined) p.screen = { ...(p.screen ?? {}), notes: f['screen-notes'] === true ? '' : String(f['screen-notes']) };
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
    const frame = {};
    if (flags['stroke-color']) frame.strokeColor = flags['stroke-color'];
    if (flags['stroke-width'] !== undefined) frame.strokeWidth = Number(flags['stroke-width']);
    if (flags.radius !== undefined) frame.radius = Number(flags.radius);
    if (flags.shadow !== undefined) frame.shadow = Number(flags.shadow);
    if (Object.keys(frame).length) theme.frame = frame;
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
    const s = await http('PATCH', `/api/apps/${app.id}/slides/${enc(slideRef)}`, slideFlags(flags));
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
    let slides;
    if (flags.slide) {
      slides = String(flags.slide)
        .split(',')
        .map((r) => (app.slides.find((s) => s.id === r) ?? app.slides[Number(r) - 1])?.id)
        .filter(Boolean);
    }
    const r = await http('POST', `/api/apps/${app.id}/preview`, { device: flags.device, slides });
    out(r, () => (r.files.length ? r.files.map((f) => f.path).join('\n') : 'Nothing to render.'));
  },

  async export() {
    const app = await getApp(pos[0] ?? die('usage: appshot export <app> [--device list] [--out dir]'));
    const r = await http('POST', `/api/apps/${app.id}/export`, {
      devices: flags.device ? String(flags.device).split(',') : undefined,
      outDir: flags.out ? path.resolve(String(flags.out)) : undefined,
    });
    out(r, () => {
      const by = {};
      r.files.forEach((f) => {
        const k = `${label[f.device]} ${f.size}`;
        by[k] = (by[k] ?? 0) + 1;
      });
      const lines = [`Exported ${r.files.length} PNGs to ${r.dir}`];
      for (const [k, n] of Object.entries(by)) lines.push(`  ${k}: ${n}`);
      if (r.skipped.length) lines.push(`Skipped ${r.skipped.length} slide(s) with no screenshot for that device`);
      lines.push(`Zip: ${r.zip}`);
      return lines.join('\n');
    });
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
