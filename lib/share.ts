// Data for the social share cards: one summary per app (or for all apps) over a range.

import { getUiPrefs } from './config';
import { dataVersion } from './cache';
import { addMonths, MONTH_RANGE, resolveRange } from './dates';
import { appLeaderboard, dashboard, dataBounds, HistoryGranularity, listApps, reach, reviews, storePresence } from './queries';
import { TERRITORY_BY_CODE } from './territories';
import { monthRangeLabel, SHARE_HEROES, type ShareHeroId, type ShareStatId, type ShareTemplateId } from './prefs';

const HERO_ICONS: Record<ShareHeroId, ShareIcon> = { first_time: 'download', downloads: 'download', proceeds: 'dollar', impressions: 'eye', page_views: 'pointer' };
const ENGAGEMENT_HEROES: ShareHeroId[] = ['impressions', 'page_views'];

type Sums = { first_time: number; redownloads: number; proceeds: number; impressions: number; page_views: number };
function heroMetric(id: ShareHeroId, t: Sums | null | undefined): number | undefined {
  if (!t) return undefined;
  return id === 'downloads' ? t.first_time + t.redownloads : t[id];
}

export const SHARE_RANGES = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '365d': 'Last 12 months',
  ytd: 'Year to date',
  all: 'All time',
} as const;
export type ShareRange = keyof typeof SHARE_RANGES | `m:${string}`;

export function isShareRange(r: string | null): r is ShareRange {
  return !!r && (r in SHARE_RANGES || MONTH_RANGE.test(r));
}

export type ShareIcon = 'download' | 'refresh' | 'dollar' | 'star' | 'eye' | 'pointer' | 'bag' | 'trophy' | 'globe' | 'update';

export interface ShareStat {
  id: ShareStatId;
  icon: ShareIcon;
  label: string;
  value: string;
  change: number | null;       // % vs previous period, like the dashboard KPIs
  delta?: string;              // set instead when the previous period was 0 (no % exists), e.g. "+12"
  hint?: string;
}

export interface ShareData {
  title: string;
  subtitle: string;            // e.g. "2.5K downloads all time"
  icons: string[];             // one for an app; up to four for All Apps
  rangeLabel: string;
  period: string;              // e.g. "Sep 8 – Oct 7, 2026"
  hero: { label: string; icon: ShareIcon; value: string; change: number | null; delta?: string };
  compareLabel: string;        // "vs prev. 30 days"
  series: { date: string; value: number }[];
  seriesLabel: string;
  granularity: HistoryGranularity;
  stats: ShareStat[];          // most interesting first
  markets: { code: string; name: string; downloads: number; share: number }[];
  topApps: { name: string; icon: string | null; downloads: number }[];
}

const compact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const money = (n: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: n >= 10000 ? 1 : n < 100 ? 2 : 0 }).format(n);
  } catch {
    return `${Math.round(n)} ${currency}`;
  }
};
const day = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
function heroValue(id: ShareHeroId, t: Sums, currency: string, pending: boolean): string {
  if (pending && ENGAGEMENT_HEROES.includes(id)) return '—';
  const v = heroMetric(id, t) ?? 0;
  return id === 'proceeds' ? money(v, currency) : v.toLocaleString('en-US');
}

/** % change vs the previous period: 0% when both are zero; none when there's nothing to compare with. */
const pct = (now: number, before: number | undefined | null) => {
  if (before == null) return null;
  if (before === 0) return now === 0 ? 0 : null;
  return ((now - before) / before) * 100;
};

function granularityFor(range: ShareRange): HistoryGranularity {
  if (range === '30d' || range === '90d' || range.startsWith('m:')) return 'day';
  if (range === '365d' || range === 'ytd') return 'week';
  return 'month';
}

/** Cache key part for rendered cards: the data version plus the display currency. */
export function shareDataVersion(): string {
  return `${dataVersion()}|${getUiPrefs().currency}`;
}

