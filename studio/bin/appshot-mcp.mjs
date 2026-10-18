#!/usr/bin/env node
// OpenAppShot MCP server — lets the Claude desktop/chat app read and edit your screenshot sets.
// It runs on this Mac and talks to the local OpenAppShot server (starting it if needed).
// No Anthropic API calls: Claude uses these tools from your normal subscription.
//
// stdout belongs to the MCP protocol; log only to stderr.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BASE, fetchExport, isLocalUrl, moveExport, serverIsLocal } from './remote.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'bin', 'appshot.mjs');
const log = (...a) => console.error('[openappshot]', ...a);

// ---------- local server ----------
async function healthy() {
  let r;
  try {
    r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) });
  } catch {
    return false;
  }
  // Reached OpenConnect, but it turned the token down: say so instead of "can't reach".
  if (r.status === 401) {
    const { error } = await r.json().catch(() => ({}));
    throw new Error(`${error ?? 'Not signed in.'} Set OPENCONNECT_TOKEN to a token from OpenConnect → Settings → API tokens.`);
  }
  return r.ok;
}

let starting = null;
/** Start the studio server in the background if it isn't running. */
async function ensureServer() {
  if (await healthy()) return;
  // A server on another machine (e.g. Docker) can't be started from here.
  if (!isLocalUrl(BASE)) throw new Error(`Can't reach the OpenAppShot server at ${BASE}. Is it running?`);
  starting ??= (async () => {
    const dataDir = process.env.APPSHOT_DATA ?? path.join(os.homedir(), '.openappshot');
    fs.mkdirSync(dataDir, { recursive: true });
    const out = fs.openSync(path.join(dataDir, 'server.log'), 'a');
    const tsx = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    log('starting server');
    const child = spawn(process.execPath, [tsx, 'server/index.ts'], {
      cwd: ROOT,
      detached: true,
      stdio: ['ignore', out, out],
      env: { ...process.env },
    });
    child.unref();
    for (let i = 0; i < 60; i++) {
      if (await healthy()) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`OpenAppShot server didn't start. See ${path.join(dataDir, 'server.log')}`);
  })().finally(() => (starting = null));
  return starting;
}

