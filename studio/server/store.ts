import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { customAlphabet } from 'nanoid';
import { imageSize } from 'image-size';
import type { App, AppSummary, Asset, AssetSource, CreativeId, DeviceId, ScreenshotSet, Slide } from '../src/shared/types.ts';
import { DEVICE_IDS } from '../src/shared/types.ts';
import { applyPreset, deepMerge, newApp, newProfile, newSlide, pruneOverride } from '../src/shared/presets.ts';
import { DEVICES, detectDevice, slideInDevice } from '../src/shared/devices.ts';
import { findSet, PRIMARY_SET, setList, setView } from '../src/shared/sets.ts';
import { newCreative } from '../src/shared/creatives.ts';
import { normalizeLanguage } from '../src/shared/locales.ts';

// Apps live outside the repo so they survive re-clones and are shared by every project that uses appshot.
// Inside OpenConnect: APPSHOT_DATA=<OpenConnect data>/studio, read and written by the dashboard, read by
// the render container.
export const DATA_DIR = path.resolve(process.env.APPSHOT_DATA ?? path.join(os.homedir(), '.openappshot'));
const APPS_DIR = path.join(DATA_DIR, 'apps');

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
  for (const loc of Object.values(s.locales ?? {})) if (loc && typeof loc === 'object') normalizeText(loc as Partial<Slide>);
  return s;
}

export const events = new EventEmitter();
events.setMaxListeners(100);

// Two processes share the files (the dashboard writes, the renderer reads), so a cached app is only
// used while its file is unchanged on disk.
const cache = new Map<string, { app: App; mtime: number }>();

function appDir(id: string) {
  return path.join(APPS_DIR, id);
}

export function assetPath(app: App, assetId: string) {
  const a = app.assets[assetId];
  if (!a) throw new HttpError(404, `Asset ${assetId} not found`);
  return path.join(appDir(app.id), 'assets', a.file);
}

function load(id: string): App | null {
  // Ids are short and alphanumeric; anything else (a name, "../") is never a folder here.
  if (!/^[\w-]{1,40}$/.test(id)) return null;
  const file = path.join(appDir(id), 'app.json');
  let mtime: number;
  try {
    mtime = fs.statSync(file).mtimeMs;
  } catch {
    cache.delete(id);
    return null;
  }
  const hit = cache.get(id);
  if (hit && hit.mtime === mtime) return hit.app;
  const app = migrate(JSON.parse(fs.readFileSync(file, 'utf8')));
  cache.set(id, { app, mtime });
  return app;
}

/** Fill in fields added after an app was first saved. */
function migrate(app: App): App {
  const fresh = newApp(app.id);
  app = {
    ...fresh,
    ...app,
    theme: deepMerge(fresh.theme, app.theme),
    profile: { ...newProfile(), ...app.profile },
    creatives: deepMerge(fresh.creatives, app.creatives ?? {}),
  };
  for (const d of DEVICE_IDS) {
    const spec = DEVICES[d];
    if (!spec.sizes[app.sizes?.[d]]) app.sizes = { ...app.sizes, [d]: spec.defaultSize };
    const ex = (app.exportSizes?.[d] ?? []).filter((k) => spec.sizes[k]);
    app.exportSizes = { ...app.exportSizes, [d]: ex.length ? ex : [...spec.defaultExport] };
  }
  if (!['top', 'bottom', 'side'].includes(app.theme.layout)) app.theme.layout = 'top';
  app.slides = migrateSlides(app.slides);
  app.sets = (app.sets ?? []).map((set) => ({
    ...set,
    theme: deepMerge(fresh.theme, set.theme),
    creatives: deepMerge(fresh.creatives, set.creatives ?? {}),
    slides: migrateSlides(set.slides ?? []),
  }));
  delete app.activeSet;
  delete app.activeLang;
  return app;
}

function migrateSlides(slides: Slide[]): Slide[] {
  return slides.map((s) => ({
    id: s.id,
    headline: normalizeText({ headline: s.headline }).headline ?? '',
    subtitle: normalizeText({ subtitle: s.subtitle ?? '' }).subtitle ?? '',
    shots: s.shots ?? {},
    screen: Object.assign({ name: '', notes: '' }, s.screen),
    role: s.role === 'hero' ? 'hero' : 'standard',
    callouts: s.callouts ?? {},
    style: pruneOverride(s.style),
    stickers: Array.isArray(s.stickers) ? s.stickers : [],
    locales: s.locales && typeof s.locales === 'object' ? s.locales : {},
  }));
}

