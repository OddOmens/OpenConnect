import { getDb } from './db';
import { addDays, daysBetween, pacificToday } from './dates';

export interface Filter {
  appId?: string;   // undefined = all visible apps
  start?: string;   // YYYY-MM-DD, inclusive; undefined = beginning of data
  end?: string;     // YYYY-MM-DD, inclusive
}

function appClause(appId: string | undefined, col = 'apple_id'): [string, any[]] {
  return appId ? [`${col} = ?`, [appId]] : [`${col} IN (SELECT apple_id FROM apps WHERE hidden = 0)`, []];
}

/** Daily rows by date; monthly rows (older history) by the month they belong to. */
function salesWhere(f: Filter, includeMonthly = true): [string, any[]] {
  const [app, params] = appClause(f.appId, 's.apple_id');
  const parts = [app];
  const p = [...params];
  if (!includeMonthly) parts.push(`s.granularity = 'D'`);
  if (f.start) {
    parts.push(`(CASE WHEN s.granularity = 'M' THEN substr(s.date, 1, 7) >= substr(?, 1, 7) ELSE s.date >= ? END)`);
    p.push(f.start, f.start);
  }
  if (f.end) {
    parts.push(`s.date <= ?`);
    p.push(f.end);
  }
  return [parts.join(' AND '), p];
}

const PROCEEDS_USD = `s.units * s.proceeds_per_unit / COALESCE(fx.per_usd, 1)`;
const FX_JOIN = `LEFT JOIN fx_rates fx ON fx.currency = s.proceeds_currency`;
const SUMS = `
  COALESCE(SUM(CASE WHEN s.category = 'download' THEN s.units END), 0) AS first_time,
  COALESCE(SUM(CASE WHEN s.category = 'redownload' THEN s.units END), 0) AS redownloads,
  COALESCE(SUM(CASE WHEN s.category = 'update' THEN s.units END), 0) AS updates,
  COALESCE(SUM(CASE WHEN s.category = 'iap' THEN s.units END), 0) AS iap,
  COALESCE(SUM(${PROCEEDS_USD}), 0) AS proceeds_usd`;

export function currencyRate(currency: string): number {
  if (!currency || currency === 'USD') return 1;
  const row = getDb().prepare(`SELECT per_usd FROM fx_rates WHERE currency = ?`).get(currency) as { per_usd: number } | undefined;
  return row?.per_usd ?? 1;
}

export interface Totals {
  first_time: number;
  redownloads: number;
  updates: number;
  iap: number;
  proceeds: number;
}

function totals(f: Filter, rate: number): Totals {
  const [where, params] = salesWhere(f);
  const r = getDb().prepare(`SELECT ${SUMS} FROM sales s ${FX_JOIN} WHERE ${where}`).get(...params) as any;
  return {
    first_time: r.first_time,
    redownloads: r.redownloads,
    updates: r.updates,
    iap: r.iap,
    proceeds: r.proceeds_usd * rate,
  };
}

export function dataBounds(appId?: string): { first: string | null; last: string | null } {
  const [app, params] = appClause(appId, 's.apple_id');
  return getDb().prepare(`SELECT MIN(s.date) AS first, MAX(s.date) AS last FROM sales s WHERE ${app}`).get(...params) as any;
}

function bucketExpr(granularity: string) {
  if (granularity === 'month') return `substr(s.date, 1, 7) || '-01'`;
  if (granularity === 'week') return `date(s.date, '-6 days', 'weekday 1')`;
  return 's.date';
}

function history(f: Filter, granularity: 'day' | 'week' | 'month', rate: number) {
  // Monthly reports can't be split into days/weeks, so they only show in the monthly view.
  const [where, params] = salesWhere(f, granularity === 'month');
  const rows = getDb()
    .prepare(`SELECT ${bucketExpr(granularity)} AS date, ${SUMS} FROM sales s ${FX_JOIN} WHERE ${where} GROUP BY 1 ORDER BY 1`)
    .all(...params) as any[];

  const byDate = new Map(rows.map((r) => [r.date, r]));
  const first = f.start || rows[0]?.date;
  const last = f.end || rows[rows.length - 1]?.date;
  if (!first || !last) return [];

  // Zero-fill so gaps show as gaps, not as interpolated lines.
  const buckets: string[] = [];
  if (granularity === 'day') buckets.push(...daysBetween(first, last));
  else {
    const seen = new Set<string>();
    for (const d of daysBetween(first, last)) {
      const key =
        granularity === 'month'
          ? d.slice(0, 7) + '-01'
          : addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7));
      if (!seen.has(key)) {
        seen.add(key);
        buckets.push(key);
      }
    }
  }
  return buckets.map((date) => {
    const r = byDate.get(date);
    return {
      date,
      first_time: r?.first_time ?? 0,
      redownloads: r?.redownloads ?? 0,
      updates: r?.updates ?? 0,
      iap: r?.iap ?? 0,
      proceeds: (r?.proceeds_usd ?? 0) * rate,
    };
  });
}