async function http(method, url, body) {
  await ensureServer();
  const init = { method, headers: { 'x-client-id': 'mcp' } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  const res = await fetch(BASE + url, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  const type = res.headers.get('content-type') ?? '';
  return type.includes('json') ? res.json() : Buffer.from(await res.arrayBuffer());
}

const enc = encodeURIComponent;
const expand = (p) => path.resolve(String(p).replace(/^~(?=$|\/)/, os.homedir()));

async function form(field, paths, extra = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  for (const p of paths) {
    const abs = expand(p);
    if (!fs.existsSync(abs)) throw new Error(`File not found: ${p}`);
    fd.append(field, await fs.openAsBlob(abs), path.basename(abs));
  }
  return fd;
}

async function appId(ref) {
  const a = await http('GET', `/api/apps/${enc(ref)}`);
  return a.id;
}

// ---------- output helpers ----------
const text = (t) => ({ content: [{ type: 'text', text: t }] });
const json = (label, data) => text(`${label}\n\n${JSON.stringify(data, null, 2)}`);

function overview(data) {
  const lines = [`${data.name} (id ${data.id}) — ${data.editorUrl}`];
  for (const d of data.devices) {
    const missing = d.missingScreenshots ? `, ${d.missingScreenshots} slide(s) without one` : '';
    lines.push(`  ${d.label}: ${d.screenshots} screenshots${missing}`);
  }
  const st = data.style;
  lines.push(`  Style (all slides): ${st.layout} layout, ${st.font}, ${st.palettes.primary.background}${st.alternateColors ? ` / ${st.palettes.alt.background}` : ''}`);
  return lines.join('\n');
}

function wrap(fn) {
  return async (args) => {
    try {
      return await fn(args);
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  };
}

// ---------- server ----------
const server = new McpServer(
  { name: 'openappshot', version: '0.1.0' },
  {
    instructions: [
      'OpenAppShot is the user\'s local studio for App Store screenshots (iPhone, iPhone Duo, iPad, Mac).',
      'Start with list_apps or get_app: get_app returns each app\'s remembered profile, app-wide style, per-device',
      'screenshot counts, and per-slide data (headline, subtitle, screen shown, screenshot size and source).',
      'Slides hold only words and screenshots. All styling (layout, colors, font, alignment, sizes, frame) is app-wide:',
      'change it with update_app and it applies to every slide.',
      'Read the profile before writing headlines and save anything new you learn with update_profile.',
      'Headlines: *asterisks* highlight words, \\n breaks lines; short benefit-led phrases.',
      'Apple rules: no prices, URLs, ©/®/™, other platforms, or Apple awards; at most 10 screenshots per device.',
      'Use preview_slide to look at your work before telling the user it is ready.',
    ].join(' '),
  },
);

const appArg = z.string().describe('App id, exact name, or bundle id');
const setArg = z.string().optional().describe('Screenshot set (id or name, e.g. "Test A"); default the primary set. See manage_sets');
const langArg = z
  .string()
  .optional()
  .describe('Translation language (App Store code, e.g. de-DE); default the base language. Reads show that language; headline, subtitle and screenshot changes go to its translation. See languages');
/** Add ?set= and ?lang= for a tool call's screenshot set and language. */
const inSet = (url, a) => {
  if (a?.set) url = `${url}${url.includes('?') ? '&' : '?'}set=${encodeURIComponent(a.set)}`;
  if (a?.lang) url = `${url}${url.includes('?') ? '&' : '?'}lang=${encodeURIComponent(a.lang)}`;
  return url;
};
const slideArg = z.string().describe('Slide id or 1-based position');
const deviceEnum = z.enum(['iphone', 'duo', 'ipad', 'mac']);
const layoutEnum = z.enum(['top', 'bottom', 'side']);

const slideFields = {
  headline: z.string().optional().describe('Wrap words in *asterisks* to highlight; \\n for a line break'),
  subtitle: z.string().optional(),
  screen_name: z.string().optional().describe('Which app screen this slide shows, e.g. "Stats tab"'),
  screen_notes: z.string().optional().describe('How to reach the screen to re-capture it'),
  hero: z.boolean().optional().describe("Use the app's hero design: badge, app icon and name, leaning device. Usually slide 1 only"),
  style: z
    .record(z.string(), z.any())
    .optional()
    .describe('Override the app style on this slide only (same shape as the theme), e.g. {frame:{kind:"device"}} or {palettes:{primary:{background:{color:"#fafafa"}}}}. Set a key to null to use the app style again'),
  reset_style: z.boolean().optional().describe('Drop all of this slide\'s style overrides'),
};

function slidePatch(a) {
  const p = {};
  if (a.headline !== undefined) p.headline = a.headline;
  if (a.subtitle !== undefined) p.subtitle = a.subtitle;
  if (a.screen_name !== undefined || a.screen_notes !== undefined) {
    p.screen = {};
    if (a.screen_name !== undefined) p.screen.name = a.screen_name;
    if (a.screen_notes !== undefined) p.screen.notes = a.screen_notes;
  }
  if (a.hero !== undefined) p.role = a.hero ? 'hero' : 'standard';
  if (a.style) p.style = a.style;
  if (a.reset_style) p.style = null;
  return p;
}

server.registerTool(
  'list_apps',
  { title: 'List apps', description: 'Every app with per-device screenshot counts and its app-wide style.', inputSchema: {}, annotations: { readOnlyHint: true } },
  wrap(async () => {
    const all = await http('GET', '/api/data');
    if (!all.length) return text('No apps yet. Create one with create_app.');
    return text(all.map(overview).join('\n\n'));
  }),
);

server.registerTool(
  'get_app',
  {
    title: 'Get app data',
    description:
      'Full record for one app: remembered profile, app-wide style, devices (sizes, screenshot counts, issues) and every slide with its headline, subtitle, screen, and screenshot details per device.',
    inputSchema: { app: appArg, set: setArg, lang: langArg },
    annotations: { readOnlyHint: true },
  },
  wrap(async ({ app, set, lang }) => {
    const data = await http('GET', inSet(`/api/apps/${enc(await appId(app))}/data`, { set, lang }));
    return json(overview(data), data);
  }),
);

server.registerTool(
  'find_app_for_folder',
  {
    title: 'Find app for a folder',
    description: "Return the app whose profile project folder contains this path (e.g. the user's Xcode project).",
    inputSchema: { path: z.string() },
    annotations: { readOnlyHint: true },
  },
  wrap(async ({ path: p }) => {
    const a = await http('GET', `/api/lookup?path=${enc(expand(p))}`);
    const data = await http('GET', `/api/apps/${a.id}/data`);
    return json(overview(data), data);
  }),
);

server.registerTool(
  'create_app',
  {
    title: 'Create app',
    description: 'Create a new app. Presets: neutral, zinc, blue, green, rose, orange, violet, yellow, forest.',
    inputSchema: {
      name: z.string(),
      subtitle: z.string().optional(),
      preset: z.string().optional(),
      devices: z.array(deviceEnum).optional(),
      project_path: z.string().optional().describe('Source folder of the app, so it can be found from there later'),
      bundle_id: z.string().optional(),
      icon_path: z.string().optional().describe('Path to a 1024px icon PNG on this Mac'),
    },
  },
  wrap(async (a) => {
    const profile = {};
    if (a.project_path) profile.projectPath = expand(a.project_path);
    if (a.bundle_id) profile.bundleId = a.bundle_id;
    let created = await http('POST', '/api/apps', { name: a.name, subtitle: a.subtitle, preset: a.preset, devices: a.devices, profile });
    if (a.icon_path) created = await http('POST', `/api/apps/${created.id}/icon`, await form('file', [a.icon_path]));
    return text(`Created ${created.name} (id ${created.id}). Editor: ${BASE}/?app=${created.id}`);
  }),
);

server.registerTool(
  'update_app',
  {
    title: 'Update app and style',
    description:
      'Change the app (name, subtitle, icon, devices, export sizes) or its style. Style is app-wide: layout, colors, font, alignment, headline size, screenshot size/position, frame (outline or drawn device), callout look and the hero design apply to every slide.',
    inputSchema: {
      app: appArg,
      set: setArg, lang: langArg,
      layout: layoutEnum.optional(),
      alternate_colors: z.boolean().optional().describe('Use the second color scheme on every other slide'),
      align: z.enum(['left', 'center']).optional(),
      headline_size: z.number().optional(),
      screenshot_scale: z.number().optional().describe('1 = default size'),
      screenshot_offset: z.number().optional().describe('Move screenshots down (+) or up (-)'),
      text_offset: z.number().optional().describe('Move the headline and subtitle down (+) or up (-), units of 1/1000 of the short side'),
      name: z.string().optional(),
      subtitle: z.string().optional(),
      icon_path: z.string().optional(),
      devices: z.array(deviceEnum).optional(),
      preset: z.string().optional(),
      font: z.string().optional().describe('e.g. "Geist Variable", "Inter Variable", "Outfit Variable"'),
      stroke_color: z.string().optional(),
      stroke_width: z.number().optional(),
      corner_radius: z.number().optional().describe('Percent of the screenshot width'),
      frame: z.enum(['outline', 'device']).optional().describe('outline: rounded screenshot with a stroke; device: drawn iPhone/iPad/Mac hardware'),
      device_color: z.string().optional().describe('Hardware color for frame=device, e.g. #2b2b2e black, #d9dadc silver'),
      callout_scale: z.number().optional().describe('How much larger callouts are drawn, 1–1.5 (default 1.12)'),
      callout_shadow: z.number().optional().describe('0–1'),
      hero_badge: z.enum(['none', 'rating', 'downloads', 'custom']).optional().describe('Hero badge kind: rating adds five stars, downloads a download mark'),
      hero_badge_title: z.string().optional().describe('Badge text, e.g. "4.9 Stars" or "1M+ Downloads". Only real App Store numbers'),
      hero_badge_caption: z.string().optional().describe('Small line under the badge, e.g. "From 62k+ users"'),
      hero_lockup: z.boolean().optional().describe('Show app icon and name on hero slides'),
      hero_tilt: z.number().optional().describe('Hero device rotation in degrees, e.g. -6'),
      background: z.enum(['solid', 'gradient', 'glow', 'mesh', 'photo', 'frosted']).optional().describe('Fill of the main colors: mesh = soft blobs of 3 colors; frosted = the slide screenshot blurred'),
      mesh_colors: z.array(z.string()).min(2).max(3).optional().describe('Mesh base, blob and second blob colors'),
      panorama: z.boolean().optional().describe('Run one background across all slides (each slide shows its slice)'),
      texture: z.enum(['none', 'grain', 'dots', 'grid', 'lines']).optional(),
      texture_strength: z.number().optional().describe('0–0.6'),
      vignette: z.number().optional().describe('0–1'),
      glow: z.number().optional().describe('Light behind the screenshot, 0 (off) – 1'),
      glow_color: z.string().optional().describe('Glow color; "" uses the highlight color'),
      decor: z.enum(['none', 'blobs', 'waves', 'rings', 'sparkles', 'confetti', 'bokeh']).optional().describe('Generated shapes behind the screenshot'),
      decor_amount: z.number().optional().describe('0.25–3'),
      decor_size: z.number().optional().describe('0.4–2.5'),
      decor_opacity: z.number().optional().describe('0–1'),
      headline_mark: z.enum(['none', 'underline', 'double', 'circle', 'box', 'marker', 'strike', 'brackets', 'squiggle']).optional().describe('Hand-drawn mark on the *highlighted* headline words'),
      headline_mark_color: z.string().optional().describe('"" uses the highlight color'),
      headline_marker: z
        .object({
          opacity: z.number().min(0).max(100).optional().describe('0–100'),
          height: z.number().optional().describe('Share of the text size: 0.15 a thin stripe, 0.55 the default, 1.1 covers the words'),
          position: z.number().optional().describe('Moves it up (+) or down (−), share of the text size'),
          round: z.number().optional().describe('0 square ends, 1 pill'),
          tilt: z.number().optional().describe('Degrees, −6 to 6'),
        })
        .optional()
        .describe('The highlighter, when headline_mark is marker'),
      sticker_shadow: z.number().optional().describe('0–1'),
      export_sizes: z.record(z.string(), z.array(z.string())).optional().describe('Size labels per device, as shown in get_app'),
      theme: z.record(z.string(), z.any()).optional().describe('Raw deep-merge into the theme, e.g. {palettes:{primary:{accentColor:"#fde68a"}}}'),
    },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    const patch = {};
    for (const k of ['name', 'subtitle', 'devices', 'preset']) if (a[k] !== undefined) patch[k] = a[k];
    if (a.export_sizes) patch.exportSizes = a.export_sizes;
    const theme = { ...(a.theme ?? {}) };
    if (a.font) theme.fontFamily = a.font;
    if (a.layout) theme.layout = a.layout;
    if (a.alternate_colors !== undefined) theme.alternate = a.alternate_colors;
    if (a.align) theme.align = a.align;
    if (a.headline_size !== undefined) theme.headlineSize = a.headline_size;
    if (a.screenshot_scale !== undefined) theme.shotScale = a.screenshot_scale;
    if (a.screenshot_offset !== undefined) theme.shotOffsetY = a.screenshot_offset;
    if (a.text_offset !== undefined) theme.textOffsetY = a.text_offset;
    const frame = {};
    if (a.stroke_color) frame.strokeColor = a.stroke_color;
    if (a.stroke_width !== undefined) frame.strokeWidth = a.stroke_width;
    if (a.corner_radius !== undefined) frame.radius = a.corner_radius;
    if (a.frame) frame.kind = a.frame;
    if (a.device_color) frame.deviceColor = a.device_color;
    if (Object.keys(frame).length) theme.frame = { ...(theme.frame ?? {}), ...frame };
    const callout = {};
    if (a.callout_scale !== undefined) callout.scale = a.callout_scale;
    if (a.callout_shadow !== undefined) callout.shadow = a.callout_shadow;
    if (Object.keys(callout).length) theme.callout = { ...(theme.callout ?? {}), ...callout };
    const hero = {};
    if (a.hero_badge !== undefined) hero.badge = a.hero_badge;
    if (a.hero_badge_title !== undefined) hero.badgeTitle = a.hero_badge_title;
    if (a.hero_badge_caption !== undefined) hero.badgeCaption = a.hero_badge_caption;
    if (a.hero_lockup !== undefined) hero.lockup = a.hero_lockup;
    if (a.hero_tilt !== undefined) hero.tilt = a.hero_tilt;
    if (Object.keys(hero).length) theme.hero = { ...(theme.hero ?? {}), ...hero };
    const types = { solid: 'solid', gradient: 'linear', glow: 'radial', mesh: 'mesh', photo: 'image', frosted: 'screenshot' };
    const fill = {};
    if (a.background) fill.type = types[a.background];
    if (a.mesh_colors) Object.assign(fill, { color: a.mesh_colors[0], color2: a.mesh_colors[1], color3: a.mesh_colors[2] ?? a.mesh_colors[1] });
    if (Object.keys(fill).length) theme.palettes = { ...(theme.palettes ?? {}), primary: { ...(theme.palettes?.primary ?? {}), background: { ...(theme.palettes?.primary?.background ?? {}), ...fill } } };
    if (a.panorama !== undefined) theme.panorama = a.panorama;
    if (a.texture !== undefined || a.texture_strength !== undefined) theme.texture = { ...(theme.texture ?? {}), ...(a.texture ? { kind: a.texture } : {}), ...(a.texture_strength !== undefined ? { opacity: a.texture_strength } : {}) };
    if (a.vignette !== undefined) theme.vignette = a.vignette;
    if (a.decor !== undefined || a.decor_amount !== undefined || a.decor_size !== undefined || a.decor_opacity !== undefined) {
      theme.decor = {
        ...(theme.decor ?? {}),
        ...(a.decor ? { kind: a.decor } : {}),
        ...(a.decor_amount !== undefined ? { density: a.decor_amount } : {}),
        ...(a.decor_size !== undefined ? { scale: a.decor_size } : {}),
        ...(a.decor_opacity !== undefined ? { opacity: a.decor_opacity } : {}),
      };
    }
    if (a.headline_marker) {
      const m = a.headline_marker;
      const marker = {};
      if (m.opacity !== undefined) marker.opacity = m.opacity / 100;
      if (m.height !== undefined) marker.height = m.height;
      if (m.position !== undefined) marker.lift = m.position;
      if (m.round !== undefined) marker.radius = m.round;
      if (m.tilt !== undefined) marker.tilt = m.tilt;
      theme.annotation = { ...(theme.annotation ?? {}), marker };
    }
    if (a.headline_mark !== undefined || a.headline_mark_color !== undefined) {
      theme.annotation = { ...(theme.annotation ?? {}), ...(a.headline_mark ? { kind: a.headline_mark } : {}), ...(a.headline_mark_color !== undefined ? { color: a.headline_mark_color } : {}) };
    }
    if (a.sticker_shadow !== undefined) theme.stickerShadow = a.sticker_shadow;
    if (a.glow !== undefined || a.glow_color !== undefined) theme.glow = { ...(theme.glow ?? {}), ...(a.glow !== undefined ? { strength: a.glow } : {}), ...(a.glow_color !== undefined ? { color: a.glow_color } : {}) };
    if (Object.keys(theme).length) patch.theme = theme;
    if (Object.keys(patch).length) await http('PATCH', inSet(`/api/apps/${id}`, a), patch);
    if (a.icon_path) await http('POST', inSet(`/api/apps/${id}/icon`, a), await form('file', [a.icon_path]));
    const data = await http('GET', inSet(`/api/apps/${id}/data`, a));
    return text(`Updated.\n${overview(data)}`);
  }),
);

server.registerTool(
  'update_profile',
  {
    title: 'Remember app details',
    description:
      'Save what you learn about an app so later sessions know it: project folder, bundle id, what it does, audience, keywords, brand colors, which screens to capture and how, and notes.',
    inputSchema: {
      app: appArg,
      project_path: z.string().optional(),
      bundle_id: z.string().optional(),
      app_store_url: z.string().optional(),
      category: z.string().optional(),
      description: z.string().optional(),
      audience: z.string().optional(),
      keywords: z.array(z.string()).optional(),
      brand_colors: z.array(z.string()).optional(),
      screens: z.string().optional().describe('Which screens to capture, in order, and how to reach each'),
      notes: z.string().optional().describe('Replaces all notes'),
      add_note: z.string().optional().describe('Appends a dated note'),
    },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    const current = await http('GET', inSet(`/api/apps/${id}`, a));
    const map = { bundle_id: 'bundleId', app_store_url: 'appStoreUrl', category: 'category', description: 'description', audience: 'audience', keywords: 'keywords', brand_colors: 'brandColors', screens: 'screens', notes: 'notes' };
    const profile = {};
    for (const [k, key] of Object.entries(map)) if (a[k] !== undefined) profile[key] = a[k];
    if (a.project_path) profile.projectPath = expand(a.project_path);
    if (a.add_note) {
      const stamp = new Date().toISOString().slice(0, 10);
      profile.notes = [profile.notes ?? current.profile?.notes, `${stamp}: ${a.add_note}`].filter(Boolean).join('\n');
    }
    const next = await http('PATCH', inSet(`/api/apps/${id}`, a), { profile });
    return json(`Saved profile for ${next.name}.`, next.profile);
  }),
);

server.registerTool(
  'add_screenshots',
  {
    title: 'Add screenshots',
    description:
      'Add image files from this Mac. Each fills the next slide missing a screenshot for its device (auto-detected from pixel size), then new slides are created.',
    inputSchema: {
      app: appArg,
      set: setArg, lang: langArg,
      paths: z.array(z.string()).min(1),
      device: deviceEnum.optional(),
      headlines: z.array(z.string()).optional().describe('One per file, in order'),
      screens: z.array(z.string()).optional().describe('Screen name per file, in order'),
    },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    const r = await http(
      'POST',
      inSet(`/api/apps/${id}/screenshots`, a),
      await form('files', a.paths, { device: a.device, headlines: a.headlines, screens: a.screens, source: { kind: 'file' } }),
    );
    const data = await http('GET', inSet(`/api/apps/${id}/data`, a));
    const pos = (sid) => data.slides.find((s) => s.id === sid)?.position;
    const lines = r.placed.map((p) => `${p.created ? 'New' : 'Filled'} slide ${pos(p.slideId)} (${p.device})`);
    r.skipped.forEach((s) => lines.push(`Skipped ${s.name}: ${s.reason}`));
    return text(`${lines.join('\n')}\n\n${overview(data)}`);
  }),
);

