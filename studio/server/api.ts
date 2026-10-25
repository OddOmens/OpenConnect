// The studio's data API: apps, slides, screenshots, sets and translations. Written against the web
// platform's Request/Response so it runs in two places from one source:
//   - inside OpenConnect, as a Next.js route (app/studio/api/[...path]/route.ts in the repo root);
//   - in the studio's own Express server (standalone, and the render container), via toExpress().
// Rendering, previews, exports and emoji search need Chromium or the bundled emoji, so they stay in
// server/index.ts; handle() returns null for them and the host passes the request on.

import fs from 'node:fs';
import path from 'node:path';
import type { AssetSource, DeviceId } from '../src/shared/types.ts';
import { DEVICE_IDS } from '../src/shared/types.ts';
import { PRESETS } from '../src/shared/presets.ts';
import { DEVICES } from '../src/shared/devices.ts';
import { checkDevice, checkSlide, checkTranslation } from '../src/shared/guidelines.ts';
import { buildAppData } from '../src/shared/summary.ts';
import { localize, localizeAppPatch, localizeSlidePatch, translationLanguage, translationReport } from '../src/shared/locales.ts';
import * as store from './store.ts';

export interface ApiHost {
  /** This studio as the client sees it, e.g. https://host/studio, for links in responses. */
  publicBase(req: Request): string;
}

interface Ctx {
  req: Request;
  url: URL;
  params: Record<string, string>;
  host: ApiHost;
}

type Handler = (c: Ctx) => Response | Promise<Response>;
interface Route {
  method: string;
  parts: string[];
  run: Handler;
}

const routes: Route[] = [];
const route = (method: string, pattern: string, run: Handler) => routes.push({ method, parts: pattern.split('/').filter(Boolean), run });

const json = (body: unknown, status = 200) => Response.json(body, { status });
const noContent = () => new Response(null, { status: 204 });

// --- request helpers -------------------------------------------------------------------

/** Which client made a change, so its own tab can ignore the change event. */
const origin = (c: Ctx) => c.req.headers.get('x-client-id') ?? 'api';
const q = (c: Ctx, key: string) => c.url.searchParams.get(key) ?? undefined;
/** ?set= picks a screenshot set (id or name); none means the primary set. */
const setOf = (c: Ctx) => q(c, 'set') || undefined;
/** ?lang= picks a translation language; none (or the base language) means the slides as written. */
function langOf(c: Ctx): string | null {
  const v = q(c, 'lang');
  if (!v) return null;
  try {
    return translationLanguage(store.getApp(c.params.app), v);
  } catch (e) {
    throw new store.HttpError(400, (e as Error).message);
  }
}
/** The app as one set and one language see it (read-only). */
const viewOf = (c: Ctx) => localize(store.getView(c.params.app, setOf(c)), langOf(c));

function parseDevice(v: unknown): DeviceId | undefined {
  if (v === undefined || v === null || v === '' || v === 'auto') return undefined;
  if (DEVICE_IDS.includes(v as DeviceId)) return v as DeviceId;
  throw new store.HttpError(400, `Unknown device "${v}". Use one of: ${DEVICE_IDS.join(', ')}`);
}

function jsonField<T>(v: unknown): T | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') return v as T;
  try {
    return JSON.parse(v) as T;
  } catch {
    throw new store.HttpError(400, `Expected JSON, got ${v.slice(0, 40)}`);
  }
}

async function body(c: Ctx): Promise<any> {
  const text = await c.req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new store.HttpError(400, 'The request body must be JSON');
  }
}

async function form(c: Ctx) {
  try {
    return await c.req.formData();
  } catch {
    throw new store.HttpError(400, 'Send the files as multipart/form-data');
  }
}

const MAX_FILE = 60 * 1024 * 1024;
async function files(f: FormData, field: string) {
  const list = f.getAll(field).filter((v): v is File => typeof v !== 'string');
  for (const file of list) if (file.size > MAX_FILE) throw new store.HttpError(413, `${file.name} is larger than 60 MB`);
  return Promise.all(list.map(async (file) => ({ buf: Buffer.from(await file.arrayBuffer()), name: file.name })));
}
const field = (f: FormData, key: string) => {
  const v = f.get(key);
  return typeof v === 'string' ? v : undefined;
};