/** Throws the set lookup's 404 as an HttpError. */
function resolveSet(app: App, ref?: string | null) {
  try {
    return findSet(app, ref);
  } catch (e) {
    throw new HttpError(404, (e as Error).message);
  }
}

/** The app as one set sees it (read-only use). */
export function getView(appRef: string, setRef?: string | null): App {
  const app = getApp(appRef);
  resolveSet(app, setRef);
  return setView(app, setRef);
}

/**
 * Open one set of an app for changes: `view` looks like an App (that set's theme, slides and creatives plus
 * everything shared); `commit` writes the set's parts back to the set and shared parts back to the app.
 */
function open(appRef: string, setRef?: string | null) {
  const app = getApp(appRef);
  const set = resolveSet(app, setRef);
  const view = setView(app, set?.id);
  const commit = (origin?: string): App => {
    if (set) {
      set.theme = view.theme;
      set.slides = view.slides;
      set.creatives = view.creatives;
      for (const [k, v] of Object.entries(view)) {
        if (!['theme', 'slides', 'creatives', 'sets', 'activeSet', 'primarySetName'].includes(k)) (app as unknown as Record<string, unknown>)[k] = v;
      }
    }
    save(app, origin);
    view.updatedAt = app.updatedAt;
    return view;
  };
  return { app, view, commit };
}

