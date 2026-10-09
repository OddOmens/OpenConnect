import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { customAlphabet } from 'nanoid';
import { imageSize } from 'image-size';
import type { App, AppSummary, Asset, AssetSource, DeviceId, Slide } from '../src/shared/types.ts';
import { DEVICE_IDS } from '../src/shared/types.ts';
import { applyPreset, deepMerge, newApp, newProfile, newSlide } from '../src/shared/presets.ts';
import { DEVICES, detectDevice, slideInDevice } from '../src/shared/devices.ts';

// Apps live outside the repo so they survive re-clones and are shared by every project that uses appshot.
export const DATA_DIR = path.resolve(process.env.APPSHOT_DATA ?? path.join(os.homedir(), '.openappshot'));
const APPS_DIR = path.join(DATA_DIR, 'apps');
const LEGACY_DIR = path.resolve('data');
if (!process.env.APPSHOT_DATA && !fs.existsSync(DATA_DIR) && fs.existsSync(path.join(LEGACY_DIR, 'apps'))) {
  fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true });
  fs.renameSync(LEGACY_DIR, DATA_DIR);
  console.log(`Moved saved apps from ${LEGACY_DIR} to ${DATA_DIR}`);
}
fs.mkdirSync(APPS_DIR, { recursive: true });

export const makeId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** The CLI passes "\\n" literally; store real line breaks. */
function normalizeText<T extends Partial<Slide>>(s: T): T {
  for (const k of ['headline', 'subtitle'] as const) {
    if (typeof s[k] === 'string') (s as Partial<Slide>)[k] = (s[k] as string).replace(/\\n/g, '\n');
  }
  return s;
}

export const events = new EventEmitter();
events.setMaxListeners(100);

const cache = new Map<string, App>();

function appDir(id: string) {
  return path.join(APPS_DIR, id);
}

export function assetPath(app: App, assetId: string) {
  const a = app.assets[assetId];
  if (!a) throw new HttpError(404, `Asset ${assetId} not found`);
  return path.join(appDir(app.id), 'assets', a.file);
}

function load(id: string): App | null {
  if (cache.has(id)) return cache.get(id)!;
  const file = path.join(appDir(id), 'app.json');
  if (!fs.existsSync(file)) return null;
  const app = migrate(JSON.parse(fs.readFileSync(file, 'utf8')));
  cache.set(id, app);
  return app;
}

/** Fill in fields added after an app was first saved. */
function migrate(app: App): App {
  const fresh = newApp(app.id);
  app = { ...fresh, ...app, theme: deepMerge(fresh.theme, app.theme), profile: { ...newProfile(), ...app.profile } };
  for (const d of DEVICE_IDS) {
    const spec = DEVICES[d];
    if (!spec.sizes[app.sizes?.[d]]) app.sizes = { ...app.sizes, [d]: spec.defaultSize };
    const ex = (app.exportSizes?.[d] ?? []).filter((k) => spec.sizes[k]);
    app.exportSizes = { ...app.exportSizes, [d]: ex.length ? ex : [...spec.defaultExport] };
  }
  // Styling is app-wide now; slides keep only their words, screenshots and screen info.
  if (!['top', 'bottom', 'side'].includes(app.theme.layout)) app.theme.layout = 'top';
  app.slides = app.slides.map((s) => ({
    id: s.id,
    headline: normalizeText({ headline: s.headline }).headline ?? '',
    subtitle: normalizeText({ subtitle: s.subtitle ?? '' }).subtitle ?? '',
    shots: s.shots ?? {},
    screen: Object.assign({ name: '', notes: '' }, s.screen),
  }));
  return app;
}

