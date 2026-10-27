// Projections: where first-time downloads, impressions, product page views and proceeds are
// heading, from the daily history we hold, and what more impressions or a better conversion
// rate would be worth.
//
// Each metric gets a damped-trend exponential smoothing model (Holt, with the trend fading out
// so a good month doesn't extrapolate forever) fitted to its last six months of daily values,
// after taking out the day-of-week pattern. Its parameters are picked by the smallest one-day-
// ahead error, and that same error gives the ~80% ranges. Nothing here talks to Apple.

import { cached } from './cache';
import { addDays, daysBetween } from './dates';
import { currencyRate, dailyMetrics, lifetimeDownloads } from './queries';

export const FORECAST_HORIZONS = { 30: 'Next 30 days', 90: 'Next 90 days', 365: 'Next 12 months' } as const;
export type ForecastHorizon = keyof typeof FORECAST_HORIZONS;

export const FORECAST_METRICS = {
  first_time: 'First-Time Downloads',
  impressions: 'Impressions',
  page_views: 'Product Page Views',
  proceeds: 'Proceeds',
} as const;
export type ForecastMetric = keyof typeof FORECAST_METRICS;

export function isHorizon(v: unknown): v is ForecastHorizon {
  return String(v) in FORECAST_HORIZONS;
}

/** Days of history a model is fitted to, and the fewest it needs. */
const FIT_DAYS = 182;
const MIN_DAYS = 28;
/** Days shown before the projection in its chart. */
const SHOWN_DAYS = 90;
/** z for a two-sided 80% range. */
const Z80 = 1.2816;

export interface ForecastPoint { date: string; value: number; low: number; high: number }

export interface MetricForecast {
  metric: ForecastMetric;
  label: string;
  /** Why there's no projection (too little history, no analytics reports yet); the rest is then empty. */
  unavailable?: string;
  lastActual: string | null;   // last day with Apple data
  history: { date: string; value: number }[];
  daily: ForecastPoint[];      // the projection, one point per day of the horizon
  total: number;
  low: number;
  high: number;
  recentDaily: number;         // average of the last 28 days
  projectedDaily: number;      // average over the horizon
  model?: { alpha: number; beta: number; phi: number; days: number };
}

export interface Funnel {
  /** The 28 days these rates come from (where impressions and sales overlap). */
  from: string;
  to: string;
  impressions: number;
  pageViews: number;
  downloads: number;
  pageViewRate: number | null;      // page views per impression
  downloadsPerView: number | null;  // first-time downloads per page view
  conversion: number | null;        // first-time downloads per impression
  bestConversion: number | null;    // best 28-day conversion in the last year
  bestConversionPeriod: { from: string; to: string } | null;
  proceedsPerDownload: number | null; // proceeds per first-time download, last 90 days
}

export interface Scenario {
  id: string;
  label: string;
  downloads: number;
  extra: number;               // more than the base projection
  proceeds: number | null;     // the extra downloads at recent proceeds per download
}

export interface Forecast {
  appId: string | null;
  horizon: ForecastHorizon;
  horizonLabel: string;
  currency: string;
  metrics: Record<ForecastMetric, MetricForecast>;
  funnel: Funnel | null;
  scenarios: Scenario[];
  milestone: { downloads: number; next: number; date: string | null; days: number | null } | null;
  notes: string[];
}

// --- Model -------------------------------------------------------------------------

interface Fit { alpha: number; beta: number; phi: number; level: number; trend: number; sigma: number; sse: number }

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const dow = (d: string) => new Date(d + 'T00:00:00Z').getUTCDay();

/**
 * Weekday factors (Sunday = 0) from the last 12 weeks, pulled towards 1 when volumes are small:
 * three downloads on a Tuesday don't make Tuesdays special.
 */
