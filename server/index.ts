import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import type { DeviceId } from '../src/shared/types.ts';
import { DEVICE_IDS } from '../src/shared/types.ts';
import { PRESETS } from '../src/shared/presets.ts';
import { DEVICES } from '../src/shared/devices.ts';
import { checkDevice, checkSlide } from '../src/shared/guidelines.ts';
import { buildAppData } from '../src/shared/summary.ts';
import type { AssetSource } from '../src/shared/types.ts';
import * as store from './store.ts';
import { exportApp, renderCreative, renderSlides } from './renderer.ts';
import { CREATIVE_IDS, type CreativeId } from '../src/shared/types.ts';

const PORT = Number(process.env.PORT ?? 4317);
const HOST = process.env.HOST ?? '127.0.0.1';
const BASE_URL = `http://127.0.0.1:${PORT}`;
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '20mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });

type Handler = (req: Request, res: Response) => unknown;
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res)).catch(next);
};
const origin = (req: Request) => req.header('x-client-id') ?? 'api';
const p = (req: Request, key: string) => String(req.params[key]);
/** ?set= picks a screenshot set (id or name); none means the primary set. */
const setOf = (req: Request) => (typeof req.query.set === 'string' && req.query.set ? req.query.set : undefined);

function parseDevice(v: unknown): DeviceId | undefined {
  if (v === undefined || v === '' || v === 'auto') return undefined;
  if (DEVICE_IDS.includes(v as DeviceId)) return v as DeviceId;
  throw new store.HttpError(400, `Unknown device "${v}". Use one of: ${DEVICE_IDS.join(', ')}`);
}

function jsonField<T>(v: unknown): T | undefined {
  if (v === undefined || v === '') return undefined;
  if (typeof v !== 'string') return v as T;
  try {
    return JSON.parse(v) as T;
  } catch {
    throw new store.HttpError(400, `Expected JSON, got ${v.slice(0, 40)}`);
  }
}

function files(req: Request) {
  const list = (Array.isArray(req.files) ? req.files : req.file ? [req.file] : []) as Express.Multer.File[];
  return list.map((f) => ({ buf: f.buffer, name: f.originalname }));
}

// ---------- meta ----------
app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'openappshot', url: BASE_URL, data: store.DATA_DIR }));
app.get('/api/meta', (_req, res) => res.json({ presets: PRESETS, devices: DEVICES }));

app.get('/api', (_req, res) =>
  res.json({
    name: 'OpenAppShot local API',
    note: 'No Anthropic API calls, no credits. Slide, style, render, preview, export and creative routes take ?set=<id or name> for a screenshot set; without it they use the primary set.',
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
      'POST /api/apps/:app/export': 'Export PNGs + zip {devices?, sizes?, outDir?, creatives?}; enabled creative assets are included unless creatives is given; zipUrl downloads the zip',
      'GET /api/emoji?q=&group=&limit=': 'Search the bundled Fluent Emoji stickers (slug, name, glyph, group, keywords)',
      'GET /api/apps/:app/sets': 'Screenshot sets: the primary set and any others (e.g. mockups being tested)',
      'POST /api/apps/:app/sets': 'New set {name?, from? (set to copy, default primary), blank?}',
      'PATCH /api/apps/:app/sets/:set': 'Rename {name}',
      'DELETE /api/apps/:app/sets/:set': 'Delete a set (not the primary)',
      'POST /api/apps/:app/sets/:set/primary': 'Make a set the primary one (swaps with the current primary)',
      'GET /api/events': 'Server-sent change events',
    },
  }),
);
app.get('/api/data', (_req, res) => res.json(store.listApps().map((a) => buildAppData(store.getApp(a.id), BASE_URL))));
app.get(
  '/api/apps/:app/data',
  h((req, res) => res.json(buildAppData(store.getView(p(req, 'app'), setOf(req)), BASE_URL))),
);

