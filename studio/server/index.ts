import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { DeviceId } from '../src/shared/types.ts';
import { DEVICE_IDS } from '../src/shared/types.ts';
import * as store from './store.ts';
import * as api from './api.ts';
import { exportApp, renderCreative, renderSlides } from './renderer.ts';
import { extractEmojiFont, findEmojiFont } from './emojiFont.ts';
import { localize, translationLanguage } from '../src/shared/locales.ts';
import { CREATIVE_IDS, type CreativeId } from '../src/shared/types.ts';

const PORT = Number(process.env.PORT ?? 4317);
const HOST = process.env.HOST ?? '127.0.0.1';
// Served under a path prefix when it sits behind OpenConnect (BASE_PATH=/studio). Every route,
// the editor and the render pages live under it; API paths in responses stay relative to it.
const BASE_PATH = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');
/** This server as the renderer's browser reaches it. */
const BASE_URL = `http://127.0.0.1:${PORT}${BASE_PATH}`;
const isProd = process.env.NODE_ENV === 'production';

/** This server as the client sees it (through OpenConnect's proxy when there is one), for links. */
const publicBaseOf = (host: string | null, proto: string) => (host ? `${proto}://${host}${BASE_PATH}` : BASE_URL);

const server = express();
const app = express.Router();

type Handler = (req: Request, res: Response) => unknown;
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res)).catch(next);
};
const origin = (req: Request) => req.header('x-client-id') ?? 'api';
const p = (req: Request, key: string) => String(req.params[key]);
/** ?set= picks a screenshot set (id or name); none means the primary set. */
const setOf = (req: Request) => (typeof req.query.set === 'string' && req.query.set ? req.query.set : undefined);
/** ?lang= picks a translation language; none (or the base language) means the slides as written. */
const langOf = (req: Request): string | null => {
  const v = typeof req.query.lang === 'string' ? req.query.lang : '';
  if (!v) return null;
  try {
    return translationLanguage(store.getApp(p(req, 'app')), v);
  } catch (e) {
    throw new store.HttpError(400, (e as Error).message);
  }
};
/** The app as one set and one language see it (read-only). */
const viewOf = (req: Request) => localize(store.getView(p(req, 'app'), setOf(req)), langOf(req));

/** `root/name`, refusing any name that would land outside `root`. */
function inside(root: string, name: string) {
  const base = path.resolve(root);
  const full = path.resolve(base, name);
  if (!full.startsWith(base + path.sep)) throw new store.HttpError(400, 'Invalid folder name');
  return full;
}

function parseDevice(v: unknown): DeviceId | undefined {
  if (v === undefined || v === '' || v === 'auto') return undefined;
  if (DEVICE_IDS.includes(v as DeviceId)) return v as DeviceId;
  throw new store.HttpError(400, `Unknown device "${v}". Use one of: ${DEVICE_IDS.join(', ')}`);
}

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

// The 'apple' look: emoji cut out of a font the user drops into <data>/fonts (Apple Color Emoji from a Mac;
// it can't be bundled). Done once per font file, then served like the Fluent ones.
const FONT_EMOJI_DIR = path.join(store.DATA_DIR, 'emoji', 'font');
let fontEmoji: { source: string; slugs: Set<string> } | null = null;
let fontEmojiError = '';
const loadFontEmoji = () => {
  const font = findEmojiFont(store.DATA_DIR);
  fontEmoji = null;
  fontEmojiError = '';
  if (!font || !emoji().length) return;
  try {
    const r = extractEmojiFont(font, emoji(), FONT_EMOJI_DIR);
    fontEmoji = { source: r.source, slugs: new Set(r.slugs) };
    console.log(`Emoji font: ${r.slugs.length} emoji from ${r.source}`);
  } catch (e) {
    fontEmojiError = e instanceof Error ? e.message : String(e);
    console.warn(`Emoji font: ${fontEmojiError}`);
  }
};
app.use('/emoji-font', express.static(FONT_EMOJI_DIR, { maxAge: '1h', fallthrough: false }));
loadFontEmoji();
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
  const withFont = (e: EmojiEntry) => (fontEmoji?.slugs.has(e.slug) ? { ...e, styles: [...e.styles, 'apple'] } : e);
  res.json({
    available: list.length > 0,
    groups: [...new Set(list.map((e) => e.group))],
    // the 'apple' look, when an emoji font is installed in <data>/fonts
    font: fontEmoji ? { source: fontEmoji.source, count: fontEmoji.slugs.size } : null,
    fontError: fontEmojiError || undefined,
    total: hits.length,
    emoji: hits.slice(0, limit).map(withFont),
  });
});