function territories(f: Filter, rate: number) {
  const [where, params] = salesWhere(f);
  return (getDb()
    .prepare(`SELECT s.country_code, ${SUMS} FROM sales s ${FX_JOIN} WHERE ${where} GROUP BY s.country_code`)
    .all(...params) as any[]).map((r) => ({
    country_code: r.country_code,
    first_time: r.first_time,
    redownloads: r.redownloads,
    updates: r.updates,
    iap: r.iap,
    proceeds: r.proceeds_usd * rate,
  }));
}

function breakdowns(f: Filter, rate: number) {
  const [where, params] = salesWhere(f);
  const db = getDb();
  const products = (db
    .prepare(`
      SELECT s.product_apple_id AS id, MAX(s.title) AS title, MAX(s.category) AS category, MAX(s.product_type) AS product_type,
             SUM(s.units) AS units, SUM(${PROCEEDS_USD}) AS proceeds_usd
      FROM sales s ${FX_JOIN} WHERE ${where} AND s.category IN ('download', 'iap', 'other')
      GROUP BY s.product_apple_id ORDER BY proceeds_usd DESC, units DESC`)
    .all(...params) as any[]).map((r) => ({ ...r, proceeds: r.proceeds_usd * rate }));

  const devices = db
    .prepare(`
      SELECT COALESCE(NULLIF(s.device, ''), 'Unknown') AS label, SUM(s.units) AS units
      FROM sales s WHERE ${where} AND s.category IN ('download', 'redownload')
      GROUP BY 1 ORDER BY units DESC`)
    .all(...params);

  const versions = db
    .prepare(`
      SELECT COALESCE(NULLIF(s.app_version, ''), 'Unknown') AS label,
             SUM(CASE WHEN s.category = 'update' THEN s.units ELSE 0 END) AS updates,
             SUM(CASE WHEN s.category IN ('download', 'redownload') THEN s.units ELSE 0 END) AS installs
      FROM sales s WHERE ${where} AND s.category IN ('download', 'redownload', 'update')
      GROUP BY 1 ORDER BY MAX(s.date) DESC LIMIT 25`)
    .all(...params);

  const prices = db
    .prepare(`
      SELECT s.customer_currency AS currency, s.customer_price AS price, SUM(s.units) AS units
      FROM sales s WHERE ${where} AND s.customer_price > 0
      GROUP BY 1, 2 ORDER BY units DESC LIMIT 25`)
    .all(...params);

  return { products, devices, versions, prices };
}