function weekdayFactors(dates: string[], ys: number[]): number[] {
  const n = Math.min(ys.length, 84);
  const recent = ys.slice(-n);
  const days = dates.slice(-n);
  const avg = mean(recent);
  if (n < 28 || avg <= 0) return Array(7).fill(1);
  const sums = Array(7).fill(0);
  const counts = Array(7).fill(0);
  recent.forEach((y, i) => {
    sums[dow(days[i])] += y;
    counts[dow(days[i])]++;
  });
  const total = recent.reduce((a, b) => a + b, 0);
  const trust = total / (total + 200);
  const raw = sums.map((s, i) => (counts[i] ? s / counts[i] / avg : 1));
  const shrunk = raw.map((f) => 1 + (f - 1) * trust);
  const norm = mean(shrunk);
  return shrunk.map((f) => Math.max(0.2, f / norm));
}

/** Damped-trend Holt in error-correction form; `beta` is relative to `alpha`. */
function holt(z: number[], alpha: number, beta: number, phi: number): Fit {
  let level = mean(z.slice(0, 7));
  let trend = 0;
  let sse = 0;
  let count = 0;
  for (let t = 0; t < z.length; t++) {
    const f = level + phi * trend;
    const e = z[t] - f;
    if (t >= 7) {
      sse += e * e;
      count++;
    }
    level = f + alpha * e;
    trend = phi * trend + alpha * beta * e;
  }
  return { alpha, beta, phi, level, trend, sse, sigma: Math.sqrt(sse / Math.max(1, count)) };
}

function bestFit(z: number[]): Fit {
  let best: Fit | null = null;
  for (const alpha of [0.05, 0.1, 0.2, 0.3, 0.5])
    for (const beta of [0.01, 0.05, 0.1, 0.2])
      for (const phi of [0.8, 0.9, 0.98]) {
        const fit = holt(z, alpha, beta, phi);
        if (!best || fit.sse < best.sse) best = fit;
      }
  return best!;
}

/**
 * The model's h-day-ahead values and the variance of any run of them. A one-day error carries
 * into later days through the level and trend: c[k] is how much of it is left k days on.
 */
function project(fit: Fit, horizon: number) {
  const { alpha, beta, phi, level, trend, sigma } = fit;
  const values: number[] = [];
  const c: number[] = [0];
  let damp = 0;
  for (let h = 1; h <= horizon; h++) {
    damp += phi ** h;
    values.push(level + trend * damp);
    c.push(alpha + alpha * beta * damp);
  }
  const C = [0];
  for (let k = 1; k < c.length; k++) C.push(C[k - 1] + c[k]);
  /** Variance of the sum of days a..b (1-based, inclusive). */
  const variance = (a: number, b: number) => {
    let v = 0;
    for (let j = 1; j <= b; j++) {
      const own = j >= a ? 1 : 0;
      const from = Math.max(a, j + 1);
      const carried = from <= b ? C[b - j] - C[from - j - 1] : 0;
      v += (own + carried) ** 2;
    }
    return v * sigma * sigma;
  };
  return { values, variance };
}

interface Series { dates: string[]; values: number[]; last: string | null }

