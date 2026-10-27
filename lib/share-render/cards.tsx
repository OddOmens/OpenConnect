// Marketing cards as PNG, for /api/marketing and for warming them up ahead of time (marketing-warm).
// Stats cards are styled like the dashboard; promo cards are made from an app's App Store listing.
// Every option is a URL parameter (see app/api/marketing/route.tsx).
//
// A card is looked for in memory, then on disk, and only then drawn (on the worker threads in
// pool.ts). Its key holds everything it shows, so a sync, a new day, a release or a new build
// re-draws it.

import * as crypto from 'crypto';
import {
  isShareRange, mapShare, milestoneShare, ratingShare, reachShare, reviewShare, SHARE_TEMPLATES, ShareData, ShareRange, ShareTemplate, shareData, shareDataVersion,
} from '@/lib/share';
import { FORMATS, Format, THEMES, Theme, inlineIcon, inlineLargeIcon } from './kit';
import { OverviewCard } from './overview';
import { MapCard, MilestoneCard, RatingCard, ReachCard, ReviewCard } from './templates';
import { PromoCard, PROMO_SIZES, PromoOptions } from './promo';
import { drawCard } from './pool';
import { RENDER_VERSION } from './version';
import { listing, promoData } from '@/lib/marketing';
import { PREVIEW_SHOT_WIDTH, promoScreens, promoShots, promoVersion, SHOT_WIDTH, statsVersion } from '@/lib/promo-screens';
import { prune, readCached, writeCached } from '@/lib/disk-cache';
import {
  PROMO_FORMATS, PROMO_STYLES, PROMO_TEMPLATES, PromoFormatId, PromoStyleId, PromoTemplateId, SHARE_HEROES, SHARE_STATS, ShareHeroId, ShareStatId,
} from '@/lib/prefs';

// --- Rendered PNG cache -------------------------------------------------------------

// A page of previews is about 2 MB, a full-size card under 1 MB: memory holds every card of
// several apps, both sizes; disk holds more, and survives a restart.
const MAX_CACHED_BYTES = 160 * 1024 * 1024;
const DISK_CARDS_BYTES = 400 * 1024 * 1024;
const pngCache = new Map<string, Buffer>();
let cachedBytes = 0;
let writes = 0;

function remember(key: string, png: Buffer) {
  const old = pngCache.get(key);
  if (old) {
    cachedBytes -= old.length;
    pngCache.delete(key);
  }
  pngCache.set(key, png);
  cachedBytes += png.length;
  while (cachedBytes > MAX_CACHED_BYTES && pngCache.size > 1) {
    const [oldest, buf] = pngCache.entries().next().value!;
    pngCache.delete(oldest);
    cachedBytes -= buf.length;
  }
}

/** The cached PNG, marked as recently used. */
function recall(key: string) {
  const png = pngCache.get(key);
  if (png) {
    pngCache.delete(key);
    pngCache.set(key, png);
  }
  return png;
}

// Identical requests under way (the grid, a popup and the warm-up asking at once) share one render.
const inFlight = new Map<string, Promise<Buffer | null>>();