// ---------- live updates ----------
app.get('/api/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(': connected\n\n');
  const send = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  store.events.on('change', send);
  req.on('close', () => {
    clearInterval(ping);
    store.events.off('change', send);
  });
});

// ---------- apps ----------
/** Which app belongs to a source folder (matched against profile.projectPath). */
app.get(
  '/api/lookup',
  h((req, res) => {
    const found = store.findAppForPath(String(req.query.path ?? ''));
    if (!found) throw new store.HttpError(404, `No app is linked to ${req.query.path}. Set its project path.`);
    res.json(found);
  }),
);
app.get('/api/apps', (_req, res) => res.json(store.listApps()));
app.post('/api/apps', h((req, res) => res.status(201).json(store.createApp(req.body ?? {}, origin(req)))));
app.get('/api/apps/:app', h((req, res) => res.json(store.getView(p(req, 'app'), setOf(req)))));
app.patch('/api/apps/:app', h((req, res) => res.json(store.updateApp(p(req, 'app'), req.body ?? {}, origin(req), setOf(req)))));
app.delete(
  '/api/apps/:app',
  h((req, res) => {
    store.deleteApp(p(req, 'app'), origin(req));
    res.status(204).end();
  }),
);
/** App Store guideline checks for every device and slide. */
app.get(
  '/api/apps/:app/check',
  h((req, res) => {
    const a = store.getView(p(req, 'app'), setOf(req));
    res.json({
      devices: Object.fromEntries(a.devices.map((d) => [d, checkDevice(a, d)])),
      slides: Object.fromEntries(a.slides.map((s) => [s.id, checkSlide(s)])),
    });
  }),
);
app.post(
  '/api/apps/:app/apply',
  h((req, res) => res.json(store.applySpec(p(req, 'app'), req.body ?? {}, origin(req), setOf(req)))),
);
app.put(
  '/api/apps/:app/order',
  h((req, res) => res.json(store.reorderSlides(p(req, 'app'), req.body?.order ?? [], origin(req), setOf(req)))),
);

app.post(
  '/api/apps/:app/icon',
  upload.single('file'),
  h((req, res) => {
    const [f] = files(req);
    if (!f) throw new store.HttpError(400, 'Attach the icon as multipart field "file"');
    res.json(store.setIcon(p(req, 'app'), f.buf, f.name, origin(req)));
  }),
);

app.post(
  '/api/apps/:app/assets',
  upload.array('files'),
  h((req, res) => {
    const kind = (req.query.kind as 'screenshot' | 'icon' | 'background') ?? 'screenshot';
    res.status(201).json(store.uploadAssets(p(req, 'app'), files(req), kind, origin(req)));
  }),
);

app.get(
  '/api/apps/:app/assets/:asset',
  h((req, res) => {
    const a = store.getApp(p(req, 'app'));
    // Asset ids are content-unique, so cache hard — but only successful responses (options, not res.setHeader).
    // dotfiles: data lives in ~/.openappshot.
    res.sendFile(store.assetPath(a, p(req, 'asset')), { dotfiles: 'allow', maxAge: '1y', immutable: true });
  }),
);

/** Bulk screenshot drop: fills slides missing that device's screenshot, creating new ones as needed. */
app.post(
  '/api/apps/:app/screenshots',
  upload.array('files'),
  h((req, res) => {
    const result = store.ingestScreenshots(
      p(req, 'app'),
      files(req),
      {
        device: parseDevice(req.body?.device ?? req.query.device),
        fallbackDevice: parseDevice(req.body?.fallbackDevice),
        headlines: jsonField<string[]>(req.body?.headlines),
        screens: jsonField<string[]>(req.body?.screens),
        source: jsonField<AssetSource>(req.body?.source),
      },
      origin(req),
      setOf(req),
    );
    res.status(201).json(result);
  }),
);