export function shareData(appId: string | undefined, range: ShareRange, heroId: ShareHeroId = 'first_time'): ShareData | null {
  const apps = listApps();
  const app = appId ? apps.find((a: any) => a.apple_id === appId) : null;
  if (appId && !app) return null;
  const visible = apps.filter((a: any) => !a.hidden);
  const currency = getUiPrefs().currency;

  const { start, end } = resolveRange(range);
  const granularity = granularityFor(range);
  const d = dashboard({ appId, start, end }, granularity, currency, true, range);
  const month = range.match(MONTH_RANGE)?.[1];
  const store = storePresence(appId).summary;
  const t = d.totals;
  const p = d.previous;

  const first = dataBounds(appId).first; // includes yearly history
  const sameYear = start?.slice(0, 4) === end?.slice(0, 4);
  const period =
    range === 'all'
      ? first ? `Since ${first.slice(0, 4)}` : ''
      : `${day(start!, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })} – ${day(end!, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  // All-time charts are monthly, which only reaches back as far as Apple's daily/monthly reports.
  const seriesFrom = range === 'all' && d.history[0] ? ` since ${day(d.history[0].date, { month: 'short', year: 'numeric' })}` : '';

  // Every tile is always available, zeros included (the card picker decides what shows).
  // Rating and chart rank have no meaningful zero, so those show "—" until there is one;
  // impressions show "—" until Apple has delivered the first analytics reports.
  const pending = d.engagementPending;
  const reachData = reach({ start, end });
  const reachEntry = appId ? reachData.apps[appId] : reachData.all;
  // A % change from 0 doesn't exist; then the card shows the increase itself ("+12 from 0").
  const vs = (now: number, before: number | undefined | null, fmt: (n: number) => string = compact) => {
    const change = pct(now, before);
    return change == null && before === 0 && now > 0 ? { change, delta: `+${fmt(now)}` } : { change };
  };
  const stats: ShareStat[] = [
    { id: 'proceeds', icon: 'dollar', label: 'Proceeds', value: money(t.proceeds, currency), ...vs(t.proceeds, p?.proceeds, (n) => money(n, currency)) },
    store.rating != null && store.rating_count > 0
      ? { id: 'rating', icon: 'star', label: 'Average Rating', value: store.rating.toFixed(2), change: null, hint: `${compact(store.rating_count)} rating${store.rating_count === 1 ? '' : 's'}` }
      : { id: 'rating', icon: 'star', label: 'Average Rating', value: '—', change: null, hint: '0 ratings' },
    pending
      ? { id: 'impressions', icon: 'eye', label: 'Impressions', value: '—', change: null, hint: 'Not available yet' }
      : { id: 'impressions', icon: 'eye', label: 'Impressions', value: compact(t.impressions), ...vs(t.impressions, p?.impressions) },
    pending
      ? { id: 'pageViews', icon: 'pointer', label: 'Product Page Views', value: '—', change: null, hint: 'Not available yet' }
      : { id: 'pageViews', icon: 'pointer', label: 'Product Page Views', value: compact(t.page_views), ...vs(t.page_views, p?.page_views) },
    { id: 'redownloads', icon: 'refresh', label: 'Redownloads', value: compact(t.redownloads), ...vs(t.redownloads, p?.redownloads) },
    { id: 'iap', icon: 'bag', label: 'In-App Purchases', value: compact(t.iap), ...vs(t.iap, p?.iap) },
    { id: 'bestRank', icon: 'trophy', label: 'Best Chart Rank', value: store.best_rank ? `#${store.best_rank}` : '—', change: null, hint: store.best_rank ? 'Any chart, any country' : 'Not in a top chart' },
    { id: 'storefronts', icon: 'globe', label: 'Storefronts', value: String(store.storefronts), change: null, hint: 'of 175' },
    { id: 'reach', icon: 'globe', label: 'Countries Reached', value: `${reachEntry?.count ?? 0} / ${reachData.total}`, change: null, hint: reachEntry?.newInRange ? `${reachEntry.newInRange} new this period` : 'storefronts with downloads' },
    { id: 'updates', icon: 'update', label: 'Updates', value: compact(t.updates), ...vs(t.updates, p?.updates) },
  ];

  const totalDownloads = d.territories.reduce((n: number, c: any) => n + c.first_time + c.redownloads, 0);
  const markets = d.territories
    .map((c: any) => ({ code: c.country_code as string, downloads: (c.first_time + c.redownloads) as number }))
    .filter((c) => c.code && c.downloads > 0)
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, 5)
    .map((c) => ({ ...c, name: TERRITORY_BY_CODE[c.code]?.name ?? c.code, share: totalDownloads ? c.downloads / totalDownloads : 0 }));

  const byId = new Map(apps.map((a: any) => [a.apple_id, a]));
  const topApps = appId
    ? []
    : appLeaderboard({ start, end }, currency)
        .filter((r) => r.first_time > 0 && byId.has(r.apple_id) && !(byId.get(r.apple_id) as any).hidden)
        .slice(0, 5)
        .map((r) => {
          const a: any = byId.get(r.apple_id);
          return { name: a.name.split(':')[0], icon: a.icon_url, downloads: r.first_time };
        });

  const allTime = app ? app.first_time_downloads : visible.reduce((n: number, a: any) => n + a.first_time_downloads, 0);
  return {
    title: app ? app.name.split(':')[0] : 'All Apps',
    subtitle: app ? `${compact(allTime)} downloads all time` : `${visible.length} apps · ${compact(allTime)} downloads all time`,
    icons: (app ? [app.icon_url] : visible.map((a: any) => a.icon_url)).filter(Boolean).slice(0, 4),
    rangeLabel: month ? monthRangeLabel(range) : SHARE_RANGES[range as keyof typeof SHARE_RANGES],
    period,
    hero: { label: SHARE_HEROES[heroId], icon: HERO_ICONS[heroId], value: heroValue(heroId, t, currency, pending), ...(pending && ENGAGEMENT_HEROES.includes(heroId) ? { change: null } : vs(heroMetric(heroId, t) ?? 0, heroMetric(heroId, p), heroId === 'proceeds' ? (n) => money(n, currency) : compact)) },
    compareLabel: month
      ? `vs ${monthRangeLabel('m:' + addMonths(month, -1), 'short').split(' ')[0]}`
      : range === 'all' ? '' : range === 'ytd' ? 'vs prev.' : `vs prev. ${SHARE_RANGES[range as keyof typeof SHARE_RANGES].replace('Last ', '')}`,
    // Same measure as the big number above it.
    series: d.history.map((h: any) => ({ date: h.date, value: heroMetric(heroId, h) ?? 0 })),
    seriesLabel: `${granularity === 'day' ? 'Daily' : granularity === 'week' ? 'Weekly' : 'Monthly'} ${SHARE_HEROES[heroId].toLowerCase()}${seriesFrom}`,
    granularity,
    stats,
    markets,
    topApps,
  };
}

