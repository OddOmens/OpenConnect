import satori from 'satori';
import { guard } from '@/lib/auth';
import { Resvg } from '@resvg/resvg-js';
import * as crypto from 'crypto';
import {
  isShareRange, mapShare, milestoneShare, ratingShare, reachShare, reviewShare, SHARE_TEMPLATES, ShareData, ShareRange, ShareTemplate, shareData, shareDataVersion,
} from '@/lib/share';
import { FORMATS, Format, THEMES, Theme, inlineIcon, loadFonts } from '@/lib/share-render/kit';
import { OverviewCard } from '@/lib/share-render/overview';
import { MapCard, MilestoneCard, RatingCard, ReachCard, ReviewCard } from '@/lib/share-render/templates';
import { SHARE_HEROES, SHARE_STATS, ShareHeroId, ShareStatId } from '@/lib/prefs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Social share cards rendered to PNG, styled like the dashboard:
//   /api/share?app=<id|all>&t=overview|reach|map|rating|review|milestone&range=30d&format=4x5&theme=dark
// Layout is done by satori and rasterised by native resvg (much cheaper than next/og's
// WebAssembly build). Cards are still rendered one at a time and cached until the data
// behind them changes (a sync, hiding an app, a new day).

// --- Rendered PNG cache + one-at-a-time render queue -------------------------------

const RENDER_VERSION = 20; // bump when the card design changes
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

const svgToPng = async (node: React.ReactNode, format: Format) => {
  const { width, height } = FORMATS[format];
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

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const q = new URL(request.url).searchParams;
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
  const etag = `"${crypto.createHash('sha1').update(key).digest('hex').slice(0, 20)}"`;
  const headers = { 'Content-Type': 'image/png', ETag: etag, 'Cache-Control': 'private, no-cache' };
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });

  let png = pngCache.get(key);
  if (!png) {
    // Re-check inside the queue: an identical request may have rendered it while we waited.
    const rendered = await serially(async () => pngCache.get(key) ?? render(appId, range, format, THEMES[themeId], picks));
    if (!rendered) return new Response('Unknown app', { status: 404 });
    png = rendered;
    remember(key, png);
  }
  return new Response(new Uint8Array(png), { headers });
}
