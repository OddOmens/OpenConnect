// "What changed" report for each sync run.
//
// Before a job starts we take a small snapshot of the numbers it can touch; when it ends we
// take another and diff the two. Sales reports also record, per report date, what that date
// held before and after it was replaced, so revised days show up individually.
// Proceeds are kept per currency in both snapshots and converted with the same (latest)
// rates at the end, so an exchange-rate refresh during the run never reads as a change.

import { getDb } from './db';
import { getUiPrefs } from './config';
import { CHARTS, ChartId } from './prefs';
import { territoryName } from './territories';
import type { JobId } from './sync';

type Money = Record<string, number>; // currency -> amount

export interface ReportMetric {
  label: string;
  before: number;
  after: number;
  format: 'int' | 'money' | 'rating';
}

export interface ReportItem {
  tag: 'new' | 'revised' | 'up' | 'down' | 'dropped' | 'reply';
  title: string;
  detail?: string;
}

export interface ReportSection {
  title: string;
  metrics?: ReportMetric[];
  items?: ReportItem[];
  /** Items left out of `items` to keep the report readable. */
  more?: number;
}

export interface SyncReport {
  job: JobId;
  trigger: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  currency: string;
  changed: boolean;
  sections: ReportSection[];
  errors: string[];
}

const MAX_ITEMS = 40;

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

interface AppTotals {
  downloads: number;
  redownloads: number;
  updates: number;
  iap: number;
  proceeds: Money;
}

interface AscSnapshot {
  apps: Map<string, string>; // apple id -> name
  sales: Map<string, AppTotals>;
  impressions: number;
  pageViews: number;
  activeSubs: { date: string | null; count: number };
  subEvents: number;
  reviewRowid: number;
  replies: Map<string, string>; // review id -> response date
}

interface StoreSnapshot {
  ratings: Map<string, { count: number; avg: number | null }>;
  rankDate: string | null;
  ranks: Map<string, number>; // app|country|chart|genre -> rank
}

export type Snapshot = { job: 'asc'; data: AscSnapshot } | { job: 'store'; data: StoreSnapshot };

function emptyTotals(): AppTotals {
  return { downloads: 0, redownloads: 0, updates: 0, iap: 0, proceeds: {} };
}

function snapshotAsc(): AscSnapshot {
  const db = getDb();
  const apps = new Map(
    (db.prepare(`SELECT apple_id, name FROM apps`).all() as { apple_id: string; name: string }[]).map((a) => [a.apple_id, a.name])
  );

  const sales = new Map<string, AppTotals>();
  const rows = db
    .prepare(`SELECT apple_id, category, proceeds_currency AS cur, SUM(units) AS units, SUM(units * proceeds_per_unit) AS amount
              FROM sales GROUP BY apple_id, category, proceeds_currency`)
    .all() as { apple_id: string; category: string; cur: string; units: number; amount: number }[];
  for (const r of rows) {
    const t = sales.get(r.apple_id) || emptyTotals();
    if (r.category === 'download') t.downloads += r.units;
    else if (r.category === 'redownload') t.redownloads += r.units;
    else if (r.category === 'update') t.updates += r.units;
    else if (r.category === 'iap') t.iap += r.units;
    if (r.amount) t.proceeds[r.cur || 'USD'] = (t.proceeds[r.cur || 'USD'] || 0) + r.amount;
    sales.set(r.apple_id, t);
  }

  const eng = db
    .prepare(`SELECT COALESCE(SUM(CASE WHEN lower(event) = 'impression' THEN counts END), 0) AS impressions,
                     COALESCE(SUM(CASE WHEN lower(event) = 'page view' AND lower(page_type) = 'product page' THEN counts END), 0) AS page_views
              FROM engagement`)
    .get() as { impressions: number; page_views: number };

  const subDate = (db.prepare(`SELECT MAX(date) AS d FROM sub_snapshot`).get() as { d: string | null }).d;
  const subCount = subDate
    ? (db.prepare(`SELECT COALESCE(SUM(active_standard + active_trial + active_intro + active_promo), 0) AS n FROM sub_snapshot WHERE date = ?`)
        .get(subDate) as { n: number }).n
    : 0;
  const subEvents = (db.prepare(`SELECT COALESCE(SUM(quantity), 0) AS n FROM sub_events`).get() as { n: number }).n;

  const reviewRowid = (db.prepare(`SELECT COALESCE(MAX(rowid), 0) AS n FROM reviews`).get() as { n: number }).n;
  const replies = new Map(
    (db.prepare(`SELECT id, response_date FROM reviews WHERE response_body IS NOT NULL`).all() as { id: string; response_date: string }[])
      .map((r) => [r.id, r.response_date || ''])
  );

  return {
    apps,
    sales,
    impressions: eng.impressions,
    pageViews: eng.page_views,
    activeSubs: { date: subDate, count: subCount },
    subEvents,
    reviewRowid,
    replies,
  };
}