function subscriptions(f: Filter, rate: number) {
  const db = getDb();
  const [app, appParams] = appClause(f.appId);
  const range: string[] = [];
  const rangeParams: string[] = [];
  if (f.start) {
    range.push('date >= ?');
    rangeParams.push(f.start);
  }
  if (f.end) {
    range.push('date <= ?');
    rangeParams.push(f.end);
  }
  const rangeSql = range.length ? ' AND ' + range.join(' AND ') : '';

  const events = db
    .prepare(`SELECT event, SUM(quantity) AS count FROM sub_events WHERE ${app}${rangeSql} GROUP BY event ORDER BY count DESC`)
    .all(...appParams, ...rangeParams);

  const latest = db
    .prepare(`SELECT MAX(date) AS d FROM sub_snapshot WHERE ${app}${rangeSql}`)
    .get(...appParams, ...rangeParams) as { d: string | null };

  let active = null;
  let bySubscription: any[] = [];
  if (latest.d) {
    const [sApp, sParams] = appClause(f.appId, 's.apple_id');
    const a = db
      .prepare(`
        SELECT SUM(active_standard) AS standard, SUM(active_trial) AS trial, SUM(active_intro) AS intro,
               SUM(active_promo) AS promo, SUM(billing_retry) AS billing_retry, SUM(grace_period) AS grace_period,
               SUM(active_standard * proceeds_per_unit / COALESCE(fx.per_usd, 1)) AS mrr_usd
        FROM sub_snapshot s ${FX_JOIN}
        WHERE ${sApp} AND s.date = ?`)
      .get(...sParams, latest.d) as any;
    active = { date: latest.d, ...a, total: (a.standard || 0) + (a.trial || 0) + (a.intro || 0) + (a.promo || 0), proceeds: (a.mrr_usd || 0) * rate };
    bySubscription = db
      .prepare(`
        SELECT subscription_name AS name, SUM(active_standard + active_trial + active_intro + active_promo) AS active,
               SUM(active_trial) AS trial
        FROM sub_snapshot WHERE ${app} AND date = ? GROUP BY subscription_name ORDER BY active DESC`)
      .all(...appParams, latest.d);
  }

  const trend = db
    .prepare(`
      SELECT date, SUM(active_standard + active_trial + active_intro + active_promo) AS active, SUM(active_trial) AS trial
      FROM sub_snapshot WHERE ${app}${rangeSql} GROUP BY date ORDER BY date`)
    .all(...appParams, ...rangeParams);

  return { events, active, bySubscription, trend };
}