// ---------- rendering (needs Chromium: only here, never in the dashboard) ----------
app.get(
  '/api/apps/:app/slides/:slide/render/:file',
  h(async (req, res) => {
    const a = viewOf(req);
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
    const a = viewOf(req);
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
  express.json({ limit: '1mb' }),
  h(async (req, res) => {
    const a = viewOf(req);
    const devices: DeviceId[] = req.body?.device ? [parseDevice(req.body.device)!] : a.devices;
    const folder = [a.id, a.activeSet, a.activeLang].filter(Boolean).map((v) => String(v).replace(/[^\w-]/g, '_')).join('-');
    const dir = inside(path.join(store.DATA_DIR, 'previews'), folder);
    fs.rmSync(dir, { recursive: true, force: true });
    const out: { device: DeviceId; slideId: string; path: string; url: string }[] = [];
    for (const d of devices) {
      const rendered = await renderSlides(BASE_URL, a, d, {
        includeIncomplete: true,
        slideIds: req.body?.slides,
        scale: req.body?.scale ? Math.min(1, Math.max(0.1, Number(req.body.scale))) : 1,
      });
      const ddir = inside(dir, d);
      fs.mkdirSync(ddir, { recursive: true });
      for (const r of rendered) {
        // Name previews by their real slide position so "slide 3" is easy to find.
        const file = inside(ddir, `${String(r.index + 1).padStart(2, '0')}${r.filename.slice(2)}`);
        fs.writeFileSync(file, r.png);
        out.push({ device: d, slideId: r.slideId, path: file, url: `/previews/${folder}/${d}/${path.basename(file)}` });
      }
    }
    res.json({ dir, files: out });
  }),
);

app.post(
  '/api/apps/:app/export',
  express.json({ limit: '1mb' }),
  h(async (req, res) => {
    const a = store.getView(p(req, 'app'), setOf(req));
    // ?lang=de-DE,ja or {languages}; default every language.
    const asked = (req.body?.languages as string[] | undefined) ?? (typeof req.query.lang === 'string' && req.query.lang ? req.query.lang.split(',') : undefined);
    let languages: string[] | undefined;
    try {
      languages = asked?.map((c) => translationLanguage(a, c) ?? a.baseLanguage);
    } catch (e) {
      throw new store.HttpError(400, (e as Error).message);
    }
    const result = await exportApp(BASE_URL, a, {
      devices: (req.body?.devices as string[] | undefined)?.map((d) => parseDevice(d)!),
      sizes: req.body?.sizes,
      creatives: req.body?.creatives,
      languages,
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

// ---------- data API (server/api.ts, shared with OpenConnect's Next.js route) ----------
const apiHost: api.ApiHost = { publicBase: (req) => publicBaseOf(req.headers.get('x-forwarded-host') ?? req.headers.get('host'), req.headers.get('x-forwarded-proto') ?? 'http') };
app.use('/api', async (req, res, next) => {
  try {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    // Closing the tab ends live-update streams.
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.originalUrl}`, {
      method: req.method,
      headers,
      body: hasBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : undefined,
      signal: abort.signal,
      // @ts-expect-error Node needs this to stream a request body.
      duplex: 'half',
    });
    const response = await api.handle(request, req.path, apiHost);
    if (!response) return next();
    res.status(response.status);
    response.headers.forEach((v, k) => res.setHeader(k, v));
    if (!response.body) return res.end();
    res.flushHeaders();
    Readable.fromWeb(response.body as import('node:stream/web').ReadableStream).pipe(res);
  } catch (err) {
    next(err);
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ---------- frontend ----------
if (isProd) {
  const dist = path.resolve('dist');
  // No "/studio" → "/studio/" redirect: Next.js (in front, at /studio) strips trailing slashes.
  app.use(express.static(dist, { redirect: false }));
  // Every other path is the editor (client-side routes); read once, not per request.
  const indexHtml = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  app.get('/{*splat}', (_req, res) => res.type('html').send(indexHtml));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Static files report a missing file as an error with status 404; keep client errors as they are.
  const own = (err as { status?: unknown })?.status;
  const status = err instanceof store.HttpError ? err.status : typeof own === 'number' && own >= 400 && own < 500 ? own : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: (err as Error).message ?? String(err) });
});

server.use(BASE_PATH || '/', app);
if (BASE_PATH) server.get('/', (_req, res) => res.redirect(`${BASE_PATH}/`));
if (!isProd) {
  // After the API, like the built files. Vite handles its own base, so it gets the full URL.
  const { createServer } = await import('vite');
  const vite = await createServer({ base: `${BASE_PATH}/`, server: { middlewareMode: true, hmr: { port: PORT + 1 } }, appType: 'spa' });
  server.use(vite.middlewares);
}

server.listen(PORT, HOST, () => {
  console.log(`\n  OpenAppShot running at ${BASE_URL}\n`);
});
