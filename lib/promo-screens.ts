// Screenshots for the marketing promo cards: the app's studio screens (raw app screens from the
// screenshot studio, matched to the App Store app) and its App Store listing. A card shows the
// ones picked on the Marketing page, in that order, in iPhone frames.
//
// Ids: "s:<studio slide id>" or "a:<App Store screenshot number, 1-based>".

import fs from 'fs';
import type { App as StudioApp } from '@studio/shared/types';
import * as studio from '@studio-server/store';
import { listApps } from './queries';
import { listing } from './marketing';
import { inlineImage, shrinkImage } from './share-render/kit';

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

/** The studio project for an App Store app: by Apple ID in its App Store link, then bundle ID, then name. */
export function studioProjectFor(appleId: string): StudioApp | null {
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
        thumb: `/studio/api/apps/${project.id}/assets/${asset.id}`,
        ratio: asset.height / asset.width,
      });
    });
  }
  const studioCount = screens.length;
  (await listing(appleId))?.screenshots.forEach((s, i) => {
    screens.push({ id: `a:${i + 1}`, source: 'store', label: `App Store ${i + 1}`, thumb: s.url, ratio: s.ratio });
  });
  const defaults = (studioCount ? screens.slice(0, studioCount) : screens).slice(0, 5).map((s) => s.id);
  return { studio: project ? { id: project.id, name: project.name } : null, screens, defaults };
}

const SHOT_WIDTH = 700; // sharp in a 1080 px card without making a huge render
const studioImages = new Map<string, string>();

/**
 * The picked screenshots as inlined images, in order, plus a key that changes when any of them do
 * (a new screenshot on a studio slide, a new App Store release).
 */
export async function loadPromoScreens(appleId: string, ids: string[]): Promise<{ key: string; images: { src: string; ratio: number }[] }> {
  const project = ids.some((id) => id.startsWith('s:')) ? studioProjectFor(appleId) : null;
  const store = ids.some((id) => id.startsWith('a:')) ? await listing(appleId) : null;
  const keys: string[] = [];
  const images = await Promise.all(
    ids.map(async (id) => {
      if (id.startsWith('s:') && project) {
        const slide = project.slides.find((s) => s.id === id.slice(2));
        const asset = slide?.shots.iphone ? project.assets[slide.shots.iphone] : undefined;
        if (!asset?.width || !asset.height) return null;
        keys.push(asset.id);
        let src = studioImages.get(asset.id);
        if (!src) {
          const buf = fs.readFileSync(studio.assetPath(project, asset.id));
          const type = asset.file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
          const shrunk = shrinkImage(`data:${type};base64,${buf.toString('base64')}`, asset.width, asset.height, SHOT_WIDTH);
          studioImages.set(asset.id, shrunk);
          src = shrunk;
          while (studioImages.size > 60) studioImages.delete(studioImages.keys().next().value!);
        }
        return { src, ratio: asset.height / asset.width };
      }
      if (id.startsWith('a:') && store) {
        const shot = store.screenshots[Number(id.slice(2)) - 1];
        if (!shot) return null;
        keys.push(shot.url);
        const src = await inlineImage(shot.url);
        return src ? { src, ratio: shot.ratio } : null;
      }
      return null;
    })
  );
  return { key: keys.join(','), images: images.filter((i): i is { src: string; ratio: number } => !!i) };
}