// Apple-look emoji are cut out of the user's font by the renderer (server/emojiFont.ts), which
// writes their list next to them; read it here so a slide can't use one that doesn't exist.
let fontEmoji: { mtime: number; source: string; slugs: Set<string> } | null = null;
function fontEmojiIndex() {
  const file = path.join(store.DATA_DIR, 'emoji', 'font', 'index.json');
  try {
    const mtime = fs.statSync(file).mtimeMs;
    if (fontEmoji?.mtime !== mtime) {
      const index = JSON.parse(fs.readFileSync(file, 'utf8')) as { source: string; slugs: string[] };
      fontEmoji = { mtime, source: index.source, slugs: new Set(index.slugs) };
    }
    return fontEmoji;
  } catch {
    return null;
  }
}

// --- meta ------------------------------------------------------------------------------

route('GET', '/health', (c) => json({ ok: true, name: 'openappshot', url: c.host.publicBase(c.req), data: store.DATA_DIR }));
route('GET', '/meta', () => json({ presets: PRESETS, devices: DEVICES }));
route('GET', '/', () =>
  json({
    name: 'OpenConnect screenshot studio API',
    note: 'No Anthropic API calls, no credits. Slide, style, render, preview, export and creative routes take ?set=<id or name> for a screenshot set; without it they use the primary set. They also take ?lang=<code> for a translation language: reads show that language, headline/subtitle/screenshot writes go to its translation.',
    endpoints: {
      'GET /api/data': 'Every app as a clean record: style, devices, screenshot counts, per-slide data',
      'GET /api/apps/:app/data': 'One app as a clean record (:app = id, name or bundle id)',
      'GET /api/apps': 'App list (short)',
      'GET /api/apps/:app': 'Raw app document (theme, slides, assets)',
      'GET /api/lookup?path=': 'App linked to a source folder',
      'POST /api/apps': 'Create {name, preset, subtitle, devices, profile}',
      'PATCH /api/apps/:app': 'Deep-merge update {name, profile, theme, devices, sizes, exportSizes, preset}. theme holds every visual setting and applies to all slides',
      'POST /api/apps/:app/apply': 'Bulk spec update',
      'POST /api/apps/:app/icon': 'multipart file',
      'POST /api/apps/:app/screenshots': 'multipart files[] + device?, headlines? (JSON array), screens? (JSON array), source? (JSON)',
      'POST /api/apps/:app/slides': 'Add slide {headline, subtitle, screen, index?}',
      'PATCH /api/apps/:app/slides/:slide': 'Update slide content {headline, subtitle, screen} (:slide = id or 1-based position)',
      'DELETE /api/apps/:app/slides/:slide': 'Delete slide',
      'PUT /api/apps/:app/slides/:slide/shot': 'multipart file + device, source?',
      'PUT /api/apps/:app/order': '{order: [slideId]}',
      'GET /api/apps/:app/check': 'App Store guideline issues',
      'GET /api/apps/:app/slides/:slide/render/:device.png?scale=': 'PNG of one slide',
      'GET /api/apps/:app/creatives/:creative/render.png?scale=': 'PNG of the product page header or search results asset (:creative = header | search)',
      'POST /api/apps/:app/preview': 'Render previews to disk {device?, slides?, scale?}; each file is also served at its url',
      'POST /api/apps/:app/export': 'Export PNGs + zip into the data folder {devices?, sizes?, creatives?, languages?}; enabled creative assets are included unless creatives is given; every language unless languages (or ?lang=a,b) is given; zipUrl downloads the zip',
      'GET /api/emoji?q=&group=&limit=': 'Search the emoji stickers (slug, name, glyph, group, keywords, styles; styles has "apple" when an emoji font is installed)',
      'GET /api/apps/:app/sets': 'Screenshot sets: the primary set and any others (e.g. mockups being tested)',
      'POST /api/apps/:app/sets': 'New set {name?, from? (set to copy, default primary), blank?}',
      'PATCH /api/apps/:app/sets/:set': 'Rename {name}',
      'DELETE /api/apps/:app/sets/:set': 'Delete a set (not the primary)',
      'POST /api/apps/:app/sets/:set/primary': 'Make a set the primary one (swaps with the current primary)',
      'GET /api/apps/:app/translations?lang=': 'Base text and translation of every slide, creative and hero badge, per translation language, with what is missing',
      'PUT /api/apps/:app/translations/:lang': 'Set many translations at once {slides: [{slide, headline?, subtitle?}], creatives?: {header?: {headline?, subtitle?}}, hero?: {badgeTitle?, badgeCaption?}}',
      'GET /api/events': 'Server-sent change events',
    },
  }),
);
route('GET', '/data', (c) => json(store.listApps().map((a) => buildAppData(store.getApp(a.id), c.host.publicBase(c.req)))));
route('GET', '/apps/:app/data', (c) => json(buildAppData(viewOf(c), c.host.publicBase(c.req))));