server.registerTool(
  'capture_simulator',
  {
    title: 'Capture from Simulator',
    description: "Screenshot the booted iOS Simulator into the app (new slide, or replace a slide's screenshot).",
    inputSchema: {
      app: appArg,
      set: setArg, lang: langArg,
      slide: z.string().optional().describe('Replace this slide instead of adding'),
      headline: z.string().optional(),
      screen: z.string().optional().describe('Name of the screen being captured'),
      clean_status_bar: z.boolean().optional().describe('Set 9:41, full battery and signal first'),
      udid: z.string().optional(),
    },
  },
  wrap(async (a) => {
    await ensureServer();
    const args = [CLI, 'capture', await appId(a.app)];
    if (a.slide) args.push('--slide', a.slide);
    if (a.headline) args.push('--headline', a.headline);
    if (a.screen) args.push('--screen', a.screen);
    if (a.clean_status_bar) args.push('--clean-status-bar');
    if (a.udid) args.push('--udid', a.udid);
    if (a.set) args.push('--in', a.set);
    if (a.lang) args.push('--lang', a.lang);
    const out = await new Promise((resolve, reject) =>
      execFile(process.execPath, args, { env: { ...process.env, APPSHOT_URL: BASE } }, (err, stdout, stderr) =>
        err ? reject(new Error(stderr.trim() || err.message)) : resolve(stdout.trim()),
      ),
    );
    return text(out);
  }),
);

