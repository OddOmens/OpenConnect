// Gets Marketing ready before anyone opens it: at startup and after every sync, every app's App
// Store listing, icons and default screenshots are fetched (to disk, see disk-cache), then the
// grid's previews as you last left it are drawn. Opening the page then only reads cached cards.
//
// It runs one card at a time, so the workers stay free for anyone using the page meanwhile.

import { getUiPrefs } from './config';
import { listApps } from './queries';
import { listing } from './marketing';
import { inlineIcon, inlineLargeIcon } from './share-render/kit';
import { PREVIEW_SHOT_WIDTH, SHOT_WIDTH, promoScreens, promoShots, promoVersion, statsVersion } from './promo-screens';
import { cardFor } from './share-render/cards';
import { prune } from './disk-cache';
import { previewParam, promoUrl, resolvePromo, statsUrl } from './promo-settings';
import { PROMO_TEMPLATES, type PromoTemplateId } from './prefs';

const g = globalThis as unknown as { __marketingWarm?: { timer?: ReturnType<typeof setTimeout>; running: boolean; again: boolean } };
const state = () => (g.__marketingWarm ??= { running: false, again: false });

/** Warms up in `delayMs` (later calls before then push it back, so a burst of syncs warms once). */
export function scheduleWarm(delayMs = 5000) {
  const s = state();
  clearTimeout(s.timer);
  s.timer = setTimeout(run, delayMs);
  s.timer.unref?.();
}

async function run() {
  const s = state();
  if (s.running) {
    s.again = true;
    return;
  }
  s.running = true;
  const started = Date.now();
  try {
    const cards = await warm();
    console.log(`[marketing] warmed ${cards} cards in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error('[marketing] warm-up:', (err as Error)?.message || err);
  } finally {
    s.running = false;
    if (s.again) {
      s.again = false;
      scheduleWarm();
    }
  }
}

async function warm() {
  // Files from old builds and old data go first.
  await Promise.all([
    prune('cards', 400 * 1024 * 1024, 4),
    prune('images', 300 * 1024 * 1024, 90),
    prune('shots', 200 * 1024 * 1024, 90),
    prune('thumbs', 50 * 1024 * 1024, 90),
    prune('listings', 20 * 1024 * 1024, 90),
  ]);
  const prefs = getUiPrefs();
  const apps = (listApps() as any[]).filter((a) => !a.hidden);
  if (!apps.length) return 0;

  // Every app's material, so any app picked on the page is quick.
  for (const a of apps) {
    await listing(a.apple_id);
    await Promise.all([inlineIcon(a.icon_url ?? null), inlineLargeIcon(a.icon_url ?? null)]);
    const { defaults } = await promoScreens(a.apple_id);
    for (const width of [PREVIEW_SHOT_WIDTH, SHOT_WIDTH]) await (await promoShots(a.apple_id, defaults, width)).load();
  }

  // The grid as it was left, with the same URLs the page asks for.
  const mk = prefs.marketing;
  let urls: string[];
  if (mk.mode === 'promo') {
    const app = apps.find((a) => a.apple_id === mk.app) ?? apps[0];
    const id: string = app.apple_id;
    const available = new Set((await promoScreens(id)).screens.map((x) => x.id));
    const picked = (mk.shots[id] ?? []).filter((x) => available.has(x));
    const v = await promoVersion(id);
    urls = (Object.keys(PROMO_TEMPLATES) as PromoTemplateId[]).map((t) => promoUrl(id, t, resolvePromo(mk, id, t, picked), v));
  } else {
    const v = statsVersion();
    urls = ['all', ...apps.map((a) => a.apple_id as string)].map((id) => statsUrl(id, prefs.share, 0, v));
  }
  const preview = previewParam(mk.cardSize);
  for (const url of urls) {
    const card = await cardFor(new URL(`${url}&preview=${preview}`, 'http://localhost').searchParams);
    if (card.ok) await card.png();
  }
  return urls.length;
}