// --- live updates ----------------------------------------------------------------------

route('GET', '/events', (c) => {
  const enc = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      const write = (s: string) => {
        try {
          ctrl.enqueue(enc.encode(s));
        } catch {
          stop();
        }
      };
      const send = (e: unknown) => write(`data: ${JSON.stringify(e)}\n\n`);
      const ping = setInterval(() => write(': ping\n\n'), 25_000);
      store.events.on('change', send);
      stop = () => {
        clearInterval(ping);
        store.events.off('change', send);
      };
      c.req.signal.addEventListener('abort', () => {
        stop();
        try {
          ctrl.close();
        } catch {
          // already closed
        }
      });
      write(': connected\n\n');
    },
    cancel() {
      stop();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
});

// --- apps ------------------------------------------------------------------------------

/** Which app belongs to a source folder (matched against profile.projectPath). */
route('GET', '/lookup', (c) => {
  const dir = q(c, 'path') ?? '';
  const found = store.findAppForPath(dir);
  if (!found) throw new store.HttpError(404, `No app is linked to ${dir}. Set its project path.`);
  return json(found);
});
route('GET', '/apps', () => json(store.listApps()));
route('POST', '/apps', async (c) => json(store.createApp(await body(c), origin(c)), 201));
route('GET', '/apps/:app', (c) => json(viewOf(c)));
route('PATCH', '/apps/:app', async (c) => {
  const lang = langOf(c);
  return json(localize(store.updateApp(c.params.app, localizeAppPatch(await body(c), lang), origin(c), setOf(c)), lang));
});
route('DELETE', '/apps/:app', (c) => {
  store.deleteApp(c.params.app, origin(c));
  return noContent();
});
/** App Store guideline checks for every device and slide. */
route('GET', '/apps/:app/check', (c) => {
  const lang = langOf(c);
  const a = viewOf(c);
  return json({
    devices: Object.fromEntries(a.devices.map((d) => [d, checkDevice(a, d)])),
    slides: Object.fromEntries(a.slides.map((s) => [s.id, [...checkSlide(s), ...checkTranslation(s, lang)]])),
  });
});
route('POST', '/apps/:app/apply', async (c) => json(store.applySpec(c.params.app, await body(c), origin(c), setOf(c))));
route('PUT', '/apps/:app/order', async (c) => json(store.reorderSlides(c.params.app, (await body(c)).order ?? [], origin(c), setOf(c))));

route('POST', '/apps/:app/icon', async (c) => {
  const [f] = await files(await form(c), 'file');
  if (!f) throw new store.HttpError(400, 'Attach the icon as multipart field "file"');
  return json(store.setIcon(c.params.app, f.buf, f.name, origin(c)));
});
route('POST', '/apps/:app/assets', async (c) => {
  const kind = (q(c, 'kind') as 'screenshot' | 'icon' | 'background' | undefined) ?? 'screenshot';
  return json(store.uploadAssets(c.params.app, await files(await form(c), 'files'), kind, origin(c)), 201);
});

