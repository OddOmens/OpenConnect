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
import { exportApp, renderSlides } from './renderer.ts';

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
    note: 'Runs on this Mac only. No Anthropic API calls, no credits.',
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
      'POST /api/apps/:app/preview': 'Render previews to disk {device?, slides?, scale?}',
      'POST /api/apps/:app/export': 'Export PNGs + zip {devices?, sizes?, outDir?}',
      'GET /api/events': 'Server-sent change events',
    },
  }),
);
app.get('/api/data', (_req, res) => res.json(store.listApps().map((a) => buildAppData(store.getApp(a.id), BASE_URL))));
app.get(
  '/api/apps/:app/data',
  h((req, res) => res.json(buildAppData(store.getApp(p(req, 'app')), BASE_URL))),
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
app.get('/api/apps/:app', h((req, res) => res.json(store.getApp(p(req, 'app')))));
app.patch('/api/apps/:app', h((req, res) => res.json(store.updateApp(p(req, 'app'), req.body ?? {}, origin(req)))));
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
    const a = store.getApp(p(req, 'app'));
    res.json({
      devices: Object.fromEntries(a.devices.map((d) => [d, checkDevice(a, d)])),
      slides: Object.fromEntries(a.slides.map((s) => [s.id, checkSlide(s)])),
    });
  }),
);
app.post(
  '/api/apps/:app/apply',
  h((req, res) => res.json(store.applySpec(p(req, 'app'), req.body ?? {}, origin(req)))),
);
app.put(
  '/api/apps/:app/order',
  h((req, res) => res.json(store.reorderSlides(p(req, 'app'), req.body?.order ?? [], origin(req)))),
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
    );
    res.status(201).json(result);
  }),
);

// ---------- slides ----------
app.post(
  '/api/apps/:app/slides',
  h((req, res) => {
    const { index, ...slide } = req.body ?? {};
    res.status(201).json(store.addSlide(p(req, 'app'), slide, index, origin(req)));
  }),
);
app.patch(
  '/api/apps/:app/slides/:slide',
  h((req, res) => res.json(store.updateSlide(p(req, 'app'), p(req, 'slide'), req.body ?? {}, origin(req)))),
);
app.delete(
  '/api/apps/:app/slides/:slide',
  h((req, res) => {
    store.deleteSlide(p(req, 'app'), p(req, 'slide'), origin(req));
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
      store.setSlideShot(p(req, 'app'), p(req, 'slide'), device, f.buf, f.name, origin(req), jsonField<AssetSource>(req.body?.source)),
    );
  }),
);
// ---------- rendering ----------
app.get(
  '/api/apps/:app/slides/:slide/render/:file',
  h(async (req, res) => {
    const a = store.getApp(p(req, 'app'));
    const slide = store.findSlide(a, p(req, 'slide'));
    const device = parseDevice(p(req, 'file').replace(/\.png$/, ''))!;
    const scale = Math.min(1, Math.max(0.1, Number(req.query.scale ?? 1)));
    const [r] = await renderSlides(BASE_URL, a, device, { slideIds: [slide.id], includeIncomplete: true, scale });
    if (!r) throw new store.HttpError(404, 'Slide is excluded from this device');
    res.type('png').send(r.png);
  }),
);

/** Render previews to disk so a caller (e.g. Claude) can look at them. */
app.post(
  '/api/apps/:app/preview',
  h(async (req, res) => {
    const a = store.getApp(p(req, 'app'));
    const devices: DeviceId[] = req.body?.device ? [parseDevice(req.body.device)!] : a.devices;
    const dir = path.join(store.DATA_DIR, 'previews', a.id);
    fs.rmSync(dir, { recursive: true, force: true });
    const out: { device: DeviceId; slideId: string; path: string }[] = [];
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
        out.push({ device: d, slideId: r.slideId, path: file });
      }
    }
    res.json({ dir, files: out });
  }),
);

app.post(
  '/api/apps/:app/export',
  h(async (req, res) => {
    const a = store.getApp(p(req, 'app'));
    const result = await exportApp(BASE_URL, a, {
      devices: (req.body?.devices as string[] | undefined)?.map((d) => parseDevice(d)!),
      sizes: req.body?.sizes,
      outDir: req.body?.outDir,
    });
    const zipUrl = result.zip.startsWith(path.join(store.DATA_DIR, 'exports'))
      ? `/exports/${path.basename(result.zip)}`
      : null;
    res.json({ ...result, zipUrl });
  }),
);
app.use('/exports', express.static(path.join(store.DATA_DIR, 'exports'), { dotfiles: 'allow' }));

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
