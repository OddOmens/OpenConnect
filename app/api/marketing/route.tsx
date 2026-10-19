import satori from 'satori';
import { guard } from '@/lib/auth';
import { Resvg } from '@resvg/resvg-js';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  isShareRange, mapShare, milestoneShare, ratingShare, reachShare, reviewShare, SHARE_TEMPLATES, ShareData, ShareRange, ShareTemplate, shareData, shareDataVersion,
} from '@/lib/share';
import { FORMATS, Format, THEMES, Theme, inlineIcon, inlineImage, inlineLargeIcon, loadFonts } from '@/lib/share-render/kit';
import { OverviewCard } from '@/lib/share-render/overview';
import { MapCard, MilestoneCard, RatingCard, ReachCard, ReviewCard } from '@/lib/share-render/templates';
import { PromoCard, PROMO_SIZES, PromoOptions } from '@/lib/share-render/promo';
import { listing, promoData } from '@/lib/marketing';
import { loadPromoScreens, promoScreens } from '@/lib/promo-screens';
import {
  PROMO_FORMATS, PROMO_STYLES, PROMO_TEMPLATES, PromoFormatId, PromoStyleId, PromoTemplateId, SHARE_HEROES, SHARE_STATS, ShareHeroId, ShareStatId,
} from '@/lib/prefs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Marketing cards rendered to PNG. Stats cards, styled like the dashboard:
//   /api/marketing?app=<id|all>&t=overview|reach|map|rating|review|milestone&range=30d&format=4x5&theme=dark
// Promo cards for one app, from its App Store listing:
//   /api/marketing?app=<id>&t=launch|update|screens|loved|reviews|download&format=1x1|4x5|9x16|16x9&style=gradient&accent=3b82f6
//     &badge=1&rating=1&h=<headline>&sub=<tagline>&cta=<button text>&notes=<release notes>
//     &quotes=<review indexes, first in front>&n=1|3 (Reviews)
// Layout is done by satori and rasterised by native resvg (much cheaper than next/og's
// WebAssembly build). Cards are still rendered one at a time and cached until the data
// behind them changes (a sync, hiding an app, a new day).

// --- Rendered PNG cache + one-at-a-time render queue -------------------------------