const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic', '.svg': 'image/svg+xml' };
route('GET', '/apps/:app/assets/:asset', (c) => {
  const file = store.assetPath(store.getApp(c.params.app), c.params.asset);
  let data: Buffer;
  try {
    data = fs.readFileSync(file);
  } catch {
    throw new store.HttpError(404, `Asset ${c.params.asset} has no file`);
  }
  // Asset ids are content-unique, so cache hard (only successful responses).
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': IMAGE_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      // SVG uploads must never run as a page.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

/** Bulk screenshot drop: fills slides missing that device's screenshot, creating new ones as needed. */
route('POST', '/apps/:app/screenshots', async (c) => {
  const f = await form(c);
  const result = store.ingestScreenshots(
    c.params.app,
    await files(f, 'files'),
    {
      device: parseDevice(field(f, 'device') ?? q(c, 'device')),
      fallbackDevice: parseDevice(field(f, 'fallbackDevice')),
      headlines: jsonField<string[]>(field(f, 'headlines')),
      screens: jsonField<string[]>(field(f, 'screens')),
      source: jsonField<AssetSource>(field(f, 'source')),
    },
    origin(c),
    setOf(c),
    langOf(c),
  );
  return json(result, 201);
});

// --- translations ----------------------------------------------------------------------

route('GET', '/apps/:app/translations', (c) => {
  const a = store.getView(c.params.app, setOf(c));
  const only = langOf(c);
  return json(translationReport(a, only ? [only] : a.languages));
});
route('PUT', '/apps/:app/translations/:lang', async (c) => {
  const a = store.getApp(c.params.app);
  let lang: string | null;
  try {
    lang = translationLanguage(a, c.params.lang);
  } catch (e) {
    throw new store.HttpError(400, (e as Error).message);
  }
  if (!lang) throw new store.HttpError(400, `${a.baseLanguage} is the base language; edit the slides themselves`);
  store.setTranslations(a.id, lang, await body(c), origin(c), setOf(c));
  return json(translationReport(store.getView(a.id, setOf(c)), [lang]));
});

// --- screenshot sets -------------------------------------------------------------------

route('GET', '/apps/:app/sets', (c) => json(store.listSets(c.params.app)));
route('POST', '/apps/:app/sets', async (c) => json(store.createSet(c.params.app, await body(c), origin(c)), 201));
route('PATCH', '/apps/:app/sets/:set', async (c) => {
  const name = (await body(c)).name;
  if (typeof name !== 'string') throw new store.HttpError(400, 'Pass {name}');
  return json(store.renameSet(c.params.app, c.params.set, name, origin(c)));
});
route('DELETE', '/apps/:app/sets/:set', (c) => json(store.deleteSet(c.params.app, c.params.set, origin(c))));
route('POST', '/apps/:app/sets/:set/primary', (c) => json(store.makePrimary(c.params.app, c.params.set, origin(c))));

// --- slides ----------------------------------------------------------------------------

route('POST', '/apps/:app/slides', async (c) => {
  const { index, ...slide } = await body(c);
  return json(store.addSlide(c.params.app, slide, index, origin(c), setOf(c)), 201);
});
route('PATCH', '/apps/:app/slides/:slide', async (c) => {
  const patch = await body(c);
  const stickers = patch.stickers;
  const font = fontEmojiIndex();
  const missing = Array.isArray(stickers)
    ? stickers.find((s: { kind?: string; style?: string; ref?: string }) => s?.kind === 'emoji' && s.style === 'apple' && !font?.slugs.has(String(s.ref)))
    : null;
  if (missing) {
    throw new store.HttpError(
      400,
      font
        ? `${font.source} has no emoji for "${missing.ref}"; use style 3d, color or flat`
        : 'The apple style needs Apple Color Emoji: copy "Apple Color Emoji.ttc" from a Mac (/System/Library/Fonts) into the fonts folder of the studio data directory and restart',
    );
  }
  const lang = langOf(c);
  const slide = store.updateSlide(c.params.app, c.params.slide, localizeSlidePatch(patch, lang), origin(c), setOf(c));
  return json(lang ? localize(store.getView(c.params.app, setOf(c)), lang).slides.find((s) => s.id === slide.id) : slide);
});
route('DELETE', '/apps/:app/slides/:slide', (c) => {
  store.deleteSlide(c.params.app, c.params.slide, origin(c), setOf(c));
  return noContent();
});
route('PUT', '/apps/:app/slides/:slide/shot', async (c) => {
  const f = await form(c);
  const [file] = await files(f, 'file');
  if (!file) throw new store.HttpError(400, 'Attach the screenshot as multipart field "file"');
  const device = parseDevice(field(f, 'device') ?? q(c, 'device'));
  if (!device) throw new store.HttpError(400, 'Pass device=iphone|ipad|mac');
  return json(
    store.setSlideShot(c.params.app, c.params.slide, device, file.buf, file.name, origin(c), jsonField<AssetSource>(field(f, 'source')), setOf(c), langOf(c)),
  );
});

// --- dispatch --------------------------------------------------------------------------

function match(method: string, apiPath: string) {
  const parts = apiPath.split('/').filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  for (const r of routes) {
    if (r.method !== method || r.parts.length !== parts.length) continue;
    const params: Record<string, string> = {};
    if (r.parts.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = parts[i]), true) : p === parts[i]))) return { route: r, params };
  }
  return null;
}

/**
 * Answer a request for `apiPath` (the part after /api, e.g. "/apps/abc/slides"), or null when this
 * isn't one of the data routes (rendering, export, emoji: the host passes those on).
 */
export async function handle(req: Request, apiPath: string, host: ApiHost): Promise<Response | null> {
  const m = match(req.method === 'HEAD' ? 'GET' : req.method, apiPath);
  if (!m) return null;
  try {
    return await m.route.run({ req, url: new URL(req.url), params: m.params, host });
  } catch (err) {
    const status = err instanceof store.HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    return json({ error: err instanceof Error ? err.message : String(err) }, status);
  }
}