// ---------------------------------------------------------------------------------------
// Extra templates: Global Reach, World Map, Rating, Review spotlight, Milestone
// ---------------------------------------------------------------------------------------

export { SHARE_TEMPLATES } from './prefs';
export type ShareTemplate = ShareTemplateId;

interface Base {
  title: string;
  icons: string[];
  appIcon: string | null;
}

function base(appId: string | undefined): Base | null {
  const apps = listApps() as any[];
  const app = appId ? apps.find((a) => a.apple_id === appId) : null;
  if (appId && !app) return null;
  const visible = apps.filter((a) => !a.hidden);
  return {
    title: app ? app.name.split(':')[0] : 'All Apps',
    icons: (app ? [app.icon_url] : visible.map((a) => a.icon_url)).filter(Boolean).slice(0, 4),
    appIcon: app?.icon_url ?? null,
  };
}

function rangeText(range: ShareRange, start?: string, end?: string) {
  const month = range.match(MONTH_RANGE)?.[1];
  const label = month ? monthRangeLabel(range) : SHARE_RANGES[range as keyof typeof SHARE_RANGES];
  if (!start || !end) return label;
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${label} · ${day(start, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })} – ${day(end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

const firstSeen = (d: string) => (d.endsWith('-01-01') ? d.slice(0, 4) : day(d, { month: 'short', year: 'numeric' }));

export interface ReachShare extends Base {
  subtitle: string;
  count: number;
  total: number;
  newInRange: number;
  newLabel: string;               // "in the last 90 days", "in September 2026", "this year"
  reached: string[];
  newCodes: string[];
  apps: { name: string; icon: string | null; count: number }[];        // All Apps only
  latest: { code: string; name: string; when: string }[];              // single app only
}

export function reachShare(appId: string | undefined, range: ShareRange): ReachShare | null {
  const b = base(appId);
  if (!b) return null;
  const { start, end } = resolveRange(range);
  const r = reach({ start, end });
  const entry = appId ? r.apps[appId] : r.all;
  const countries = entry?.countries ?? {};
  const isNew = (d: string) => !!start && d >= start && (!end || d <= end);
  const apps = (listApps() as any[]).filter((a) => !a.hidden);
  return {
    ...b,
    subtitle: 'Global reach · all time',
    count: entry?.count ?? 0,
    total: r.total,
    newInRange: entry?.newInRange ?? 0,
    newLabel: range === 'all' ? '' : range === 'ytd' ? 'this year' : MONTH_RANGE.test(range) ? `in ${monthRangeLabel(range)}` : `in the ${rangeText(range).toLowerCase()}`,
    reached: Object.keys(countries),
    newCodes: Object.entries(countries).filter(([, d]) => isNew(d)).map(([c]) => c),
    apps: appId
      ? []
      : apps
          .map((a) => ({ name: a.name.split(':')[0], icon: a.icon_url, count: r.apps[a.apple_id]?.count ?? 0 }))
          .sort((x, y) => y.count - x.count),
    latest: appId
      ? Object.entries(countries)
          .sort((x, y) => y[1].localeCompare(x[1]))
          .slice(0, 5)
          .map(([code, d]) => ({ code, name: TERRITORY_BY_CODE[code]?.name ?? code, when: firstSeen(d) }))
      : [],
  };
}

export interface MapShare extends Base {
  subtitle: string;
  downloads: number;
  countries: number;
  pins: { code: string; value: number }[];
  markets: { code: string; name: string; downloads: number; share: number }[];
}

export function mapShare(appId: string | undefined, range: ShareRange): MapShare | null {
  const b = base(appId);
  if (!b) return null;
  const { start, end } = resolveRange(range);
  const d = dashboard({ appId, start, end }, 'month', getUiPrefs().currency, false, range);
  const pins = (d.territories as any[])
    // First-time downloads only (new customers), like the dashboard map.
    .map((t) => ({ code: t.country_code as string, value: t.first_time as number }))
    .filter((t) => t.code && t.value > 0)
    .sort((x, y) => y.value - x.value);
  const downloads = pins.reduce((n, p) => n + p.value, 0);
  return {
    ...b,
    subtitle: rangeText(range, start, end),
    downloads,
    countries: pins.length,
    pins,
    markets: pins.slice(0, 5).map((p) => ({ ...p, downloads: p.value, name: TERRITORY_BY_CODE[p.code]?.name ?? p.code, share: downloads ? p.value / downloads : 0 })),
  };
}

export interface RatingShare extends Base {
  rating: number | null;
  ratingCount: number;
  storefronts: number;
  distribution: { stars: number; count: number }[]; // from written reviews, 5 → 1
  reviewCount: number;
  top: { code: string; name: string; rating: number; count: number }[];
}

export function ratingShare(appId: string | undefined): RatingShare | null {
  const b = base(appId);
  if (!b) return null;
  const store = storePresence(appId);
  const rv = reviews({ appId, limit: 1, offset: 0 });
  const dist = new Map((rv.distribution as { rating: number; n: number }[]).map((r) => [r.rating, r.n]));
  return {
    ...b,
    rating: store.summary.rating,
    ratingCount: store.summary.rating_count,
    storefronts: store.summary.rated_storefronts,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: dist.get(stars) ?? 0 })),
    reviewCount: rv.total,
    top: (store.countries as any[])
      .filter((c) => c.rating != null && c.rating_count > 0)
      .sort((x, y) => y.rating_count - x.rating_count || y.rating - x.rating)
      .slice(0, 5)
      .map((c) => ({ code: c.country_code, name: TERRITORY_BY_CODE[c.country_code]?.name ?? c.country_code, rating: c.rating, count: c.rating_count })),
  };
}