function snapshotStore(): StoreSnapshot {
  const db = getDb();
  // Each app's newest rating in every storefront, combined into one count and average.
  const ratings = new Map(
    (db.prepare(`
      SELECT r.apple_id, SUM(r.rating_count) AS count,
             SUM(r.avg_rating * r.rating_count) / NULLIF(SUM(CASE WHEN r.avg_rating IS NOT NULL THEN r.rating_count END), 0) AS avg
      FROM ratings r
      WHERE r.date = (SELECT MAX(date) FROM ratings x WHERE x.apple_id = r.apple_id AND x.country_code = r.country_code)
      GROUP BY r.apple_id`).all() as { apple_id: string; count: number; avg: number | null }[])
      .map((r) => [r.apple_id, { count: r.count || 0, avg: r.avg }])
  );
  const rankDate = (db.prepare(`SELECT MAX(date) AS d FROM rankings`).get() as { d: string | null }).d;
  const ranks = new Map<string, number>();
  if (rankDate) {
    const rows = db.prepare(`SELECT apple_id, country_code, chart, genre_id, rank FROM rankings WHERE date = ?`).all(rankDate) as {
      apple_id: string; country_code: string; chart: string; genre_id: string; rank: number;
    }[];
    for (const r of rows) ranks.set(`${r.apple_id}|${r.country_code}|${r.chart}|${r.genre_id}`, r.rank);
  }
  return { ratings, rankDate, ranks };
}

export function takeSnapshot(job: JobId): Snapshot {
  return job === 'asc' ? { job, data: snapshotAsc() } : { job, data: snapshotStore() };
}

// ---------------------------------------------------------------------------
// Per-date sales revisions (recorded while reports are stored)
// ---------------------------------------------------------------------------

export interface DateFigures {
  rows: number;
  downloads: number;
  redownloads: number;
  updates: number;
  iap: number;
  proceeds: Money;
}

export const NO_FIGURES: DateFigures = { rows: 0, downloads: 0, redownloads: 0, updates: 0, iap: 0, proceeds: {} };

export interface Revision {
  label: string; // 'daily sales' | 'monthly sales'
  date: string;
  before: DateFigures | null;
  after: DateFigures;
}

/** What a sales report date currently holds (a month includes any daily rows inside it). */
export function salesFigures(granularity: 'D' | 'M', date: string): DateFigures | null {
  const where = granularity === 'D' ? `granularity = 'D' AND date = ?` : `granularity IN ('D', 'M') AND substr(date, 1, 7) = ?`;
  const rows = getDb()
    .prepare(`SELECT category, proceeds_currency AS cur, COUNT(*) AS n, SUM(units) AS units, SUM(units * proceeds_per_unit) AS amount
              FROM sales WHERE ${where} GROUP BY category, proceeds_currency`)
    .all(date) as { category: string; cur: string; n: number; units: number; amount: number }[];
  if (!rows.length) return null;
  const f: DateFigures = { ...NO_FIGURES, proceeds: {} };
  for (const r of rows) {
    f.rows += r.n;
    if (r.category === 'download') f.downloads += r.units;
    else if (r.category === 'redownload') f.redownloads += r.units;
    else if (r.category === 'update') f.updates += r.units;
    else if (r.category === 'iap') f.iap += r.units;
    if (r.amount) f.proceeds[r.cur || 'USD'] = (f.proceeds[r.cur || 'USD'] || 0) + r.amount;
  }
  return f;
}