server.registerTool(
  'update_slide',
  { title: 'Update slide', description: "Edit a slide's words, screen info or hero role, or override the app style on this slide only (style). For the look of every slide use update_app.", inputSchema: { app: appArg, set: setArg, lang: langArg, slide: slideArg, ...slideFields } },
  wrap(async (a) => {
    const id = await appId(a.app);
    const s = await http('PATCH', inSet(`/api/apps/${id}/slides/${enc(a.slide)}`, a), slidePatch(a));
    return text(`Updated slide ${a.slide}: ${s.headline.replace(/\n/g, ' / ')}`);
  }),
);

server.registerTool(
  'add_slide',
  {
    title: 'Add slide',
    description: 'Add a slide. Add its screenshot with set_screenshot or add_screenshots.',
    inputSchema: { app: appArg, set: setArg, position: z.number().int().optional().describe('1-based; default end'), ...slideFields },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    const body = slidePatch(a);
    if (a.position) body.index = a.position - 1;
    const s = await http('POST', inSet(`/api/apps/${id}/slides`, a), body);
    return text(`Added slide (id ${s.id}).`);
  }),
);

server.registerTool(
  'delete_slide',
  { title: 'Delete slide', description: 'Delete a slide.', inputSchema: { app: appArg, set: setArg, slide: slideArg }, annotations: { destructiveHint: true } },
  wrap(async (a) => {
    await http('DELETE', inSet(`/api/apps/${await appId(a.app)}/slides/${enc(a.slide)}`, a));
    return text(`Deleted slide ${a.slide}.`);
  }),
);