export function dashboard(f: Filter, granularity: 'day' | 'week' | 'month', currency: string, compare: boolean) {
  const rate = currencyRate(currency);
  let previous: Totals | null = null;
  if (compare && f.start) {
    const end = f.end || addDays(pacificToday(), -1);
    const len = daysBetween(f.start, end).length;
    previous = totals({ appId: f.appId, start: addDays(f.start, -len), end: addDays(f.start, -1) }, rate);
  }
  const [where, params] = salesWhere(f);
  const monthlyRows = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM sales s WHERE ${where} AND s.granularity = 'M'`)
    .get(...params) as { n: number };

  return {
    totals: totals(f, rate),
    previous,
    history: history(f, granularity, rate),
    hasMonthlyHistory: monthlyRows.n > 0,
    territories: territories(f, rate),
    breakdowns: breakdowns(f, rate),
    subscriptions: subscriptions(f, rate),
  };
}

// ---------------------------------------------------------------------------
// Store: ratings + rankings (latest snapshot per app/country)
// ---------------------------------------------------------------------------

export function storePresence(appId?: string) {
  const db = getDb();
  const [app, params] = appClause(appId, 'r.apple_id');

  const ratings = db
    .prepare(`
      SELECT r.apple_id, r.country_code, r.avg_rating, r.rating_count, r.current_avg_rating, r.current_rating_count, r.date
      FROM ratings r
      JOIN (SELECT apple_id, country_code, MAX(date) AS d FROM ratings GROUP BY apple_id, country_code) latest
        ON latest.apple_id = r.apple_id AND latest.country_code = r.country_code AND latest.d = r.date
      WHERE ${app}`)
    .all(...params) as any[];

  const latestRankDate = (db.prepare(`SELECT MAX(date) AS d FROM rankings`).get() as { d: string | null }).d;
  const [rApp, rParams] = appClause(appId, 'k.apple_id');
  const rankings = latestRankDate
    ? (db
        .prepare(`SELECT k.apple_id, k.country_code, k.chart, k.genre_id, k.rank FROM rankings k WHERE ${rApp} AND k.date = ?`)
        .all(...rParams, latestRankDate) as any[])
    : [];

  // Per-country rollup across the selected app(s).
  const byCountry = new Map<string, any>();
  const row = (cc: string) => {
    if (!byCountry.has(cc)) {
      byCountry.set(cc, { country_code: cc, rating_sum: 0, rating_count: 0, current_sum: 0, current_count: 0, apps: 0, ranks: {} });
    }
    return byCountry.get(cc);
  };
  for (const r of ratings) {
    const c = row(r.country_code);
    c.apps++;
    if (r.avg_rating != null && r.rating_count) {
      c.rating_sum += r.avg_rating * r.rating_count;
      c.rating_count += r.rating_count;
    }
    if (r.current_avg_rating != null && r.current_rating_count) {
      c.current_sum += r.current_avg_rating * r.current_rating_count;
      c.current_count += r.current_rating_count;
    }
  }
  for (const k of rankings) {
    const c = row(k.country_code);
    // Keep the best position per chart; category charts and the overall chart are kept apart.
    const key = `${k.chart}:${k.genre_id === '0' ? 'overall' : 'category'}`;
    if (!c.ranks[key] || k.rank < c.ranks[key].rank) c.ranks[key] = { rank: k.rank, apple_id: k.apple_id, genre_id: k.genre_id };
  }

  const countries = [...byCountry.values()].map((c) => ({
    country_code: c.country_code,
    available: c.apps > 0,
    rating: c.rating_count ? c.rating_sum / c.rating_count : null,
    rating_count: c.rating_count,
    current_rating: c.current_count ? c.current_sum / c.current_count : null,
    current_rating_count: c.current_count,
    ranks: c.ranks,
  }));

  const totalCount = countries.reduce((n, c) => n + c.rating_count, 0);
  const weighted = countries.reduce((n, c) => n + (c.rating ?? 0) * c.rating_count, 0);
  const allRanks = rankings.map((k) => k.rank);

  // Global ratings count over time (one point per store sync).
  const [hApp, hParams] = appClause(appId);
  const ratingTrend = db
    .prepare(`
      SELECT date, SUM(rating_count) AS count,
             SUM(avg_rating * rating_count) / NULLIF(SUM(CASE WHEN avg_rating IS NOT NULL THEN rating_count END), 0) AS avg
      FROM ratings WHERE ${hApp} GROUP BY date ORDER BY date`)
    .all(...hParams);

  const lastChecked = (db.prepare(`SELECT MAX(date) AS d FROM ratings`).get() as { d: string | null }).d;

  return {
    summary: {
      rating: totalCount ? weighted / totalCount : null,
      rating_count: totalCount,
      storefronts: countries.filter((c) => c.available).length,
      rated_storefronts: countries.filter((c) => c.rating_count > 0).length,
      ranked_storefronts: new Set(rankings.map((k) => k.country_code)).size,
      best_rank: allRanks.length ? Math.min(...allRanks) : null,
      last_checked: lastChecked,
      rankings_date: latestRankDate,
    },
    countries,
    rankings,
    ratingTrend,
  };
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export function reviews(opts: { appId?: string; country?: string; rating?: number; limit: number; offset: number }) {
  const db = getDb();
  const [app, params] = appClause(opts.appId);
  const where = [app];
  const p: any[] = [...params];
  if (opts.country) {
    where.push('country_code = ?');
    p.push(opts.country);
  }
  if (opts.rating) {
    where.push('rating = ?');
    p.push(opts.rating);
  }
  const sql = where.join(' AND ');
  const items = db
    .prepare(`SELECT * FROM reviews WHERE ${sql} ORDER BY created_date DESC LIMIT ? OFFSET ?`)
    .all(...p, opts.limit, opts.offset);
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM reviews WHERE ${sql}`).get(...p) as { n: number }).n;
  const distribution = db.prepare(`SELECT rating, COUNT(*) AS n FROM reviews WHERE ${app} GROUP BY rating`).all(...params);
  const countries = db
    .prepare(`SELECT country_code, COUNT(*) AS n FROM reviews WHERE ${app} GROUP BY country_code ORDER BY n DESC`)
    .all(...params);
  return { items, total, distribution, countries };
}

// ---------------------------------------------------------------------------
// Apps
// ---------------------------------------------------------------------------

export function listApps() {
  const db = getDb();
  return db
    .prepare(`
      SELECT a.*,
        COALESCE((SELECT SUM(units) FROM sales s WHERE s.apple_id = a.apple_id AND s.category = 'download'), 0) AS first_time_downloads,
        COALESCE((SELECT SUM(units) FROM sales s WHERE s.apple_id = a.apple_id AND s.category IN ('download', 'redownload')), 0) AS total_downloads
      FROM apps a ORDER BY a.hidden ASC, total_downloads DESC, a.name ASC`)
    .all()
    .map((a: any) => ({ ...a, hidden: !!a.hidden }));
}

export function setAppHidden(appleId: string, hidden?: boolean) {
  const db = getDb();
  if (hidden === undefined) {
    db.prepare(`UPDATE apps SET hidden = CASE WHEN hidden = 1 THEN 0 ELSE 1 END WHERE apple_id = ?`).run(appleId);
  } else {
    db.prepare(`UPDATE apps SET hidden = ? WHERE apple_id = ?`).run(hidden ? 1 : 0, appleId);
  }
}