function forecastSeries(metric: ForecastMetric, s: Series, horizon: number, scale = 1): MetricForecast {
  const base: MetricForecast = {
    metric, label: FORECAST_METRICS[metric], lastActual: s.last, history: [], daily: [], total: 0, low: 0, high: 0, recentDaily: 0, projectedDaily: 0,
  };
  // Before an app's first sale (or impression) is launch, not a slump: start at the first non-zero day.
  const first = s.values.findIndex((v) => v > 0);
  const dates = first < 0 ? [] : s.dates.slice(first);
  const ys = first < 0 ? [] : s.values.slice(first);
  base.history = dates.slice(-SHOWN_DAYS).map((date, i, shown) => ({ date, value: ys[ys.length - shown.length + i] * scale }));
  base.recentDaily = mean(ys.slice(-28)) * scale;
  if (s.last && first < 0) return { ...base, unavailable: `No ${base.label.toLowerCase()} in the last six months.` };
  if (!s.last || ys.length < MIN_DAYS) {
    return { ...base, unavailable: `Needs at least ${MIN_DAYS} days of daily data${ys.length ? ` (has ${ys.length})` : ''}.` };
  }

  const factors = weekdayFactors(dates, ys);
  const z = ys.map((y, i) => y / factors[dow(dates[i])]);
  const fit = bestFit(z);
  const { values, variance } = project(fit, horizon);
  const days = daysBetween(addDays(s.last, 1), addDays(s.last, horizon));
  base.daily = days.map((date, i) => {
    const f = factors[dow(date)];
    const sd = Math.sqrt(variance(i + 1, i + 1)) * f;
    const v = Math.max(0, values[i] * f);
    return { date, value: v * scale, low: Math.max(0, v - Z80 * sd) * scale, high: (v + Z80 * sd) * scale };
  });
  base.total = base.daily.reduce((a, p) => a + p.value, 0);
  const sd = Math.sqrt(variance(1, horizon)) * scale;
  base.low = Math.max(0, base.total - Z80 * sd);
  base.high = base.total + Z80 * sd;
  base.projectedDaily = base.total / horizon;
  base.model = { alpha: fit.alpha, beta: fit.beta, phi: fit.phi, days: ys.length };
  return base;
}


// --- Funnel ------------------------------------------------------------------------

interface Daily { dates: string[]; last: string | null; cols: Record<string, number[]> }