server.registerTool(
  'move_slide',
  { title: 'Move slide', description: 'Move a slide to a new 1-based position.', inputSchema: { app: appArg, set: setArg, slide: slideArg, to: z.number().int().min(1) } },
  wrap(async (a) => {
    const id = await appId(a.app);
    const app = await http('GET', inSet(`/api/apps/${id}`, a));
    const s = app.slides.find((x) => x.id === a.slide) ?? app.slides[Number(a.slide) - 1];
    if (!s) throw new Error(`Slide ${a.slide} not found`);
    const order = app.slides.map((x) => x.id).filter((x) => x !== s.id);
    order.splice(Math.min(order.length, a.to - 1), 0, s.id);
    await http('PUT', inSet(`/api/apps/${id}/order`, a), { order });
    return text(`Moved to position ${a.to}.`);
  }),
);

server.registerTool(
  'manage_sets',
  {
    title: 'Screenshot sets',
    description:
      'An app has a primary screenshot set plus any test sets (mockups being tried). Each set has its own slides, style and product page assets; name, icon, devices and profile are shared. Every slide/style/creative/preview/export tool takes `set`. List, create (copy of a set or blank), rename, delete, or make a set primary.',
    inputSchema: {
      app: appArg,
      action: z.enum(['list', 'create', 'rename', 'delete', 'make_primary']),
      set: z.string().optional().describe('The set to rename, delete or make primary; for create, the set to copy (default primary)'),
      name: z.string().optional().describe('Name for create or rename'),
      blank: z.boolean().optional().describe('create: start with no slides (keeps the style)'),
    },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    const list = (l) => l.map((x) => `${x.primary ? '* ' : '  '}${x.name} (${x.slides} slides) id ${x.id}`).join('\n');
    if (a.action === 'create') {
      const s = await http('POST', `/api/apps/${id}/sets`, { name: a.name, from: a.set, blank: a.blank });
      return text(`Created set "${s.name}" with ${s.slides.length} slides. Pass set: "${s.name}" to work on it.`);
    }
    if (a.action !== 'list' && !a.set) throw new Error('Pass set');
    if (a.action === 'rename') return text(list(await http('PATCH', `/api/apps/${id}/sets/${enc(a.set)}`, { name: a.name ?? '' })));
    if (a.action === 'delete') return text(list(await http('DELETE', `/api/apps/${id}/sets/${enc(a.set)}`)));
    if (a.action === 'make_primary') return text(list(await http('POST', `/api/apps/${id}/sets/${enc(a.set)}/primary`)));
    return text(list(await http('GET', `/api/apps/${id}/sets`)));
  }),
);

