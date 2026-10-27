// Screenshots for the marketing promo cards: the app's studio screens (raw app screens from the
// screenshot studio, matched to the App Store app) and its App Store listing. A card shows the
// ones picked on the Marketing page, in that order, in iPhone frames.
//
// Ids: "s:<studio slide id>" or "a:<App Store screenshot number, 1-based>".

import * as crypto from 'crypto';
import fs from 'fs';
import type { App as StudioApp } from '@studio/shared/types';
import * as studio from '@studio-server/store';
import { listApps } from './queries';
import { defaultCopy, listing, promoData } from './marketing';
import { PROMO_TEMPLATES, type PromoTemplateId } from './prefs';
import { inlineImage, shrinkImage } from './share-render/kit';
import { readCached, writeCached } from './disk-cache';
import { RENDER_VERSION } from './share-render/version';
import { shareDataVersion } from './share';

export interface PromoScreen {
  id: string;
  source: 'studio' | 'store';
  label: string;
  thumb: string;           // URL the Marketing page shows it from
  ratio: number;           // height / width
}

export interface PromoScreens {
  studio: { id: string; name: string } | null;
  screens: PromoScreen[];
  defaults: string[];      // used until some are picked: the studio's, else the App Store's
}

// Finding the project reads every studio project from disk, and each card asks (twice): a few
// seconds' memory covers a page of cards loading together, and edits in Studio still show up.
const PROJECT_TTL = 3000;
const projectCache = new Map<string, { at: number; project: StudioApp | null }>();

/** The studio project for an App Store app: by Apple ID in its App Store link, then bundle ID, then name. */
export function studioProjectFor(appleId: string): StudioApp | null {
  const hit = projectCache.get(appleId);
  if (hit && Date.now() - hit.at < PROJECT_TTL) return hit.project;
  const project = findStudioProject(appleId);
  projectCache.set(appleId, { at: Date.now(), project });
  return project;
}

function findStudioProject(appleId: string): StudioApp | null {
  if (!process.env.APPSHOT_DATA) return null;
  const app = (listApps() as any[]).find((a) => a.apple_id === appleId);
  if (!app) return null;
  let projects: StudioApp[];
  try {
    projects = studio.listApps().map((p) => studio.getApp(p.id));
  } catch {
    return null;
  }
  const name = String(app.name).split(':')[0].trim().toLowerCase();
  const bundle = String(app.bundle_id ?? '').toLowerCase();
  return (
    projects.find((p) => p.profile.appStoreUrl?.match(/\/id(\d+)/)?.[1] === appleId) ??
    (bundle ? projects.find((p) => p.profile.bundleId?.toLowerCase() === bundle) : undefined) ??
    projects.find((p) => p.name.trim().toLowerCase() === name) ??
    null
  );
}

const plainHeadline = (h: string) => h.replace(/\*/g, '').replace(/\s*\n\s*/g, ' ').trim();

/** An App Store screenshot URL at another width (Apple's CDN serves any size). */
export const storeShotAt = (url: string, width: number) => url.replace(/\/\d+x\d+bb\.(\w+)$/, `/${width}x${Math.round(width * 2.2)}bb.$1`);

const THUMB_WIDTH = 132; // the picker shows 44 px phones: sharp at 3x

/** Every screenshot a card could show for this app. */
export async function promoScreens(appleId: string): Promise<PromoScreens> {
  const project = studioProjectFor(appleId);
  const screens: PromoScreen[] = [];
  if (project) {
    project.slides.forEach((slide, i) => {
      const asset = slide.shots.iphone ? project.assets[slide.shots.iphone] : undefined;
      if (!asset?.width || !asset.height) return;
      screens.push({
        id: `s:${slide.id}`,
        source: 'studio',
        label: plainHeadline(slide.headline) || slide.screen.name || `Screen ${i + 1}`,
        thumb: `/api/marketing/thumb?app=${appleId}&asset=${encodeURIComponent(asset.id)}`,
        ratio: asset.height / asset.width,
      });
    });
  }
  const studioCount = screens.length;
  (await listing(appleId))?.screenshots.forEach((s, i) => {
    screens.push({ id: `a:${i + 1}`, source: 'store', label: `App Store ${i + 1}`, thumb: storeShotAt(s.url, THUMB_WIDTH), ratio: s.ratio });
  });
  const defaults = (studioCount ? screens.slice(0, studioCount) : screens).slice(0, 5).map((s) => s.id);
  return { studio: project ? { id: project.id, name: project.name } : null, screens, defaults };
}

/**
 * What the Marketing page needs to edit one app's promo cards: the screenshots they can show, each
 * template's own wording (shown as placeholders), and the reviews the Reviews card can quote.
 */
export async function promoInfo(appleId: string) {
  const [screens, data] = await Promise.all([promoScreens(appleId), promoData(appleId)]);
  if (!data) return null;
  const copy = Object.fromEntries((Object.keys(PROMO_TEMPLATES) as PromoTemplateId[]).map((t) => [t, defaultCopy(t, data)]));
  const quotes = data.quotes.map((q, index) => ({ index, body: q.body, reviewer: q.reviewer, rating: q.rating }));
  return { ...screens, copy, quotes, version: await promoVersion(appleId) };
}

