// Data for the social share cards: one summary per app (or for all apps) over a range.

import { getUiPrefs } from './config';
import { dataVersion } from './cache';
import { addMonths, MONTH_RANGE, resolveRange } from './dates';
import { appLeaderboard, dashboard, dataBounds, HistoryGranularity, listApps, storePresence } from './queries';
import { TERRITORY_BY_CODE } from './territories';
import { monthRangeLabel, SHARE_HEROES, type ShareHeroId, type ShareStatId } from './prefs';

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