server.registerTool(
  'search_emoji',
  {
    title: 'Search emoji stickers',
    description:
      'Find emoji by words, for stickers. Returns slugs to pass to stickers. Looks: 3d, color, flat (Fluent Emoji, bundled) and apple (Apple emoji, only when the result says an emoji font is installed).',
    inputSchema: { query: z.string() },
    annotations: { readOnlyHint: true },
  },
  wrap(async (a) => {
    const r = await http('GET', `/api/emoji?q=${enc(a.query)}&limit=30`);
    if (!r.available) throw new Error('Emoji are not downloaded on the server; run "npm run setup:emoji" in OpenAppShot.');
    const head = r.font ? `Emoji font installed (${r.font.source}): style "apple" works.\n` : 'No emoji font installed: use style 3d, color or flat.\n';
    return text(r.emoji.length ? head + r.emoji.map((e) => `${e.glyph} ${e.slug} (${e.group})`).join('\n') : 'No emoji found.');
  }),
);

server.registerTool(
  'stickers',
  {
    title: 'Slide stickers',
    description:
      'List, add, update or remove stickers on a slide: 3D emoji (slug from search_emoji) or hand-drawn doodles (arrow-curve, arrow-down, arrow-loop, arrow-straight, underline, squiggle, circle, star, star-filled, sparkle, burst, heart, heart-filled, spiral, check, cross, exclaim, lightning, crown, scribble, bracket). Position x/y is the center as 0–1 fractions of the slide; size is in 1/1000 of the short side (emoji ~200, doodles ~260). Check with preview_slide.',
    inputSchema: {
      app: appArg,
      set: setArg,
      slide: slideArg,
      action: z.enum(['list', 'add', 'update', 'remove']),
      index: z.number().int().min(1).optional().describe('Sticker number for update/remove (1-based, from list)'),
      kind: z.enum(['emoji', 'doodle']).optional(),
      ref: z.string().optional().describe('Emoji slug or doodle name (add)'),
      style: z.enum(['3d', 'color', 'flat', 'apple']).optional().describe('Emoji look; apple needs the emoji font installed (see search_emoji)'),
      x: z.number().min(0).max(1).optional(),
      y: z.number().min(0).max(1).optional(),
      size: z.number().optional(),
      rotation: z.number().optional(),
      layer: z.enum(['front', 'back']).optional().describe('In front of or behind the screenshot'),
      color: z.string().optional().describe('Doodle color; "" uses the highlight color'),
      opacity: z.number().min(0).max(1).optional(),
      flip: z.boolean().optional(),
    },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    const app = await http('GET', inSet(`/api/apps/${id}`, a));
    const slide = app.slides.find((s) => s.id === a.slide) ?? app.slides[Number(a.slide) - 1];
    if (!slide) throw new Error(`No slide ${a.slide}`);
    let list = [...(slide.stickers ?? [])];
    const pick = (s) => {
      for (const k of ['style', 'x', 'y', 'size', 'rotation', 'layer', 'color', 'opacity', 'flip']) if (a[k] !== undefined) s[k] = a[k];
      return s;
    };
    const describe = (s, i) => `${i + 1}. ${s.kind} ${s.ref} at ${s.x},${s.y} size ${s.size} ${s.rotation}° ${s.layer}`;
    if (a.action === 'list') return text(list.map(describe).join('\n') || 'No stickers on this slide.');
    if (a.action === 'add') {
      if (!a.ref) throw new Error('Pass ref');
      const kind = a.kind ?? 'emoji';
      list.push(pick({ id: Math.random().toString(36).slice(2, 10), kind, ref: a.ref, style: '3d', x: 0.82, y: 0.16, size: kind === 'doodle' ? 260 : 200, rotation: -8, layer: 'front', color: '', flip: false, opacity: 1 }));
    } else {
      const i = (a.index ?? 0) - 1;
      if (!list[i]) throw new Error(`No sticker ${a.index}`);
      if (a.action === 'update') list[i] = pick({ ...list[i] });
      else list = list.filter((_, j) => j !== i);
    }
    const s = await http('PATCH', inSet(`/api/apps/${id}/slides/${slide.id}`, a), { stickers: list });
    return text(s.stickers.map(describe).join('\n') || 'No stickers on this slide.');
  }),
);