// ---------- stickers: bundled Fluent Emoji (MIT) and doodles ----------
// `npm run setup:emoji` downloads the emoji into vendor/fluent-emoji; everything is served locally.
const EMOJI_DIR = path.resolve('vendor', 'fluent-emoji');
type EmojiEntry = { slug: string; name: string; glyph: string; group: string; keywords: string[]; styles: string[] };
let emojiIndex: EmojiEntry[] | null = null;
const emoji = (): EmojiEntry[] => {
  if (emojiIndex) return emojiIndex;
  try {
    emojiIndex = JSON.parse(fs.readFileSync(path.join(EMOJI_DIR, 'index.json'), 'utf8')) as EmojiEntry[];
  } catch {
    return [];
  }
  return emojiIndex;
};
app.use('/vendor/emoji', express.static(EMOJI_DIR, { maxAge: '30d', immutable: true, fallthrough: false }));
app.get('/api/emoji', (req, res) => {
  const list = emoji();
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const group = String(req.query.group ?? '');
  const limit = Math.min(2000, Math.max(1, Number(req.query.limit ?? 2000)));
  const words = q.split(/\s+/).filter(Boolean);
  const hits = list
    .filter((e) => !group || e.group === group)
    .filter((e) => {
      if (!words.length) return true;
      const hay = `${e.name} ${e.keywords.join(' ')} ${e.glyph}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    // Name matches first.
    .sort((a, b) => Number(!a.name.toLowerCase().includes(q)) - Number(!b.name.toLowerCase().includes(q)));
  res.json({
    available: list.length > 0,
    groups: [...new Set(list.map((e) => e.group))],
    total: hits.length,
    emoji: hits.slice(0, limit),
  });
});

// ---------- screenshot sets ----------
app.get('/api/apps/:app/sets', h((req, res) => res.json(store.listSets(p(req, 'app')))));
app.post(
  '/api/apps/:app/sets',
  h((req, res) => res.status(201).json(store.createSet(p(req, 'app'), req.body ?? {}, origin(req)))),
);
app.patch(
  '/api/apps/:app/sets/:set',
  h((req, res) => {
    const name = req.body?.name;
    if (typeof name !== 'string') throw new store.HttpError(400, 'Pass {name}');
    res.json(store.renameSet(p(req, 'app'), p(req, 'set'), name, origin(req)));
  }),
);
app.delete('/api/apps/:app/sets/:set', h((req, res) => res.json(store.deleteSet(p(req, 'app'), p(req, 'set'), origin(req)))));
app.post(
  '/api/apps/:app/sets/:set/primary',
  h((req, res) => res.json(store.makePrimary(p(req, 'app'), p(req, 'set'), origin(req)))),
);

// ---------- slides ----------
app.post(
  '/api/apps/:app/slides',
  h((req, res) => {
    const { index, ...slide } = req.body ?? {};
    res.status(201).json(store.addSlide(p(req, 'app'), slide, index, origin(req), setOf(req)));
  }),
);
app.patch(
  '/api/apps/:app/slides/:slide',
  h((req, res) => res.json(store.updateSlide(p(req, 'app'), p(req, 'slide'), req.body ?? {}, origin(req), setOf(req)))),
);
app.delete(
  '/api/apps/:app/slides/:slide',
  h((req, res) => {
    store.deleteSlide(p(req, 'app'), p(req, 'slide'), origin(req), setOf(req));
    res.status(204).end();
  }),
);
app.put(
  '/api/apps/:app/slides/:slide/shot',
  upload.single('file'),
  h((req, res) => {
    const [f] = files(req);
    if (!f) throw new store.HttpError(400, 'Attach the screenshot as multipart field "file"');
    const device = parseDevice(req.body?.device ?? req.query.device);
    if (!device) throw new store.HttpError(400, 'Pass device=iphone|ipad|mac');
    res.json(
      store.setSlideShot(p(req, 'app'), p(req, 'slide'), device, f.buf, f.name, origin(req), jsonField<AssetSource>(req.body?.source), setOf(req)),
    );
  }),
);
// ---------- rendering ----------
app.get(
  '/api/apps/:app/slides/:slide/render/:file',
  h(async (req, res) => {
    const a = store.getView(p(req, 'app'), setOf(req));
    const slide = store.findSlide(a, p(req, 'slide'));
    const device = parseDevice(p(req, 'file').replace(/\.png$/, ''))!;
    const scale = Math.min(1, Math.max(0.1, Number(req.query.scale ?? 1)));
    const [r] = await renderSlides(BASE_URL, a, device, { slideIds: [slide.id], includeIncomplete: true, scale });
    if (!r) throw new store.HttpError(404, 'Slide is excluded from this device');
    res.type('png').send(r.png);
  }),
);

app.get(
  '/api/apps/:app/creatives/:creative/render.png',
  h(async (req, res) => {
    const a = store.getView(p(req, 'app'), setOf(req));
    const id = p(req, 'creative') as CreativeId;
    if (!CREATIVE_IDS.includes(id)) throw new store.HttpError(400, `Unknown creative "${id}". Use header or search`);
    const scale = Math.min(1, Math.max(0.1, Number(req.query.scale ?? 1)));
    const { png } = await renderCreative(BASE_URL, a, id, { scale });
    res.type('png').send(png);
  }),
);

/** Render previews to disk so a caller (e.g. Claude) can look at them. */
app.post(
  '/api/apps/:app/preview',
  h(async (req, res) => {
    const a = store.getView(p(req, 'app'), setOf(req));
    const devices: DeviceId[] = req.body?.device ? [parseDevice(req.body.device)!] : a.devices;
    const folder = a.activeSet ? `${a.id}-${a.activeSet}` : a.id;
    const dir = path.join(store.DATA_DIR, 'previews', folder);
    fs.rmSync(dir, { recursive: true, force: true });
    const out: { device: DeviceId; slideId: string; path: string; url: string }[] = [];
    for (const d of devices) {
      const rendered = await renderSlides(BASE_URL, a, d, {
        includeIncomplete: true,
        slideIds: req.body?.slides,
        scale: req.body?.scale ? Math.min(1, Math.max(0.1, Number(req.body.scale))) : 1,
      });
      fs.mkdirSync(path.join(dir, d), { recursive: true });
      for (const r of rendered) {
        // Name previews by their real slide position so "slide 3" is easy to find.
        const file = path.join(dir, d, `${String(r.index + 1).padStart(2, '0')}${r.filename.slice(2)}`);
        fs.writeFileSync(file, r.png);
        out.push({ device: d, slideId: r.slideId, path: file, url: `/previews/${folder}/${d}/${path.basename(file)}` });
      }
    }
    res.json({ dir, files: out });
  }),
);

app.post(
  '/api/apps/:app/export',
  h(async (req, res) => {
    const a = store.getView(p(req, 'app'), setOf(req));
    const result = await exportApp(BASE_URL, a, {
      devices: (req.body?.devices as string[] | undefined)?.map((d) => parseDevice(d)!),
      sizes: req.body?.sizes,
      outDir: req.body?.outDir,
      creatives: req.body?.creatives,
    });
    const zipUrl = result.zip.startsWith(path.join(store.DATA_DIR, 'exports'))
      ? `/exports/${path.basename(result.zip)}`
      : null;
    res.json({ ...result, zipUrl });
  }),
);
app.use('/exports', express.static(path.join(store.DATA_DIR, 'exports'), { dotfiles: 'allow' }));
// Lets a CLI on another machine (server in Docker) download what preview rendered.
app.use('/previews', express.static(path.join(store.DATA_DIR, 'previews'), { dotfiles: 'allow' }));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ---------- frontend ----------
if (isProd) {
  const dist = path.resolve('dist');
  app.use(express.static(dist));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true, hmr: { port: PORT + 1 } }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof store.HttpError ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: (err as Error).message ?? String(err) });
});

app.listen(PORT, HOST, () => {
  console.log(`\n  OpenAppShot running at ${BASE_URL}\n`);
});