function save(app: App, origin?: string) {
  app.updatedAt = new Date().toISOString();
  cache.set(app.id, app);
  fs.mkdirSync(appDir(app.id), { recursive: true });
  const file = path.join(appDir(app.id), 'app.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(app, null, 2));
  fs.renameSync(file + '.tmp', file);
  events.emit('change', { type: 'app', id: app.id, origin });
  return app;
}

export function listApps(): AppSummary[] {
  return allApps()
    .map((a) => ({
      id: a.id,
      name: a.name,
      subtitle: a.subtitle,
      iconAssetId: a.iconAssetId,
      devices: a.devices,
      updatedAt: a.updatedAt,
      slideCount: a.slides.length,
      counts: Object.fromEntries(a.devices.map((d) => [d, a.slides.filter((s) => slideInDevice(s, d)).length])),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function allApps(): App[] {
  return fs
    .readdirSync(APPS_DIR)
    .map((id) => load(id))
    .filter((a): a is App => !!a);
}

/** Look up by id, exact name (any case) or bundle id. */
export function getApp(ref: string): App {
  const byId = load(ref);
  if (byId) return byId;
  const lower = ref.toLowerCase();
  const match = allApps().find((a) => a.name.toLowerCase() === lower || (a.profile.bundleId && a.profile.bundleId.toLowerCase() === lower));
  if (match) return match;
  throw new HttpError(404, `App "${ref}" not found`);
}

/** The app whose profile.projectPath contains `dir` (deepest match wins). */
export function findAppForPath(dir: string): App | null {
  const target = path.resolve(dir);
  let best: App | null = null;
  for (const a of allApps()) {
    const root = a.profile.projectPath ? path.resolve(a.profile.projectPath.replace(/^~/, os.homedir())) : '';
    if (!root) continue;
    if (target === root || target.startsWith(root + path.sep)) {
      if (!best || root.length > best.profile.projectPath.length) best = a;
    }
  }
  return best;
}

export function createApp(input: Partial<App> & { preset?: string }, origin?: string) {
  const app = newApp(makeId(), input);
  return save(app, origin);
}

export function updateApp(id: string, patch: Partial<App> & { preset?: string }, origin?: string) {
  const app = getApp(id);
  const { preset, slides, assets, id: _id, createdAt, ...rest } = patch as Partial<App> & { preset?: string };
  let next = deepMerge(app, rest);
  if (preset) {
    const t = applyPreset(app.theme, preset);
    next = { ...next, theme: rest.theme ? deepMerge(t, rest.theme) : t };
  }
  if (rest.devices) next.devices = DEVICE_IDS.filter((d) => rest.devices!.includes(d));
  return save(next, origin);
}

export function deleteApp(id: string, origin?: string) {
  const app = getApp(id);
  fs.rmSync(appDir(app.id), { recursive: true, force: true });
  cache.delete(app.id);
  events.emit('change', { type: 'deleted', id: app.id, origin });
}

export function addAsset(app: App, buf: Buffer, originalName: string, kind: Asset['kind'], source?: AssetSource): Asset {
  let dims: { width?: number; height?: number };
  try {
    dims = imageSize(new Uint8Array(buf));
  } catch {
    throw new HttpError(400, `${originalName} is not a PNG, JPEG, WebP or HEIC image`);
  }
  const id = makeId();
  const ext = (path.extname(originalName) || '.png').toLowerCase();
  const asset: Asset = {
    id,
    file: id + ext,
    width: dims.width ?? 0,
    height: dims.height ?? 0,
    kind,
    originalName,
    createdAt: new Date().toISOString(),
    source: source ?? { kind: 'upload' },
  };
  const dir = path.join(appDir(app.id), 'assets');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, asset.file), buf);
  app.assets[id] = asset;
  return asset;
}

export function findSlide(app: App, slideRef: string): Slide {
  // Accept a slide id or a 1-based position ("3").
  const byId = app.slides.find((s) => s.id === slideRef);
  if (byId) return byId;
  const n = Number(slideRef);
  if (Number.isInteger(n) && n >= 1 && n <= app.slides.length) return app.slides[n - 1];
  throw new HttpError(404, `Slide "${slideRef}" not found in ${app.name}`);
}

export function addSlide(appId: string, partial: Partial<Slide>, index: number | undefined, origin?: string) {
  const app = getApp(appId);
  const { id: _ignored, ...rest } = partial;
  const slide = newSlide(makeId(), normalizeText(rest));
  const at = index === undefined ? app.slides.length : Math.max(0, Math.min(index, app.slides.length));
  app.slides.splice(at, 0, slide);
  save(app, origin);
  return slide;
}

export function updateSlide(appId: string, slideRef: string, patch: Partial<Slide>, origin?: string) {
  const app = getApp(appId);
  const slide = findSlide(app, slideRef);
  const { id: _id, ...rest } = normalizeText({ ...patch });
  // Only content belongs to a slide; style changes go to the app theme.
  const content = Object.fromEntries(
    (['headline', 'subtitle', 'shots', 'screen'] as const).filter((k) => rest[k] !== undefined).map((k) => [k, rest[k]]),
  );
  const next = deepMerge(slide, content);

  Object.assign(slide, next);
  save(app, origin);
  return slide;
}

export function deleteSlide(appId: string, slideRef: string, origin?: string) {
  const app = getApp(appId);
  const slide = findSlide(app, slideRef);
  app.slides = app.slides.filter((s) => s.id !== slide.id);
  save(app, origin);
}

export function reorderSlides(appId: string, order: string[], origin?: string) {
  const app = getApp(appId);
  const byId = new Map(app.slides.map((s) => [s.id, s]));
  const next = order.map((id) => byId.get(id)).filter((s): s is Slide => !!s);
  for (const s of app.slides) if (!next.includes(s)) next.push(s);
  app.slides = next;
  return save(app, origin);
}

export function setIcon(appId: string, buf: Buffer, name: string, origin?: string) {
  const app = getApp(appId);
  const asset = addAsset(app, buf, name, 'icon');
  app.iconAssetId = asset.id;
  return save(app, origin);
}

export function setSlideShot(
  appId: string,
  slideRef: string,
  device: DeviceId,
  buf: Buffer,
  name: string,
  origin?: string,
  source?: AssetSource,
) {
  const app = getApp(appId);
  const asset = addAsset(app, buf, name, 'screenshot', source);
  save(app);
  return updateSlide(app.id, slideRef, { shots: { [device]: asset.id } }, origin);
}

export function uploadAssets(appId: string, files: { buf: Buffer; name: string }[], kind: Asset['kind'], origin?: string) {
  const app = getApp(appId);
  const assets = files.map((f) => addAsset(app, f.buf, f.name, kind));
  save(app, origin);
  return assets;
}

/**
 * Drop a batch of screenshots into an app. Each file is matched to a device (explicit or by
 * aspect ratio), then fills existing slides that lack a screenshot for that device in order,
 * creating new slides for the remainder.
 */
export function ingestScreenshots(
  appId: string,
  files: { buf: Buffer; name: string }[],
  opts: { device?: DeviceId; fallbackDevice?: DeviceId; headlines?: string[]; source?: AssetSource; screens?: string[] },
  origin?: string,
) {
  const app = getApp(appId);
  const placed: { slideId: string; device: DeviceId; assetId: string; created: boolean }[] = [];
  const skipped: { name: string; reason: string }[] = [];
  let headlineIdx = 0;

  for (const f of files) {
    let asset: Asset;
    try {
      asset = addAsset(app, f.buf, f.name, 'screenshot', opts.source);
    } catch (e) {
      skipped.push({ name: f.name, reason: (e as Error).message });
      continue;
    }
    const device = opts.device ?? detectDevice(asset.width, asset.height) ?? opts.fallbackDevice;
    if (!device) {
      skipped.push({ name: f.name, reason: `Can't tell the device from ${asset.width}×${asset.height}; pass a device` });
      continue;
    }
    if (!app.devices.includes(device)) app.devices = DEVICE_IDS.filter((d) => d === device || app.devices.includes(d));

    let slide = app.slides.find((s) => !s.shots[device]);
    const created = !slide;
    if (!slide) {
      slide = newSlide(makeId());
      app.slides.push(slide);
    }
    slide.shots[device] = asset.id;
    const h = opts.headlines?.[headlineIdx];
    if (h) slide.headline = h.replace(/\\n/g, '\n');
    const screenName = opts.screens?.[headlineIdx];
    if (screenName) slide.screen = { ...slide.screen, name: screenName };
    headlineIdx++;
    placed.push({ slideId: slide.id, device, assetId: asset.id, created });
  }
  save(app, origin);
  return { placed, skipped };
}

export interface ApplySpec {
  name?: string;
  subtitle?: string;
  preset?: string;
  devices?: DeviceId[];
  theme?: Partial<App['theme']>;
  iconAssetId?: string;
  /** Replace all slides with these, or (default) update slides by position and append the rest. */
  replaceSlides?: boolean;
  slides?: Partial<Slide>[];
}

/** Declarative bulk update — the fastest path for automation. */
export function applySpec(appId: string, spec: ApplySpec, origin?: string) {
  const app = getApp(appId);
  const { slides, replaceSlides, ...appPatch } = spec;
  if (Object.keys(appPatch).length) updateApp(app.id, appPatch as Partial<App> & { preset?: string });
  if (slides) {
    const fresh = getApp(app.id);
    if (replaceSlides) fresh.slides = [];
    slides.forEach((s, i) => {
      const existing = fresh.slides[i];
      if (existing && !replaceSlides) {
        updateSlide(fresh.id, existing.id, s);
      } else {
        const { id: _id, ...rest } = s;
        fresh.slides.push(newSlide(makeId(), normalizeText(rest)));
      }
    });
  }
  return save(getApp(app.id), origin);
}