server.registerTool(
  'update_creative',
  {
    title: 'Update product page asset',
    description:
      "Edit the app's product page header (3840×1646, safe area 1646×661) or search results asset (3840×2560, safe area 2168×1030), shown on iOS 27+. They use the app's colors, type and frame. One short phrase; for search, make what the app does obvious. Check with preview_creative.",
    inputSchema: {
      app: appArg,
      set: setArg, lang: langArg,
      creative: z.enum(['header', 'search']),
      include_in_export: z.boolean().optional(),
      headline: z.string().optional().describe('*highlight* and \\n like slides'),
      subtitle: z.string().optional(),
      lockup: z.boolean().optional().describe('App icon and name above the headline'),
      text_position: z.enum(['left', 'center', 'none']).optional(),
      screenshots: z
        .array(z.object({ slide: z.union([z.string(), z.number()]), device: deviceEnum.optional() }))
        .max(4)
        .optional()
        .describe('Slides (position or id) whose screenshots to show, iPhone unless device given; [] = first slides automatically'),
      shot_scale: z.number().optional().describe('Screenshot height vs the safe area height, e.g. 1.1'),
    },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    const app = await http('GET', inSet(`/api/apps/${id}`, a));
    const p = {};
    if (a.include_in_export !== undefined) p.enabled = a.include_in_export;
    for (const [k, key] of [['headline', 'headline'], ['subtitle', 'subtitle'], ['lockup', 'lockup'], ['text_position', 'textPosition'], ['shot_scale', 'shotScale']]) {
      if (a[k] !== undefined) p[key] = a[k];
    }
    if (a.screenshots) {
      p.shots = a.screenshots.map((s) => {
        const slide = app.slides.find((x) => x.id === String(s.slide)) ?? app.slides[Number(s.slide) - 1];
        const device = s.device ?? 'iphone';
        if (!slide?.shots[device]) throw new Error(`Slide ${s.slide} has no ${device} screenshot.`);
        return { slideId: slide.id, device };
      });
    }
    await http('PATCH', inSet(`/api/apps/${id}`, a), { creatives: { [a.creative]: p } });
    return text(`Updated the ${a.creative === 'header' ? 'product page header' : 'search results asset'}. Check it with preview_creative.`);
  }),
);

server.registerTool(
  'preview_creative',
  {
    title: 'Preview product page asset',
    description: 'Render the product page header or search results asset and return it as an image. The safe area is the centered 1646×661 (header) or 2168×1030 (search) region.',
    inputSchema: { app: appArg, set: setArg, lang: langArg, creative: z.enum(['header', 'search']) },
    annotations: { readOnlyHint: true },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    const png = await http('GET', inSet(`/api/apps/${id}/creatives/${a.creative}/render.png?scale=0.3`, a));
    return { content: [{ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }, { type: 'text', text: `${a.creative} asset.` }] };
  }),
);

server.registerTool(
  'set_callout',
  {
    title: 'Set callout',
    description:
      "Mark part of a slide's screenshot (a card, row or button) to lift out, drawn larger with a shadow above the screen. Give the box in that screenshot's pixels (see get_app for its size; preview_slide to check), or clear it. Per device.",
    inputSchema: {
      app: appArg,
      set: setArg,
      slide: slideArg,
      device: deviceEnum.optional().describe('Default: the first device this slide has a screenshot for'),
      x: z.number().min(0).optional(),
      y: z.number().min(0).optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      clear: z.boolean().optional(),
    },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    const app = await http('GET', inSet(`/api/apps/${id}`, a));
    const slide = app.slides.find((s) => s.id === a.slide) ?? app.slides[Number(a.slide) - 1];
    if (!slide) throw new Error(`No slide ${a.slide}`);
    const device = a.device ?? app.devices.find((d) => slide.shots[d]);
    if (!device) throw new Error('This slide has no screenshot yet.');
    if (a.clear) {
      await http('PATCH', inSet(`/api/apps/${id}/slides/${slide.id}`, a), { callouts: { [device]: null } });
      return text(`Removed the ${device} callout from slide ${a.slide}.`);
    }
    const asset = app.assets[slide.shots[device]];
    if (!asset) throw new Error(`Slide ${a.slide} has no ${device} screenshot.`);
    if ([a.x, a.y, a.width, a.height].some((v) => v === undefined)) throw new Error('Give x, y, width and height, or clear: true.');
    const c = (v) => Math.max(0, Math.min(1, v));
    const rect = { x: c(a.x / asset.width), y: c(a.y / asset.height) };
    rect.w = c(Math.min(a.width / asset.width, 1 - rect.x));
    rect.h = c(Math.min(a.height / asset.height, 1 - rect.y));
    await http('PATCH', inSet(`/api/apps/${id}/slides/${slide.id}`, a), { callouts: { [device]: rect } });
    return text(`Callout set on slide ${a.slide} (${device}). Check it with preview_slide.`);
  }),
);

server.registerTool(
  'set_screenshot',
  {
    title: 'Replace screenshot',
    description: "Replace one slide's screenshot for a device with an image file on this Mac.",
    inputSchema: { app: appArg, set: setArg, lang: langArg, slide: slideArg, path: z.string(), device: deviceEnum },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    await http(
      'PUT',
      inSet(`/api/apps/${id}/slides/${enc(a.slide)}/shot`, a),
      await form('file', [a.path], { device: a.device, source: { kind: 'file', path: expand(a.path) } }),
    );
    return text(`Replaced the ${a.device} screenshot on slide ${a.slide}.`);
  }),
);

server.registerTool(
  'preview_slide',
  {
    title: 'Preview slide',
    description: 'Render a slide and return it as an image so you can check the result.',
    inputSchema: { app: appArg, set: setArg, lang: langArg, slide: slideArg, device: deviceEnum.optional(), scale: z.number().min(0.1).max(1).optional().describe('Default 0.3') },
    annotations: { readOnlyHint: true },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    const app = await http('GET', inSet(`/api/apps/${id}`, a));
    const device = a.device ?? app.devices[0];
    const png = await http('GET', inSet(`/api/apps/${id}/slides/${enc(a.slide)}/render/${device}.png?scale=${a.scale ?? 0.3}`, a));
    return {
      content: [
        { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
        { type: 'text', text: `Slide ${a.slide} on ${device}.` },
      ],
    };
  }),
);