function save(app: App, origin?: string) {
  if (app.activeSet || app.activeLang) throw new Error('Refusing to save a set or language view as the app');
  app.updatedAt = new Date().toISOString();
  fs.mkdirSync(appDir(app.id), { recursive: true });
  const file = path.join(appDir(app.id), 'app.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(app, null, 2));
  fs.renameSync(file + '.tmp', file);
  cache.set(app.id, { app, mtime: fs.statSync(file).mtimeMs });
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
  fs.mkdirSync(APPS_DIR, { recursive: true });
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

export function updateApp(id: string, patch: Partial<App> & { preset?: string }, origin?: string, setRef?: string | null) {
  const { view, commit } = open(id, setRef);
  const { preset, slides, assets, sets, activeSet, id: _id, createdAt, ...rest } = patch as Partial<App> & { preset?: string };
  let next = deepMerge(view, rest);
  if (preset) {
    const t = applyPreset(view.theme, preset);
    next = { ...next, theme: rest.theme ? deepMerge(t, rest.theme) : t };
  }
  if (rest.devices) next.devices = DEVICE_IDS.filter((d) => rest.devices!.includes(d));
  if (rest.baseLanguage !== undefined || rest.languages !== undefined) {
    const code = (c: unknown) => normalizeLanguage(String(c)) ?? (() => { throw new HttpError(400, `"${c}" isn't a language code (use App Store codes like de-DE, ja, pt-BR)`); })();
    next.baseLanguage = code(next.baseLanguage);
    if (!Array.isArray(next.languages)) throw new HttpError(400, 'languages must be a list of codes');
    // The base language is never also a translation.
    next.languages = [...new Set(next.languages.map(code))].filter((c) => c !== next.baseLanguage);
  }
  Object.assign(view, next);
  return commit(origin);
}

// ---------- sets ----------
export function listSets(appRef: string) {
  return setList(getApp(appRef));
}

/** New set: a copy of another set (default the primary), or `blank` for its style with no slides. */
export function createSet(appRef: string, input: { name?: string; from?: string | null; blank?: boolean }, origin?: string) {
  const app = getApp(appRef);
  const source = setView(app, resolveSet(app, input.from)?.id);
  const ids = new Map<string, string>();
  const slides = input.blank
    ? []
    : source.slides.map((s) => {
        const id = makeId();
        ids.set(s.id, id);
        return { ...structuredClone(s), id };
      });
  const creatives = structuredClone(source.creatives);
  for (const c of Object.values(creatives)) c.shots = c.shots.filter((x) => ids.has(x.slideId)).map((x) => ({ ...x, slideId: ids.get(x.slideId)! }));
  const name = (input.name ?? '').trim() || `Test ${String.fromCharCode(65 + app.sets.length)}`;
  if (setList(app).some((x) => x.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, `There's already a set called "${name}"`);
  const set: ScreenshotSet = {
    id: makeId(),
    name,
    theme: structuredClone(source.theme),
    slides,
    creatives: input.blank ? { header: newCreative('header'), search: newCreative('search') } : creatives,
    createdAt: new Date().toISOString(),
  };
  app.sets.push(set);
  save(app, origin);
  return set;
}

export function renameSet(appRef: string, setRef: string, name: string, origin?: string) {
  const app = getApp(appRef);
  const clean = name.trim();
  if (!clean) throw new HttpError(400, 'A set needs a name');
  const set = resolveSet(app, setRef);
  if (setList(app).some((x) => x.name.toLowerCase() === clean.toLowerCase() && x.id !== (set?.id ?? PRIMARY_SET))) {
    throw new HttpError(409, `There's already a set called "${clean}"`);
  }
  if (set) set.name = clean;
  else app.primarySetName = clean;
  save(app, origin);
  return setList(app);
}

export function deleteSet(appRef: string, setRef: string, origin?: string) {
  const app = getApp(appRef);
  const set = resolveSet(app, setRef);
  if (!set) throw new HttpError(400, 'The primary set can’t be deleted. Make another set primary first.');
  app.sets = app.sets.filter((s) => s.id !== set.id);
  save(app, origin);
  return setList(app);
}

/** Swap a set with the primary one (e.g. the winner of a test); the old primary becomes a set. */
export function makePrimary(appRef: string, setRef: string, origin?: string) {
  const app = getApp(appRef);
  const set = resolveSet(app, setRef);
  if (!set) return setList(app);
  const old = { theme: app.theme, slides: app.slides, creatives: app.creatives, name: app.primarySetName };
  app.theme = set.theme;
  app.slides = set.slides;
  app.creatives = set.creatives;
  app.primarySetName = set.name;
  Object.assign(set, old);
  save(app, origin);
  return setList(app);
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

export function addSlide(appId: string, partial: Partial<Slide>, index: number | undefined, origin?: string, setRef?: string | null) {
  const { view: app, commit } = open(appId, setRef);
  const { id: _ignored, ...rest } = partial;
  const slide = newSlide(makeId(), normalizeText(rest));
  const at = index === undefined ? app.slides.length : Math.max(0, Math.min(index, app.slides.length));
  app.slides.splice(at, 0, slide);
  commit(origin);
  return slide;
}

export function updateSlide(appId: string, slideRef: string, patch: Partial<Slide>, origin?: string, setRef?: string | null) {
  const { view: app, commit } = open(appId, setRef);
  const slide = findSlide(app, slideRef);
  const { id: _id, ...rest } = normalizeText({ ...patch });
  // Only content belongs to a slide; style changes go to the app theme.
  const content = Object.fromEntries(
    (['headline', 'subtitle', 'shots', 'screen', 'role', 'callouts', 'style', 'stickers', 'locales'] as const).filter((k) => rest[k] !== undefined).map((k) => [k, rest[k]]),
  );
  if (rest.role !== undefined && rest.role !== 'hero' && rest.role !== 'standard') {
    throw new HttpError(400, `Unknown role "${rest.role}". Use hero or standard`);
  }
  for (const [d, c] of Object.entries(rest.callouts ?? {})) {
    if (c === null) continue;
    const ok = c && [c.x, c.y, c.w, c.h].every((v) => typeof v === 'number' && v >= 0 && v <= 1) && c.w > 0 && c.h > 0;
    if (!ok) throw new HttpError(400, `Callout for ${d} needs x, y, w, h as fractions of the screenshot (0–1)`);
  }
  if (rest.stickers !== undefined && !Array.isArray(rest.stickers)) throw new HttpError(400, 'stickers must be a list');
  const next = deepMerge(slide, content);
  // `style: null` reverts the whole slide to the app style; a null leaf reverts one setting.
  next.style = rest.style === null ? null : pruneOverride(next.style);

  Object.assign(slide, next);
  commit(origin);
  return slide;
}

export function deleteSlide(appId: string, slideRef: string, origin?: string, setRef?: string | null) {
  const { view: app, commit } = open(appId, setRef);
  const slide = findSlide(app, slideRef);
  app.slides = app.slides.filter((s) => s.id !== slide.id);
  commit(origin);
}

export function reorderSlides(appId: string, order: string[], origin?: string, setRef?: string | null) {
  const { view: app, commit } = open(appId, setRef);
  const byId = new Map(app.slides.map((s) => [s.id, s]));
  const next = order.map((id) => byId.get(id)).filter((s): s is Slide => !!s);
  for (const s of app.slides) if (!next.includes(s)) next.push(s);
  app.slides = next;
  return commit(origin);
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
  setRef?: string | null,
  lang?: string | null,
) {
  const app = getApp(appId);
  const asset = addAsset(app, buf, name, 'screenshot', source);
  save(app);
  // A translation's screenshot (the app running in that language) goes with that language's text.
  const shots = { [device]: asset.id };
  return updateSlide(app.id, slideRef, lang ? { locales: { [lang]: { shots } } } : { shots }, origin, setRef);
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
  setRef?: string | null,
  /** a translation language: fill that language's screenshots of existing slides, in order */
  lang?: string | null,
) {
  const { view: app, commit } = open(appId, setRef);
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
    if (lang) {
      // Slides come from the base language; a translation only fills in its own screenshots.
      const target = app.slides.find((s) => !s.locales?.[lang]?.shots?.[device]);
      if (!target) {
        skipped.push({ name: f.name, reason: `every slide already has a ${lang} ${device} screenshot; add slides in the base language first` });
        continue;
      }
      target.locales = { ...target.locales, [lang]: { ...target.locales?.[lang], shots: { ...target.locales?.[lang]?.shots, [device]: asset.id } } };
      const h = opts.headlines?.[headlineIdx++];
      if (h) target.locales[lang].headline = h.replace(/\\n/g, '\n');
      placed.push({ slideId: target.id, device, assetId: asset.id, created: false });
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
  commit(origin);
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
export function applySpec(appId: string, spec: ApplySpec, origin?: string, setRef?: string | null) {
  const app = getApp(appId);
  const { slides, replaceSlides, ...appPatch } = spec;
  if (Object.keys(appPatch).length) updateApp(app.id, appPatch as Partial<App> & { preset?: string }, undefined, setRef);
  if (slides) {
    const { view, commit } = open(app.id, setRef);
    if (replaceSlides) view.slides = [];
    commit();
    slides.forEach((s, i) => {
      const existing = getView(app.id, setRef).slides[i];
      if (existing && !replaceSlides) {
        updateSlide(app.id, existing.id, s, undefined, setRef);
      } else {
        const { id: _id, ...rest } = s;
        addSlide(app.id, rest, undefined, undefined, setRef);
      }
    });
  }
  return open(app.id, setRef).commit(origin);
}

export interface TranslationInput {
  slides?: { slide: string | number; headline?: string; subtitle?: string }[];
  creatives?: Partial<Record<CreativeId, { headline?: string; subtitle?: string }>>;
  hero?: { badgeTitle?: string; badgeCaption?: string };
}

/** Many translations of one language at once (slides by id or 1-based position). Empty strings clear one. */
export function setTranslations(appRef: string, lang: string, input: TranslationInput, origin?: string, setRef?: string | null) {
  const { view: app, commit } = open(appRef, setRef);
  const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\\n/g, '\n') : undefined);
  const put = <T extends object>(target: T, key: string, value: unknown) => {
    if (value !== undefined) (target as Record<string, unknown>)[key] = value;
  };
  for (const t of input.slides ?? []) {
    const slide = findSlide(app, String(t.slide));
    const loc = { ...slide.locales?.[lang] };
    put(loc, 'headline', text(t.headline));
    put(loc, 'subtitle', text(t.subtitle));
    slide.locales = { ...slide.locales, [lang]: loc };
  }
  for (const [id, t] of Object.entries(input.creatives ?? {})) {
    const c = app.creatives[id as CreativeId];
    if (!c || !t) throw new HttpError(400, `Unknown creative "${id}". Use header or search`);
    const loc = { ...c.locales?.[lang] };
    put(loc, 'headline', text(t.headline));
    put(loc, 'subtitle', text(t.subtitle));
    c.locales = { ...c.locales, [lang]: loc };
  }
  if (input.hero) {
    const loc = { ...app.theme.hero.locales?.[lang] };
    put(loc, 'badgeTitle', text(input.hero.badgeTitle));
    put(loc, 'badgeCaption', text(input.hero.badgeCaption));
    app.theme.hero = { ...app.theme.hero, locales: { ...app.theme.hero.locales, [lang]: loc } };
  }
  return commit(origin);
}