// Part of every card's cache key and ETag: the build, so a new deploy never serves (or lets a
// browser keep, via 304) a card drawn by older code. Falls back to the start time in dev.
const RENDER_VERSION = (() => {
  try {
    return fs.readFileSync(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
  } catch {
    return `dev-${Date.now()}`;
  }
})();
const MAX_CACHED = 48;
const pngCache = new Map<string, Buffer>();
let queue: Promise<unknown> = Promise.resolve();

function serially<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

function remember(key: string, png: Buffer) {
  pngCache.delete(key);
  pngCache.set(key, png);
  while (pngCache.size > MAX_CACHED) pngCache.delete(pngCache.keys().next().value!);
}

interface Picks {
  template: ShareTemplate;
  pick: number; // which review the Review template shows
  hero: ShareHeroId;
  stats: ShareStatId[];
  showList: boolean;
}

const svgToPng = async (node: React.ReactNode, format: Format | PromoFormatId) => {
  const { width, height } = format in FORMATS ? FORMATS[format as Format] : PROMO_SIZES[format as PromoFormatId];
  const svg = await satori(node as React.ReactElement, { width, height, fonts: loadFonts() });
  return new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng();
};

async function render(appId: string | undefined, range: ShareRange, format: Format, theme: Theme, picks: Picks): Promise<Buffer | null> {
  switch (picks.template) {
    case 'reach': {
      const data = reachShare(appId, range);
      if (!data) return null;
      const [icons, appIcons] = await Promise.all([Promise.all(data.icons.map(inlineIcon)), Promise.all(data.apps.map((a) => inlineIcon(a.icon)))]);
      return svgToPng(<ReachCard data={data} icons={icons.length ? icons : [null]} appIcons={appIcons} format={format} theme={theme} />, format);
    }
    case 'map': {
      const data = mapShare(appId, range);
      if (!data) return null;
      const icons = await Promise.all(data.icons.map(inlineIcon));
      return svgToPng(<MapCard data={data} icons={icons.length ? icons : [null]} format={format} theme={theme} />, format);
    }
    case 'rating': {
      const data = ratingShare(appId);
      if (!data) return null;
      const icons = await Promise.all(data.icons.map(inlineIcon));
      return svgToPng(<RatingCard data={data} icons={icons.length ? icons : [null]} format={format} theme={theme} />, format);
    }
    case 'review': {
      const data = reviewShare(appId, picks.pick);
      if (!data) return null;
      const [icons, reviewAppIcon] = await Promise.all([Promise.all(data.icons.map(inlineIcon)), inlineIcon(data.review?.appIcon ?? null)]);
      return svgToPng(<ReviewCard data={data} icons={icons.length ? icons : [null]} reviewAppIcon={reviewAppIcon} format={format} theme={theme} />, format);
    }
    case 'milestone': {
      const data = milestoneShare(appId);
      if (!data) return null;
      const icons = await Promise.all(data.icons.map(inlineIcon));
      return svgToPng(<MilestoneCard data={data} icons={icons.length ? icons : [null]} format={format} theme={theme} />, format);
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
  return svgToPng(<OverviewCard data={withIcons} icons={icons.length ? icons : [null]} format={format} theme={theme} showList={picks.showList} />, format);
}

async function renderPromo(appId: string, o: PromoOptions, screenshots: { src: string; ratio: number }[]): Promise<Buffer | null> {
  const data = await promoData(appId);
  if (!data) return null;
  const icon = await inlineLargeIcon(data.icon);
  return svgToPng(<PromoCard data={data} images={{ icon, screenshots }} o={o} />, o.format);
}

const text = (v: string | null, max: number) => (v == null ? undefined : v.slice(0, max));

async function promoResponse(request: Request, q: URLSearchParams, template: PromoTemplateId) {
  const appId = q.get('app');
  if (!appId || appId === 'all') return new Response('Promo cards are for one app', { status: 400 });
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
  // The picked screenshots (studio screens or App Store ones), else the app's defaults.
  const picked = (q.get('shots') ?? '').split(',').filter((id) => /^(s:[\w-]{1,40}|a:\d{1,2})$/.test(id)).slice(0, 10);
  const shots = await loadPromoScreens(appId, picked.length ? picked : (await promoScreens(appId)).defaults);
  // The listing and the screenshots are part of the key, so a new release or screenshot re-renders.
  const l = await listing(appId);
  const key = [RENDER_VERSION, 'promo', shareDataVersion(), l?.version, l?.versionDate, appId, shots.key, ...Object.values(o)].join('|');
  return respond(request, key, () => renderPromo(appId, o, shots.images));
}

async function respond(request: Request, key: string, make: () => Promise<Buffer | null>) {
  const etag = `"${crypto.createHash('sha1').update(key).digest('hex').slice(0, 20)}"`;
  const headers = { 'Content-Type': 'image/png', ETag: etag, 'Cache-Control': 'private, no-cache' };
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });

  let png = pngCache.get(key);
  if (!png) {
    // Re-check inside the queue: an identical request may have rendered it while we waited.
    const rendered = await serially(async () => pngCache.get(key) ?? make());
    if (!rendered) return new Response('Unknown app', { status: 404 });
    png = rendered;
    remember(key, png);
  }
  return new Response(new Uint8Array(png), { headers });
}

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const q = new URL(request.url).searchParams;
  const t = q.get('t');
  if (t && t in PROMO_TEMPLATES) return promoResponse(request, q, t as PromoTemplateId);
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

  const key = [RENDER_VERSION, shareDataVersion(), appId || 'all', range, format, themeId, picks.template, picks.pick, picks.hero, picks.stats.join(','), picks.showList].join('|');
  return respond(request, key, () => render(appId, range, format, THEMES[themeId], picks));
}