/** Zero-filled daily columns over the year up to `last` (days without rows had none). */
function daily(rows: ({ date: string } & Record<string, any>)[], last: string | null, cols: string[]): Daily {
  if (!last) return { dates: [], last, cols: Object.fromEntries(cols.map((c) => [c, []])) };
  const dates = daysBetween(addDays(last, -364), last);
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return { dates, last, cols: Object.fromEntries(cols.map((c) => [c, dates.map((d) => Number(byDate.get(d)?.[c] ?? 0))])) };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Impressions → page views → first-time downloads over the last 28 days both reports cover. */
function funnel(sales: Daily, engagement: Daily, rate: number): Funnel | null {
  if (!sales.last || !engagement.last) return null;
  const end = sales.last < engagement.last ? sales.last : engagement.last;
  const at = (d: Daily) => d.dates.indexOf(end) + 1;
  const [sEnd, eEnd] = [at(sales), at(engagement)];
  const window = (xs: number[], stop: number, days = 28) => xs.slice(Math.max(0, stop - days), stop);
  const I = sum(window(engagement.cols.impressions, eEnd));
  if (!I) return null;
  const P = sum(window(engagement.cols.page_views, eEnd));
  const D = sum(window(sales.cols.first_time, sEnd));

  // Best rolling 28 days in the last year, a week apart, among windows with enough impressions to mean something.
  let best: { rate: number; from: string; to: string } | null = null;
  for (let k = 0; eEnd - k >= 28 && sEnd - k >= 28; k += 7) {
    const i = sum(window(engagement.cols.impressions, eEnd - k));
    if (i < 1000) continue;
    const r = sum(window(sales.cols.first_time, sEnd - k)) / i;
    if (!best || r > best.rate) best = { rate: r, from: engagement.dates[eEnd - k - 28], to: engagement.dates[eEnd - k - 1] };
  }
  const d90 = sum(sales.cols.first_time.slice(-90));
  const p90 = sum(sales.cols.proceeds_usd.slice(-90)) * rate;
  return {
    from: engagement.dates[Math.max(0, eEnd - 28)],
    to: end,
    impressions: I,
    pageViews: P,
    downloads: D,
    pageViewRate: P / I,
    downloadsPerView: P ? D / P : null,
    conversion: D / I,
    bestConversion: best?.rate ?? null,
    bestConversionPeriod: best && { from: best.from, to: best.to },
    proceedsPerDownload: d90 ? p90 / d90 : null,
  };
}

/** What more impressions, or converting like your best month again, would add to the projection. */
function scenarios(f: Funnel | null, impressions: MetricForecast, downloads: MetricForecast): Scenario[] {
  if (!f?.conversion || impressions.unavailable || downloads.unavailable) return [];
  const conv = f.conversion;
  const base = downloads.total;
  const make = (id: string, label: string, extra: number): Scenario => ({
    id, label, extra, downloads: base + extra, proceeds: f.proceedsPerDownload == null ? null : extra * f.proceedsPerDownload,
  });
  const list = [25, 50, 100].map((lift) => make(`impressions_${lift}`, `Impressions +${lift}%`, impressions.total * (lift / 100) * conv));
  if (f.bestConversion && f.bestConversion > conv) {
    const best = f.bestConversion;
    list.push(make('best_conversion', `Conversion at your best (${(best * 100).toFixed(2)}%)`, impressions.total * (best - conv)));
    list.push(make('impressions_50_best_conversion', 'Impressions +50% and your best conversion', impressions.total * (1.5 * best - conv)));
  }
  return list;
}

/** Round numbers worth celebrating: 100, 250, 500, 1K, 2.5K, 5K, 10K … */
function nextMilestone(n: number): number {
  for (let p = 100; ; p *= 10) for (const m of [1, 2.5, 5]) if (m * p > n) return m * p;
}

// --- Entry point -------------------------------------------------------------------

export function forecast(appId: string | undefined, horizon: ForecastHorizon, currency: string): Forecast {
  return cached(`forecast|${appId}|${horizon}|${currency}`, () => build(appId, horizon, currency));
}

function build(appId: string | undefined, horizon: ForecastHorizon, currency: string): Forecast {
  const rate = currencyRate(currency);
  const m = dailyMetrics(appId, 365);
  const sales = daily(m.sales, m.salesLast, ['first_time', 'proceeds_usd']);
  const engagement = daily(m.engagement, m.engagementLast, ['impressions', 'page_views']);

  const fitted = (d: Daily, col: string): Series => ({ dates: d.dates.slice(-FIT_DAYS), values: d.cols[col].slice(-FIT_DAYS), last: d.last });
  const metrics: Record<ForecastMetric, MetricForecast> = {
    first_time: forecastSeries('first_time', fitted(sales, 'first_time'), horizon),
    impressions: forecastSeries('impressions', fitted(engagement, 'impressions'), horizon),
    page_views: forecastSeries('page_views', fitted(engagement, 'page_views'), horizon),
    proceeds: forecastSeries('proceeds', fitted(sales, 'proceeds_usd'), horizon, rate),
  };
  if (!engagement.last) {
    for (const k of ['impressions', 'page_views'] as const) {
      metrics[k].unavailable = 'Waiting for Apple’s first analytics reports (impressions and page views).';
    }
  }

  const f = funnel(sales, engagement, rate);
  const notes: string[] = [];
  if (!f) notes.push('Conversion scenarios need 28 days in which both impressions and downloads were reported.');

  // When the next round number of first-time downloads comes, on the central projection.
  let milestone: Forecast['milestone'] = null;
  const year = horizon === 365 ? metrics.first_time : forecastSeries('first_time', fitted(sales, 'first_time'), 365);
  if (!year.unavailable) {
    const downloads = lifetimeDownloads(appId);
    const next = nextMilestone(downloads);
    let total = downloads;
    const hit = year.daily.findIndex((p) => (total += p.value) >= next);
    milestone = { downloads, next, date: hit < 0 ? null : year.daily[hit].date, days: hit < 0 ? null : hit + 1 };
  }

  return {
    appId: appId ?? null,
    horizon,
    horizonLabel: FORECAST_HORIZONS[horizon],
    currency,
    metrics,
    funnel: f,
    scenarios: scenarios(f, metrics.impressions, metrics.first_time),
    milestone,
    notes,
  };
}