server.registerTool(
  'export',
  {
    title: 'Export PNGs',
    description: 'Render every chosen App Store size to PNG files and a zip on this Mac.',
    inputSchema: {
      app: appArg,
      set: setArg,
      devices: z.array(deviceEnum).optional(),
      languages: z.array(z.string()).optional().describe('Language codes to export; default every language (a folder each)'),
      out_dir: z.string().optional(),
    },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    const local = await serverIsLocal(BASE);
    const outDir = a.out_dir ? expand(a.out_dir) : undefined;
    let r = await http('POST', inSet(`/api/apps/${id}/export`, a), { devices: a.devices, languages: a.languages });
    // Same disk: move it into out_dir. Another machine: download the zip and unpack it on this Mac.
    r = local ? moveExport(r, outDir) : await fetchExport(BASE, r, outDir);
    const counts = {};
    r.files.forEach((f) => (counts[`${f.device} ${f.size}`] = (counts[`${f.device} ${f.size}`] ?? 0) + 1));
    const lines = [`Exported ${r.files.length} PNGs to ${r.dir}`, ...Object.entries(counts).map(([k, n]) => `  ${k}: ${n}`), `Zip: ${r.zip}`];
    if (r.skipped.length) lines.push(`Skipped ${r.skipped.length} slide(s) with no screenshot for that device`);
    if (r.languages?.length > 1) lines.push(`Languages: ${r.languages.join(', ')} (a folder each)`);
    for (const u of r.untranslated ?? []) lines.push(`Not translated: ${u.language} slide ${u.position} (${u.missing.join(', ')}) used the base text`);
    return text(lines.join('\n'));
  }),
);

server.registerTool(
  'languages',
  {
    title: 'Languages',
    description:
      "Show or change an app's languages. Slides are written in the base language; each translation language gets its own headlines, subtitles and (optionally) screenshots, with the same design. Codes are App Store Connect localizations (de-DE, fr-FR, ja, zh-Hans, pt-BR, es-MX…).",
    inputSchema: {
      app: appArg,
      add: z.array(z.string()).optional(),
      remove: z.array(z.string()).optional().describe('Translations stay saved and come back if re-added'),
      base: z.string().optional().describe('Language the slides are written in'),
    },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    const app = await http('GET', `/api/apps/${id}`);
    const rm = (a.remove ?? []).map((x) => x.toLowerCase());
    const languages = [...app.languages, ...(a.add ?? [])].filter((l) => !rm.includes(l.toLowerCase()));
    const patch = {};
    if (a.add || a.remove) patch.languages = languages;
    if (a.base) Object.assign(patch, { baseLanguage: a.base, languages });
    const next = Object.keys(patch).length ? await http('PATCH', `/api/apps/${id}`, patch) : app;
    const r = next.languages.length ? await http('GET', `/api/apps/${id}/translations`) : { languages: [] };
    return text([`Written in ${next.baseLanguage}.`, ...r.languages.map((l) => `${l.code} ${l.name}: ${l.done}/${l.total} slides translated`)].join('\n'));
  }),
);

server.registerTool(
  'translate',
  {
    title: 'Translations',
    description:
      'Read or write translations for one language. Without slides/creatives/hero it returns the base text next to the current translation of every slide, creative and hero badge. With them it saves those translations (slide by id or 1-based position; an empty string clears one). Keep the *asterisks* around the highlighted words and keep headlines about as short as the original; check with preview_slide and lang.',
    inputSchema: {
      app: appArg,
      set: setArg,
      lang: z.string().describe('Translation language code, e.g. de-DE'),
      slides: z
        .array(z.object({ slide: z.union([z.string(), z.number()]), headline: z.string().optional(), subtitle: z.string().optional() }))
        .optional(),
      creatives: z
        .object({
          header: z.object({ headline: z.string().optional(), subtitle: z.string().optional() }).optional(),
          search: z.object({ headline: z.string().optional(), subtitle: z.string().optional() }).optional(),
        })
        .optional(),
      hero: z.object({ badgeTitle: z.string().optional(), badgeCaption: z.string().optional() }).optional(),
    },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    const write = a.slides || a.creatives || a.hero;
    // The language is part of the route here, not ?lang=.
    const scope = { set: a.set };
    const r = write
      ? await http('PUT', inSet(`/api/apps/${id}/translations/${enc(a.lang)}`, scope), { slides: a.slides, creatives: a.creatives, hero: a.hero })
      : await http('GET', inSet(`/api/apps/${id}/translations?lang=${enc(a.lang)}`, scope));
    const l = r.languages[0];
    const lines = [`${l.name} (${l.code}): ${l.done}/${l.total} slides translated`];
    for (const s of l.slides) {
      lines.push(`${s.position}. ${s.base.headline}${s.base.subtitle ? ` | ${s.base.subtitle}` : ''}`);
      lines.push(`   → ${s.translation.headline || '(missing)'}${s.base.subtitle ? ` | ${s.translation.subtitle || '(missing)'}` : ''}`);
    }
    for (const c of l.creatives) lines.push(`${c.creative}: ${c.base.headline}\n   → ${c.translation.headline || '(missing)'}`);
    if (l.hero) lines.push(`hero badge: ${l.hero.base.badgeTitle} / ${l.hero.base.badgeCaption}\n   → ${l.hero.translation.badgeTitle || '(missing)'} / ${l.hero.translation.badgeCaption || '(missing)'}`);
    return text(lines.join('\n'));
  }),
);

server.registerTool(
  'open_editor',
  { title: 'Open editor', description: 'Open the app in the OpenAppShot editor in the browser.', inputSchema: { app: appArg.optional() } },
  wrap(async (a) => {
    await ensureServer();
    const url = a.app ? `${BASE}/?app=${await appId(a.app)}` : BASE;
    execFile('open', [url]);
    return text(`Opened ${url}`);
  }),
);

await server.connect(new StdioServerTransport());
log('ready');