/**
 * Changes whenever anything an app's promo cards show could have: this build, the data (a sync, a
 * new day), its App Store release and screenshots, its studio screens. Card URLs carry it, so the
 * browser can keep a card for good and still never show an old one.
 */
export async function promoVersion(appleId: string) {
  const l = await listing(appleId);
  const project = studioProjectFor(appleId);
  const studioShots = project?.slides.map((s) => s.shots.iphone ?? '').join(',') ?? '';
  const parts = [RENDER_VERSION, shareDataVersion(), l?.version, l?.versionDate, l?.screenshots.map((x) => x.url).join(','), studioShots];
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
}

/** The same for the stats cards, whose settings are all in their URL. */
export function statsVersion() {
  return crypto.createHash('sha1').update(`${RENDER_VERSION}|${shareDataVersion()}`).digest('hex').slice(0, 12);
}

/** A studio screen at picker size, as PNG: from disk after the first time. */
export async function studioThumb(appleId: string, assetId: string): Promise<Buffer | null> {
  const project = studioProjectFor(appleId);
  const asset = project?.assets[assetId];
  if (!project || !asset?.width || !asset.height) return null;
  const key = `${asset.id}-${THUMB_WIDTH}`;
  const saved = await readCached('thumbs', key, '.png');
  if (saved) return saved;
  let buf: Buffer;
  try {
    buf = fs.readFileSync(studio.assetPath(project, asset.id));
  } catch {
    return null;
  }
  const type = asset.file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  const png = Buffer.from(shrinkImage(`data:${type};base64,${buf.toString('base64')}`, asset.width, asset.height, THUMB_WIDTH).split(',')[1], 'base64');
  writeCached('thumbs', key, png, '.png');
  return png;
}

// Sharp in a 1080 px card without making a huge render; previews (drawn at 0.6 or less) get
// smaller copies, which are quicker to decode on every render.
export const SHOT_WIDTH = 700;
export const PREVIEW_SHOT_WIDTH = 440;
const studioImages = new Map<string, string>();

/** A studio screenshot shrunk to `width`, as a data: URI: from memory, else disk, else made now. */
async function studioImage(project: StudioApp, asset: StudioApp['assets'][string], width: number): Promise<string | null> {
  const key = `${asset.id}-${width}`;
  let src = studioImages.get(key);
  if (src) return src;
  const saved = await readCached('shots', key, '.txt');
  if (saved) src = saved.toString('utf8');
  else {
    let buf: Buffer;
    try {
      buf = fs.readFileSync(studio.assetPath(project, asset.id));
    } catch {
      return null;
    }
    const type = asset.file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    src = shrinkImage(`data:${type};base64,${buf.toString('base64')}`, asset.width!, asset.height!, width);
    writeCached('shots', key, src, '.txt');
  }
  studioImages.set(key, src);
  while (studioImages.size > 60) studioImages.delete(studioImages.keys().next().value!);
  return src;
}

/**
 * The picked screenshots: `key` changes when any of them do (a new screenshot on a studio slide, a
 * new App Store release) and is known without loading a single image; `load` inlines them, in
 * order, at `width`.
 */
export async function promoShots(appleId: string, ids: string[], width = SHOT_WIDTH): Promise<{ key: string; load: () => Promise<{ src: string; ratio: number }[]> }> {
  const project = ids.some((id) => id.startsWith('s:')) ? studioProjectFor(appleId) : null;
  const store = ids.some((id) => id.startsWith('a:')) ? await listing(appleId) : null;
  const picked = ids.map((id) => {
    if (id.startsWith('s:') && project) {
      const slide = project.slides.find((s) => s.id === id.slice(2));
      const asset = slide?.shots.iphone ? project.assets[slide.shots.iphone] : undefined;
      return asset?.width && asset.height ? { kind: 'studio' as const, asset, ratio: asset.height / asset.width } : null;
    }
    if (id.startsWith('a:') && store) {
      const shot = store.screenshots[Number(id.slice(2)) - 1];
      return shot ? { kind: 'store' as const, url: shot.url, ratio: shot.ratio } : null;
    }
    return null;
  }).filter((x) => !!x);
  const key = picked.map((x) => (x.kind === 'studio' ? x.asset.id : x.url)).join(',') + `@${width}`;
  const load = async () => {
    const images = await Promise.all(
      picked.map(async (x) => {
        const src = x.kind === 'studio' ? await studioImage(project!, x.asset, width) : await inlineImage(width === SHOT_WIDTH ? x.url : storeShotAt(x.url, width));
        return src ? { src, ratio: x.ratio } : null;
      })
    );
    return images.filter((i): i is { src: string; ratio: number } => !!i);
  };
  return { key, load };
}