export interface ReviewShare extends Base {
  review: { rating: number; title: string; body: string; reviewer: string; country: string; date: string; appName: string; appIcon: string | null } | null;
  available: number; // how many spotlight-worthy reviews there are to cycle through
  rating: number | null;
  ratingCount: number;
}

// The card font has no emoji, so they're dropped from quoted text rather than drawn as boxes.
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u200D\uFE0F\u20E3]/gu;
const plain = (text: string) => text.replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ').trim();

/** The pick-th best recent review: 5★ (then 4★) with enough text to quote, newest first. */
export function reviewShare(appId: string | undefined, pick: number): ReviewShare | null {
  const b = base(appId);
  if (!b) return null;
  const apps = new Map((listApps() as any[]).map((a) => [a.apple_id, a]));
  const usable = (r: any) => (r.body || '').trim().length >= 20 && (r.body || '').length <= 600;
  let items = (reviews({ appId, rating: 5, limit: 100, offset: 0 }).items as any[]).filter(usable);
  if (!items.length) items = (reviews({ appId, rating: 4, limit: 100, offset: 0 }).items as any[]).filter(usable);
  const r = items.length ? items[((pick % items.length) + items.length) % items.length] : null;
  const store = storePresence(appId).summary;
  const app = r ? apps.get(r.apple_id) : null;
  return {
    ...b,
    review: r && {
      rating: r.rating,
      title: plain(r.title || ''),
      body: plain(r.body),
      reviewer: plain(r.reviewer || '') || 'App Store reviewer',
      country: TERRITORY_BY_CODE[r.country_code]?.name ?? r.country_code ?? '',
      date: day(String(r.created_date).slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' }),
      appName: app ? app.name.split(':')[0] : '',
      appIcon: app?.icon_url ?? null,
    },
    available: items.length,
    rating: store.rating,
    ratingCount: store.rating_count,
  };
}

export interface MilestoneShare extends Base {
  downloads: number;
  milestone: number;  // downloads rounded down to two significant digits
  countries: number;
  totalCountries: number;
  rating: number | null;
  ratingCount: number;
  since: string | null;
  apps: number;
}

export function milestoneShare(appId: string | undefined): MilestoneShare | null {
  const b = base(appId);
  if (!b) return null;
  const all = dashboard({ appId }, 'year', getUiPrefs().currency, false, 'all');
  const downloads = all.totals.first_time;
  const pow = downloads >= 100 ? 10 ** (Math.floor(Math.log10(downloads)) - 1) : 1;
  const r = reach({});
  const store = storePresence(appId).summary;
  const first = dataBounds(appId).first;
  return {
    ...b,
    downloads,
    milestone: Math.floor(downloads / pow) * pow,
    countries: (appId ? r.apps[appId]?.count : r.all.count) ?? 0,
    totalCountries: r.total,
    rating: store.rating,
    ratingCount: store.rating_count,
    since: first ? first.slice(0, 4) : null,
    apps: appId ? 1 : (listApps() as any[]).filter((a) => !a.hidden).length,
  };
}
