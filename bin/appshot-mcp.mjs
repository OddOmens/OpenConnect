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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.APPSHOT_URL ?? 'http://127.0.0.1:4317').replace(/\/$/, '');
const CLI = path.join(ROOT, 'bin', 'appshot.mjs');
const log = (...a) => console.error('[openappshot]', ...a);

// ---------- local server ----------
async function healthy() {
  try {
    const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

let starting = null;
/** Start the studio server in the background if it isn't running. */
async function ensureServer() {
  if (await healthy()) return;
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
const slideArg = z.string().describe('Slide id or 1-based position');
const deviceEnum = z.enum(['iphone', 'duo', 'ipad', 'mac']);
const layoutEnum = z.enum(['top', 'bottom', 'side']);

const slideFields = {
  headline: z.string().optional().describe('Wrap words in *asterisks* to highlight; \\n for a line break'),
  subtitle: z.string().optional(),
  screen_name: z.string().optional().describe('Which app screen this slide shows, e.g. "Stats tab"'),
  screen_notes: z.string().optional().describe('How to reach the screen to re-capture it'),
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
    inputSchema: { app: appArg },
    annotations: { readOnlyHint: true },
  },
  wrap(async ({ app }) => {
    const data = await http('GET', `/api/apps/${enc(await appId(app))}/data`);
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
      'Change the app (name, subtitle, icon, devices, export sizes) or its style. Style is app-wide: layout, colors, font, alignment, headline size, screenshot size/position and frame apply to every slide.',
    inputSchema: {
      app: appArg,
      layout: layoutEnum.optional(),
      alternate_colors: z.boolean().optional().describe('Use the second color scheme on every other slide'),
      align: z.enum(['left', 'center']).optional(),
      headline_size: z.number().optional(),
      screenshot_scale: z.number().optional().describe('1 = default size'),
      screenshot_offset: z.number().optional().describe('Move screenshots down (+) or up (-)'),
      name: z.string().optional(),
      subtitle: z.string().optional(),
      icon_path: z.string().optional(),
      devices: z.array(deviceEnum).optional(),
      preset: z.string().optional(),
      font: z.string().optional().describe('e.g. "Geist Variable", "Inter Variable", "Outfit Variable"'),
      stroke_color: z.string().optional(),
      stroke_width: z.number().optional(),
      corner_radius: z.number().optional().describe('Percent of the screenshot width'),
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
    const frame = {};
    if (a.stroke_color) frame.strokeColor = a.stroke_color;
    if (a.stroke_width !== undefined) frame.strokeWidth = a.stroke_width;
    if (a.corner_radius !== undefined) frame.radius = a.corner_radius;
    if (Object.keys(frame).length) theme.frame = { ...(theme.frame ?? {}), ...frame };
    if (Object.keys(theme).length) patch.theme = theme;
    if (Object.keys(patch).length) await http('PATCH', `/api/apps/${id}`, patch);
    if (a.icon_path) await http('POST', `/api/apps/${id}/icon`, await form('file', [a.icon_path]));
    const data = await http('GET', `/api/apps/${id}/data`);
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
    const current = await http('GET', `/api/apps/${id}`);
    const map = { bundle_id: 'bundleId', app_store_url: 'appStoreUrl', category: 'category', description: 'description', audience: 'audience', keywords: 'keywords', brand_colors: 'brandColors', screens: 'screens', notes: 'notes' };
    const profile = {};
    for (const [k, key] of Object.entries(map)) if (a[k] !== undefined) profile[key] = a[k];
    if (a.project_path) profile.projectPath = expand(a.project_path);
    if (a.add_note) {
      const stamp = new Date().toISOString().slice(0, 10);
      profile.notes = [profile.notes ?? current.profile?.notes, `${stamp}: ${a.add_note}`].filter(Boolean).join('\n');
    }
    const next = await http('PATCH', `/api/apps/${id}`, { profile });
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
      `/api/apps/${id}/screenshots`,
      await form('files', a.paths, { device: a.device, headlines: a.headlines, screens: a.screens, source: { kind: 'file' } }),
    );
    const data = await http('GET', `/api/apps/${id}/data`);
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
  { title: 'Update slide', description: "Edit a slide's words or screen info. For look and layout use update_app.", inputSchema: { app: appArg, slide: slideArg, ...slideFields } },
  wrap(async (a) => {
    const id = await appId(a.app);
    const s = await http('PATCH', `/api/apps/${id}/slides/${enc(a.slide)}`, slidePatch(a));
    return text(`Updated slide ${a.slide}: ${s.headline.replace(/\n/g, ' / ')}`);
  }),
);

server.registerTool(
  'add_slide',
  {
    title: 'Add slide',
    description: 'Add a slide. Add its screenshot with set_screenshot or add_screenshots.',
    inputSchema: { app: appArg, position: z.number().int().optional().describe('1-based; default end'), ...slideFields },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    const body = slidePatch(a);
    if (a.position) body.index = a.position - 1;
    const s = await http('POST', `/api/apps/${id}/slides`, body);
    return text(`Added slide (id ${s.id}).`);
  }),
);

server.registerTool(
  'delete_slide',
  { title: 'Delete slide', description: 'Delete a slide.', inputSchema: { app: appArg, slide: slideArg }, annotations: { destructiveHint: true } },
  wrap(async (a) => {
    await http('DELETE', `/api/apps/${await appId(a.app)}/slides/${enc(a.slide)}`);
    return text(`Deleted slide ${a.slide}.`);
  }),
);

server.registerTool(
  'move_slide',
  { title: 'Move slide', description: 'Move a slide to a new 1-based position.', inputSchema: { app: appArg, slide: slideArg, to: z.number().int().min(1) } },
  wrap(async (a) => {
    const id = await appId(a.app);
    const app = await http('GET', `/api/apps/${id}`);
    const s = app.slides.find((x) => x.id === a.slide) ?? app.slides[Number(a.slide) - 1];
    if (!s) throw new Error(`Slide ${a.slide} not found`);
    const order = app.slides.map((x) => x.id).filter((x) => x !== s.id);
    order.splice(Math.min(order.length, a.to - 1), 0, s.id);
    await http('PUT', `/api/apps/${id}/order`, { order });
    return text(`Moved to position ${a.to}.`);
  }),
);

server.registerTool(
  'set_screenshot',
  {
    title: 'Replace screenshot',
    description: "Replace one slide's screenshot for a device with an image file on this Mac.",
    inputSchema: { app: appArg, slide: slideArg, path: z.string(), device: deviceEnum },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    await http(
      'PUT',
      `/api/apps/${id}/slides/${enc(a.slide)}/shot`,
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
    inputSchema: { app: appArg, slide: slideArg, device: deviceEnum.optional(), scale: z.number().min(0.1).max(1).optional().describe('Default 0.3') },
    annotations: { readOnlyHint: true },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    const app = await http('GET', `/api/apps/${id}`);
    const device = a.device ?? app.devices[0];
    const png = await http('GET', `/api/apps/${id}/slides/${enc(a.slide)}/render/${device}.png?scale=${a.scale ?? 0.3}`);
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
      devices: z.array(deviceEnum).optional(),
      out_dir: z.string().optional(),
    },
  },
  wrap(async (a) => {
    const id = await appId(a.app);
    const r = await http('POST', `/api/apps/${id}/export`, {
      devices: a.devices,
      outDir: a.out_dir ? expand(a.out_dir) : undefined,
    });
    const counts = {};
    r.files.forEach((f) => (counts[`${f.device} ${f.size}`] = (counts[`${f.device} ${f.size}`] ?? 0) + 1));
    const lines = [`Exported ${r.files.length} PNGs to ${r.dir}`, ...Object.entries(counts).map(([k, n]) => `  ${k}: ${n}`), `Zip: ${r.zip}`];
    if (r.skipped.length) lines.push(`Skipped ${r.skipped.length} slide(s) with no screenshot for that device`);
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