/** From memory, else disk, else drawn now (and kept in both). */
function cachedPng(key: string, draw: () => Promise<Buffer | null>): Promise<Buffer | null> {
  const hit = recall(key);
  if (hit) return Promise.resolve(hit);
  let job = inFlight.get(key);
  if (!job) {
    job = (async () => {
      const saved = await readCached('cards', key, '.png');
      if (saved) {
        remember(key, saved);
        return saved;
      }
      const png = await draw();
      if (png) {
        remember(key, png);
        writeCached('cards', key, png, '.png');
        // Old cards (other builds, earlier data) are cleared out now and then.
        if (++writes % 200 === 1) prune('cards', DISK_CARDS_BYTES, 4);
      }
      return png;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  return job;
}

// --- Drawing -------------------------------------------------------------------------

interface Picks {
  template: ShareTemplate;
  pick: number; // which review the Review template shows
  hero: ShareHeroId;
  stats: ShareStatId[];
  showList: boolean;
}

// The Marketing page's grid shows cards at a fraction of their size, so its previews are rasterised
// smaller: `preview=1` at 0.6 (about a third of the pixels), `preview=s` (the S card size) at 0.4.
// Downloads and the popup get full size.
const PREVIEW_SCALES: Record<string, number> = { '1': 0.6, s: 0.4 };

const draw = (node: React.ReactNode, format: Format | PromoFormatId, scale: number) => {
  const { width, height } = format in FORMATS ? FORMATS[format as Format] : PROMO_SIZES[format as PromoFormatId];
  return drawCard(node, width, height, scale);
};

async function renderStats(appId: string | undefined, range: ShareRange, format: Format, theme: Theme, picks: Picks, scale: number): Promise<Buffer | null> {
  switch (picks.template) {
    case 'reach': {
      const data = reachShare(appId, range);
      if (!data) return null;
      const [icons, appIcons] = await Promise.all([Promise.all(data.icons.map(inlineIcon)), Promise.all(data.apps.map((a) => inlineIcon(a.icon)))]);
      return draw(<ReachCard data={data} icons={icons.length ? icons : [null]} appIcons={appIcons} format={format} theme={theme} />, format, scale);
    }
    case 'map': {
      const data = mapShare(appId, range);
      if (!data) return null;
      const icons = await Promise.all(data.icons.map(inlineIcon));
      return draw(<MapCard data={data} icons={icons.length ? icons : [null]} format={format} theme={theme} />, format, scale);
    }
    case 'rating': {
      const data = ratingShare(appId);
      if (!data) return null;
      const icons = await Promise.all(data.icons.map(inlineIcon));
      return draw(<RatingCard data={data} icons={icons.length ? icons : [null]} format={format} theme={theme} />, format, scale);
    }
    case 'review': {
      const data = reviewShare(appId, picks.pick);
      if (!data) return null;
      const [icons, reviewAppIcon] = await Promise.all([Promise.all(data.icons.map(inlineIcon)), inlineIcon(data.review?.appIcon ?? null)]);
      return draw(<ReviewCard data={data} icons={icons.length ? icons : [null]} reviewAppIcon={reviewAppIcon} format={format} theme={theme} />, format, scale);
    }
    case 'milestone': {
      const data = milestoneShare(appId);
      if (!data) return null;
      const icons = await Promise.all(data.icons.map(inlineIcon));
      return draw(<MilestoneCard data={data} icons={icons.length ? icons : [null]} format={format} theme={theme} />, format, scale);
    }
  }
  const full = shareData(appId, range, picks.hero);
  if (!full) return null;
  // Only the tiles you picked, in the order you picked them.
  const stats = picks.stats.map((id) => full.stats.find((s) => s.id === id)).filter((s): s is ShareData['stats'][number] => !!s);
  const data = { ...full, stats, topApps: picks.showList ? full.topApps : [] };
  const [icons, topIcons] = await Promise.all([
    Promise.all(data.icons.map(inlineIcon)),
    Promise.all(data.topApps.map((a) => inlineIcon(a.icon))),
  ]);
  const withIcons = { ...data, topApps: data.topApps.map((a, i) => ({ ...a, iconData: topIcons[i] })) };
  return draw(<OverviewCard data={withIcons} icons={icons.length ? icons : [null]} format={format} theme={theme} showList={picks.showList} />, format, scale);
}

// --- Cards from URL parameters -------------------------------------------------------------

export type CardResult =
  | { ok: true; key: string; etag: string; current: boolean; png: () => Promise<Buffer | null> }
  | { ok: false; status: number; message: string };

const text = (v: string | null, max: number) => (v == null ? undefined : v.slice(0, max));
const etagOf = (key: string) => `"${crypto.createHash('sha1').update(key).digest('hex').slice(0, 20)}"`;

async function promoCard(q: URLSearchParams, template: PromoTemplateId): Promise<CardResult> {
  const appId = q.get('app');
  if (!appId || appId === 'all') return { ok: false, status: 400, message: 'Promo cards are for one app' };
  const accent = `#${q.get('accent') ?? ''}`;
  const o: PromoOptions = {
    template,
    format: (q.get('format') && q.get('format')! in PROMO_FORMATS ? q.get('format') : '4x5') as PromoFormatId,
    style: (q.get('style') && q.get('style')! in PROMO_STYLES ? q.get('style') : 'gradient') as PromoStyleId,
    accent: /^#[0-9a-f]{6}$/i.test(accent) ? accent.toLowerCase() : '#3b82f6',
    frameColor: /^#[0-9a-f]{6}$/i.test(`#${q.get('frame')}`) ? `#${q.get('frame')}`.toLowerCase() : '#2c2c30',
    showBadge: q.get('badge') !== '0',
    showRating: q.get('rating') !== '0',
    // Empty means "use the template's own wording".
    headline: text(q.get('h'), 120) || undefined,
    tagline: text(q.get('sub'), 240) || undefined,
    cta: text(q.get('cta'), 40) || undefined,
    notes: text(q.get('notes'), 1200) || undefined,
    reviewCount: q.get('n') === '1' ? 1 : 3,
    quotes: (q.get('quotes') ?? '').split(',').filter((v) => /^\d{1,2}$/.test(v)).map(Number).slice(0, 3),
  };
  const scale = PREVIEW_SCALES[q.get('preview') ?? ''] ?? 1;
  // The picked screenshots (studio screens or App Store ones), else the app's defaults; previews
  // embed smaller copies.
  const picked = (q.get('shots') ?? '').split(',').filter((id) => /^(s:[\w-]{1,40}|a:\d{1,2})$/.test(id)).slice(0, 10);
  const shots = await promoShots(appId, picked.length ? picked : (await promoScreens(appId)).defaults, scale < 1 ? PREVIEW_SHOT_WIDTH : SHOT_WIDTH);
  // The listing and the screenshots are part of the key, so a new release or screenshot re-renders.
  const l = await listing(appId);
  const key = [RENDER_VERSION, 'promo', shareDataVersion(), l?.version, l?.versionDate, appId, shots.key, scale, ...Object.values(o)].join('|');
  const current = q.get('v') === (await promoVersion(appId));
  return {
    ok: true, key, etag: etagOf(key), current,
    png: () =>
      cachedPng(key, async () => {
        const [data, screenshots] = await Promise.all([promoData(appId), shots.load()]);
        if (!data) return null;
        const icon = await inlineLargeIcon(data.icon);
        return draw(<PromoCard data={data} images={{ icon, screenshots }} o={o} />, o.format, scale);
      }),
  };
}

/** The card a request asks for: its key and ETag at once, its PNG when `png()` is called. */
export async function cardFor(q: URLSearchParams): Promise<CardResult> {
  const t = q.get('t');
  if (t && t in PROMO_TEMPLATES) return promoCard(q, t as PromoTemplateId);
  const appParam = q.get('app');
  const appId = appParam && appParam !== 'all' ? appParam : undefined;
  const range: ShareRange = isShareRange(q.get('range')) ? (q.get('range') as ShareRange) : '30d';
  const format = (q.get('format') && q.get('format')! in FORMATS ? q.get('format') : '4x5') as Format;
  const themeId = (q.get('theme') && q.get('theme')! in THEMES ? q.get('theme') : 'dark') as keyof typeof THEMES;

  const statsParam = q.get('stats');
  const picks: Picks = {
    template: (q.get('t') && q.get('t')! in SHARE_TEMPLATES ? q.get('t') : 'overview') as ShareTemplate,
    pick: Math.max(0, Math.min(1000, Number(q.get('pick')) || 0)),
    stats: statsParam === null ? (Object.keys(SHARE_STATS) as ShareStatId[]) : (statsParam.split(',').filter((s) => s in SHARE_STATS) as ShareStatId[]),
    showList: q.get('list') !== '0',
    hero: (q.get('hero') && q.get('hero')! in SHARE_HEROES ? q.get('hero') : 'first_time') as ShareHeroId,
  };

  const scale = PREVIEW_SCALES[q.get('preview') ?? ''] ?? 1;
  const key = [RENDER_VERSION, shareDataVersion(), appId || 'all', range, format, themeId, picks.template, picks.pick, picks.hero, picks.stats.join(','), picks.showList, scale].join('|');
  return {
    ok: true, key, etag: etagOf(key), current: q.get('v') === statsVersion(),
    png: () => cachedPng(key, () => renderStats(appId, range, format, THEMES[themeId], picks, scale)),
  };
}