// ---------------------------------------------------------------------------
// Building the report
// ---------------------------------------------------------------------------

function converter(currency: string) {
  const rates = new Map(
    (getDb().prepare(`SELECT currency, per_usd FROM fx_rates`).all() as { currency: string; per_usd: number }[]).map((r) => [r.currency, r.per_usd])
  );
  const target = currency === 'USD' ? 1 : rates.get(currency) ?? 1;
  return (m: Money) => {
    let usd = 0;
    for (const [cur, amount] of Object.entries(m)) usd += amount / (cur === 'USD' ? 1 : rates.get(cur) ?? 1);
    return usd * target;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function fmtInt(n: number) {
  return n.toLocaleString('en-US');
}

function fmtSigned(n: number) {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-US')}`;
}

const NOUNS = { downloads: 'download', redownloads: 're-download', updates: 'update', iap: 'in-app purchase' } as const;
type Counted = keyof typeof NOUNS;

/** "1 download", "+3 updates", ... */
function counted(n: number, what: Counted, signed = false) {
  const noun = Math.abs(n) === 1 ? NOUNS[what] : `${NOUNS[what]}s`;
  return `${signed ? fmtSigned(n) : fmtInt(n)} ${noun}`;
}

/** The unit counts that differ between two sets of figures, e.g. "+2 downloads · +5 updates". */
function unitChanges(x: Record<Counted, number>, y: Record<Counted, number>) {
  return (Object.keys(NOUNS) as Counted[]).filter((k) => y[k] !== x[k]).map((k) => counted(y[k] - x[k], k, true));
}

function fmtMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

function sumTotals(map: Map<string, AppTotals>): AppTotals {
  const t = emptyTotals();
  map.forEach((a) => {
    t.downloads += a.downloads;
    t.redownloads += a.redownloads;
    t.updates += a.updates;
    t.iap += a.iap;
    for (const [cur, v] of Object.entries(a.proceeds)) t.proceeds[cur] = (t.proceeds[cur] || 0) + v;
  });
  return t;
}

function describeFigures(f: DateFigures, money: (m: Money) => number, currency: string) {
  const parts = [counted(f.downloads, 'downloads')];
  for (const k of ['redownloads', 'updates', 'iap'] as const) if (f[k]) parts.push(counted(f[k], k));
  parts.push(fmtMoney(money(f.proceeds), currency));
  return parts.join(' · ');
}

function ascReport(before: AscSnapshot, after: AscSnapshot, revisions: Revision[], currency: string): ReportSection[] {
  const money = converter(currency);
  const sections: ReportSection[] = [];

  // Apps
  const appItems: ReportItem[] = [];
  after.apps.forEach((name, id) => {
    const old = before.apps.get(id);
    if (old === undefined) appItems.push({ tag: 'new', title: name || id, detail: 'New app' });
    else if (old !== name) appItems.push({ tag: 'revised', title: name, detail: `Renamed from “${old}”` });
  });
  if (appItems.length) sections.push({ title: 'Apps', items: appItems });

  // Sales totals, then each app that moved
  const b = sumTotals(before.sales);
  const a = sumTotals(after.sales);
  const metrics: ReportMetric[] = [
    { label: 'Downloads', before: b.downloads, after: a.downloads, format: 'int' },
    { label: 'Re-downloads', before: b.redownloads, after: a.redownloads, format: 'int' },
    { label: 'Updates', before: b.updates, after: a.updates, format: 'int' },
    { label: 'In-app purchases', before: b.iap, after: a.iap, format: 'int' },
    { label: 'Proceeds', before: round2(money(b.proceeds)), after: round2(money(a.proceeds)), format: 'money' },
  ];
  const perApp: ReportItem[] = [];
  const ids = new Set([...before.sales.keys(), ...after.sales.keys()]);
  for (const id of ids) {
    const x = before.sales.get(id) || emptyTotals();
    const y = after.sales.get(id) || emptyTotals();
    const pr = round2(money(y.proceeds) - money(x.proceeds));
    const parts = unitChanges(x, y);
    if (pr) parts.push(`${pr > 0 ? '+' : '−'}${fmtMoney(Math.abs(pr), currency)}`);
    if (!parts.length) continue;
    const net = y.downloads - x.downloads + y.iap - x.iap + pr;
    perApp.push({ tag: net >= 0 ? 'up' : 'down', title: after.apps.get(id) || before.apps.get(id) || id, detail: parts.join(' · ') });
  }
  if (metrics.some((m) => m.before !== m.after) || perApp.length) {
    sections.push({ title: 'Sales totals (all stored data, incl. yearly history)', metrics, items: perApp.slice(0, MAX_ITEMS), more: Math.max(0, perApp.length - MAX_ITEMS) });
  }

  // Report dates: new ones, and ones whose numbers Apple revised
  const added = revisions.filter((r) => !r.before && r.after.rows);
  const revised = revisions.filter((r) => {
    if (!r.before) return false;
    const pb = round2(money(r.before.proceeds));
    const pa = round2(money(r.after.proceeds));
    return r.before.rows !== r.after.rows || unitChanges(r.before, r.after).length > 0 || pb !== pa;
  });
  if (added.length || revised.length) {
    const items: ReportItem[] = [
      ...revised.map((r): ReportItem => ({
        tag: 'revised',
        title: `${r.date} ${r.label}`,
        detail: `${describeFigures(r.before!, money, currency)} → ${describeFigures(r.after, money, currency)}`,
      })),
      ...added
        .sort((x, y) => y.date.localeCompare(x.date))
        .map((r): ReportItem => ({ tag: 'new', title: `${r.date} ${r.label}`, detail: describeFigures(r.after, money, currency) })),
    ];
    sections.push({
      title: `Report dates (${added.length} new, ${revised.length} revised)`,
      items: items.slice(0, MAX_ITEMS),
      more: Math.max(0, items.length - MAX_ITEMS),
    });
  }

  // Impressions & subscriptions
  const other: ReportMetric[] = [];
  if (before.impressions !== after.impressions) other.push({ label: 'Impressions', before: before.impressions, after: after.impressions, format: 'int' });
  if (before.pageViews !== after.pageViews) other.push({ label: 'Product page views', before: before.pageViews, after: after.pageViews, format: 'int' });
  if (before.activeSubs.count !== after.activeSubs.count || before.activeSubs.date !== after.activeSubs.date) {
    other.push({
      label: `Active subscriptions${after.activeSubs.date ? ` (as of ${after.activeSubs.date})` : ''}`,
      before: before.activeSubs.count,
      after: after.activeSubs.count,
      format: 'int',
    });
  }
  if (before.subEvents !== after.subEvents) other.push({ label: 'Subscription events', before: before.subEvents, after: after.subEvents, format: 'int' });
  if (other.length) sections.push({ title: 'Engagement & subscriptions', metrics: other });

  // Reviews
  const db = getDb();
  const fresh = db
    .prepare(`SELECT r.id, r.rating, r.title, r.country_code, r.created_date, a.name FROM reviews r LEFT JOIN apps a ON a.apple_id = r.apple_id
              WHERE r.rowid > ? ORDER BY r.created_date DESC`)
    .all(before.reviewRowid) as { id: string; rating: number; title: string | null; country_code: string; created_date: string; name: string | null }[];
  const reviewItems: ReportItem[] = fresh.map((r) => ({
    tag: 'new',
    title: `${'★'.repeat(Math.max(0, Math.min(5, r.rating)))}${'☆'.repeat(Math.max(0, 5 - r.rating))} ${r.title || '(no title)'}`,
    detail: [r.name, territoryName(r.country_code), r.created_date?.slice(0, 10)].filter(Boolean).join(' · '),
  }));
  const freshIds = new Set(fresh.map((r) => r.id));
  let replies = 0;
  after.replies.forEach((date, id) => {
    if (!freshIds.has(id) && before.replies.get(id) !== date) replies++;
  });
  if (replies) reviewItems.push({ tag: 'reply', title: `${replies} developer ${replies === 1 ? 'response' : 'responses'} added or edited` });
  if (reviewItems.length) {
    sections.push({
      title: `Reviews (${fresh.length} new)`,
      items: reviewItems.slice(0, MAX_ITEMS),
      more: Math.max(0, reviewItems.length - MAX_ITEMS),
    });
  }

  return sections;
}

function storeReport(before: StoreSnapshot, after: StoreSnapshot): ReportSection[] {
  const db = getDb();
  const names = new Map(
    (db.prepare(`SELECT apple_id, name FROM apps`).all() as { apple_id: string; name: string }[]).map((a) => [a.apple_id, a.name])
  );
  const name = (id: string) => names.get(id) || id;
  const sections: ReportSection[] = [];

  // Ratings per app
  const ratingItems: ReportItem[] = [];
  const metrics: ReportMetric[] = [];
  let countBefore = 0;
  let countAfter = 0;
  for (const id of new Set([...before.ratings.keys(), ...after.ratings.keys()])) {
    const x = before.ratings.get(id) || { count: 0, avg: null };
    const y = after.ratings.get(id) || { count: 0, avg: null };
    countBefore += x.count;
    countAfter += y.count;
    const dc = y.count - x.count;
    const da = x.avg != null && y.avg != null ? Math.round((y.avg - x.avg) * 100) / 100 : 0;
    if (!dc && !da) continue;
    const parts = [];
    if (dc) parts.push(`${fmtSigned(dc)} ratings (${fmtInt(y.count)} total)`);
    if (y.avg != null && (da || x.avg == null)) parts.push(`average ${x.avg != null ? `${x.avg.toFixed(2)} → ` : ''}${y.avg.toFixed(2)}`);
    ratingItems.push({ tag: da < 0 ? 'down' : 'up', title: name(id), detail: parts.join(' · ') });
  }
  if (countBefore !== countAfter) metrics.push({ label: 'Ratings, all storefronts', before: countBefore, after: countAfter, format: 'int' });
  if (ratingItems.length || metrics.length) sections.push({ title: 'Ratings', metrics, items: ratingItems });

  // Chart positions: compared with the last day that had any
  const items: (ReportItem & { weight: number })[] = [];
  const label = (key: string) => {
    const [id, cc, chart, genre] = key.split('|');
    const where = genre === '0' ? 'overall' : 'category';
    return `${name(id)} — ${CHARTS[chart as ChartId] || chart} ${where}, ${territoryName(cc)}`;
  };
  for (const [key, rank] of after.ranks) {
    const old = before.ranks.get(key);
    // Listed climbs first, then new entries, falls and drop-outs; biggest moves first in each.
    if (old === undefined) items.push({ tag: 'new', title: label(key), detail: `Entered at #${rank}`, weight: 2000 + 101 - rank });
    else if (old > rank) items.push({ tag: 'up', title: label(key), detail: `#${old} → #${rank}`, weight: 3000 + old - rank });
    else if (old < rank) items.push({ tag: 'down', title: label(key), detail: `#${old} → #${rank}`, weight: 1000 + rank - old });
  }
  for (const [key, rank] of before.ranks) {
    if (!after.ranks.has(key)) items.push({ tag: 'dropped', title: label(key), detail: `Was #${rank}, now outside the top 100`, weight: 101 - rank });
  }
  if (items.length || before.ranks.size !== after.ranks.size) {
    items.sort((x, y) => y.weight - x.weight);
    const since = before.rankDate && before.rankDate !== after.rankDate ? ` since ${before.rankDate}` : '';
    sections.push({
      title: `Chart positions${since}`,
      metrics: [{ label: 'Positions held', before: before.ranks.size, after: after.ranks.size, format: 'int' }],
      items: items.slice(0, MAX_ITEMS).map(({ weight, ...i }) => i),
      more: Math.max(0, items.length - MAX_ITEMS),
    });
  }

  return sections;
}

export function buildReport(
  before: Snapshot,
  revisions: Revision[],
  meta: { trigger: string | null; startedAt: string | null; finishedAt: string | null; errors: string[] }
): SyncReport {
  const currency = getUiPrefs().currency || 'USD';
  const after = takeSnapshot(before.job);
  const sections =
    before.job === 'asc'
      ? ascReport(before.data, (after as { data: AscSnapshot }).data, revisions, currency)
      : storeReport(before.data, (after as { data: StoreSnapshot }).data);
  return { job: before.job, ...meta, currency, changed: sections.length > 0, sections };
}
