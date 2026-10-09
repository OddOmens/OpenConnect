import { getDb } from './db';
import { getCredentials, getSyncConfig } from './config';
import { AscError, ReportType, fetchApps, fetchCustomerReviews, fetchReport } from './asc-client';
import { fetchChart, fetchUsdRates, isThrottledChart, lookupApps, mapLimit, StoreListing } from './itunes-client';
import { addDays, daysBetween, monthsBetween, pacificToday, syncWindow, SyncWindow, yearsBetween } from './dates';
import { TERRITORIES } from './territories';
import type { ChartId } from './prefs';
import { syncEngagement } from './analytics';
import { buildReport, NO_FIGURES, Revision, salesFigures, SyncReport, takeSnapshot } from './sync-report';

export type JobId = 'asc' | 'store';

export interface JobState {
  id: JobId;
  running: boolean;
  phase: string;
  done: number;
  total: number;
  startedAt: string | null;
  finishedAt: string | null;
  trigger: string | null;
  errors: string[];
  summary: string | null;
}

const g = globalThis as unknown as { __syncJobs?: Record<JobId, JobState>; __syncRevisions?: Record<JobId, Revision[]> };

/** Sales report dates replaced during the current run, for its change report. */
function revisions(id: JobId): Revision[] {
  g.__syncRevisions ??= { asc: [], store: [] };
  return g.__syncRevisions[id];
}

function freshState(id: JobId): JobState {
  return { id, running: false, phase: '', done: 0, total: 0, startedAt: null, finishedAt: null, trigger: null, errors: [], summary: null };
}

function jobs(): Record<JobId, JobState> {
  if (!g.__syncJobs) g.__syncJobs = { asc: freshState('asc'), store: freshState('store') };
  return g.__syncJobs;
}

export function getJobStates() {
  return jobs();
}

/** Start a job in the background. Returns false if it is already running. */
export function startJob(id: JobId, trigger: string): boolean {
  const state = jobs()[id];
  if (state.running) return false;
  Object.assign(state, freshState(id), { running: true, startedAt: new Date().toISOString(), trigger });
  revisions(id).length = 0;

  const db = getDb();
  let before: ReturnType<typeof takeSnapshot> | null = null;
  try {
    before = takeSnapshot(id);
  } catch (err) {
    console.error(`[sync:${id}] snapshot failed`, err);
  }
  const runId = db
    .prepare(`INSERT INTO job_runs (job, trigger, started_at, status) VALUES (?, ?, ?, 'running')`)
    .run(id, trigger, state.startedAt).lastInsertRowid;

  const run = id === 'asc' ? runAscSync : runStoreSync;
  run(state)
    .catch((err) => {
      state.errors.push(err?.message || String(err));
      console.error(`[sync:${id}]`, err);
    })
    .finally(() => {
      state.finishedAt = new Date().toISOString();
      const status = state.errors.length ? 'error' : 'ok';
      let report: SyncReport | null = null;
      try {
        if (before) {
          report = buildReport(before, revisions(id), {
            trigger, startedAt: state.startedAt, finishedAt: state.finishedAt, errors: state.errors.slice(0, 20),
          });
        }
      } catch (err) {
        console.error(`[sync:${id}] change report failed`, err);
      }
      revisions(id).length = 0;
      db.prepare(`UPDATE job_runs SET finished_at = ?, status = ?, message = ?, report = ? WHERE id = ?`).run(
        state.finishedAt,
        status,
        [state.summary, ...state.errors].filter(Boolean).join('\n').slice(0, 4000),
        report ? JSON.stringify(report) : null,
        runId
      );
      // Reports are for looking back a little; older runs keep just their summary line.
      db.prepare(`UPDATE job_runs SET report = NULL WHERE id < ? AND report IS NOT NULL`).run(Number(runId) - 100);
      // Only now, so anyone who sees the job finish can already read its report.
      state.running = false;
      state.phase = 'done';
      console.log(`[sync:${id}] finished (${status}) ${state.summary || ''}`);
    });
  return true;
}

export interface RunRecord {
  id: number;
  trigger: string | null;
  started_at: string;
  finished_at: string;
  status: string;
  message: string;
  report: SyncReport | null;
}

export function lastRun(id: JobId): RunRecord | undefined {
  const row = getDb()
    .prepare(`SELECT id, trigger, started_at, finished_at, status, message, report FROM job_runs
              WHERE job = ? AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1`)
    .get(id) as (Omit<RunRecord, 'report'> & { report: string | null }) | undefined;
  if (!row) return undefined;
  let report: SyncReport | null = null;
  try {
    report = row.report ? JSON.parse(row.report) : null;
  } catch {
    // written by an older version
  }
  return { ...row, report };
}

// ---------------------------------------------------------------------------
// Coverage: which report dates we hold vs. which exist
// ---------------------------------------------------------------------------

function earliestRelease(): string | null {
  // An app whose release date is unknown could predate the others, so then nothing is bounded.
  const row = getDb()
    .prepare(`SELECT MIN(substr(release_date, 1, 10)) AS d, COALESCE(SUM(release_date IS NULL), 0) AS unknown FROM apps`)
    .get() as { d: string | null; unknown: number };
  return row.unknown ? null : row.d;
}

function currentWindow(): SyncWindow {
  return syncWindow(earliestRelease());
}

interface ReportPlan {
  reportType: ReportType;
  granularity: 'D' | 'M' | 'Y';
  dates: string[]; // YYYY-MM-DD for D, YYYY-MM for M, YYYY for Y
}

const FREQUENCY = { D: 'DAILY', M: 'MONTHLY', Y: 'YEARLY' } as const;

function plans(window: SyncWindow, includeSubs: boolean): ReportPlan[] {
  const days = window.dailyStart <= window.latestDay ? daysBetween(window.dailyStart, window.latestDay) : [];
  const months = window.monthlyStart <= window.monthlyEnd ? monthsBetween(window.monthlyStart, window.monthlyEnd) : [];
  const years = window.yearlyStart <= window.yearlyEnd ? yearsBetween(window.yearlyStart, window.yearlyEnd) : [];
  const out: ReportPlan[] = [
    { reportType: 'SALES', granularity: 'D', dates: days },
    { reportType: 'SALES', granularity: 'M', dates: months },
    { reportType: 'SALES', granularity: 'Y', dates: years },
  ];
  if (includeSubs) {
    // Subscription reports are daily-only and kept for the same 365 days.
    const subDays = daysBetween(window.subscriptionStart, window.latestDay);
    out.push({ reportType: 'SUBSCRIPTION_EVENT', granularity: 'D', dates: subDays });
    out.push({ reportType: 'SUBSCRIPTION', granularity: 'D', dates: subDays });
  }
  return out;
}

function missingDates(plan: ReportPlan): string[] {
  const have = new Set(
    (getDb()
      .prepare(`SELECT report_date FROM sync_state WHERE report_type = ? AND granularity = ? AND status IN ('ok', 'empty')`)
      .all(plan.reportType, plan.granularity) as { report_date: string }[]).map((r) => r.report_date)
  );
  // Newest first, so recent numbers show up before a long backfill finishes.
  return plan.dates.filter((d) => !have.has(d)).reverse();
}

export function getCoverage() {
  const config = getSyncConfig();
  const window = currentWindow();
  const db = getDb();
  return {
    window,
    reports: plans(window, config.syncSubscriptions).map((plan) => {
      const states = db
        .prepare(`SELECT report_date, status, last_error FROM sync_state WHERE report_type = ? AND granularity = ?`)
        .all(plan.reportType, plan.granularity) as { report_date: string; status: string; last_error: string | null }[];
      const inWindow = new Set(plan.dates);
      const counts = { ok: 0, empty: 0, error: 0 };
      let lastError: string | null = null;
      let latestOk: string | null = null;
      for (const s of states) {
        if (!inWindow.has(s.report_date)) continue;
        counts[s.status as keyof typeof counts]++;
        if (s.status === 'error') lastError = s.last_error;
        if (s.status === 'ok' && (!latestOk || s.report_date > latestOk)) latestOk = s.report_date;
      }
      return {
        reportType: plan.reportType,
        granularity: plan.granularity,
        expected: plan.dates.length,
        ...counts,
        missing: plan.dates.length - counts.ok - counts.empty,
        first: plan.dates[0] || null,
        last: plan.dates[plan.dates.length - 1] || null,
        latestOk,
        lastError,
      };
    }),
  };
}

/** Forget what has been synced so the next run fetches everything again (rows are replaced, never duplicated). */
export function resetSyncState(scope: 'errors' | 'all') {
  const db = getDb();
  if (scope === 'all') db.prepare(`DELETE FROM sync_state`).run();
  else db.prepare(`DELETE FROM sync_state WHERE status = 'error'`).run();
}

// ---------------------------------------------------------------------------
// App Store Connect sync: apps, sales, subscriptions, reviews, FX rates
// ---------------------------------------------------------------------------

function categorize(productType: string): string {
  const pt = (productType || '').toUpperCase();
  const base = pt.split('-')[0];
  if (pt.startsWith('IA') || pt.startsWith('FI')) return 'iap';
  if (['1', '1F', '1T', 'F1', '1E', '1EP', '1EU'].includes(base)) return 'download';
  if (['3', '3F', '3T', 'F3'].includes(base)) return 'redownload';
  if (['7', '7F', '7T', 'F7'].includes(base)) return 'update';
  return 'other';
}

const num = (v: string | undefined) => {
  const n = parseFloat((v || '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const int = (v: string | undefined) => Math.trunc(num(v));

function skuMap(): Map<string, string> {
  const rows = getDb().prepare(`SELECT apple_id, sku FROM apps WHERE sku IS NOT NULL`).all() as { apple_id: string; sku: string }[];
  return new Map(rows.map((r) => [r.sku, r.apple_id]));
}

// Columns shared by `sales` and `yearly_sales`.
const SALES_COLUMNS = [
  'apple_id', 'product_apple_id', 'sku', 'parent_sku', 'title', 'product_type', 'category', 'units',
  'proceeds_per_unit', 'proceeds_currency', 'customer_price', 'customer_currency', 'country_code', 'device',
  'app_version', 'promo_code', 'subscription', 'period',
];

function salesRow(r: Record<string, string>, skus: Map<string, string>) {
  const productId = r['Apple Identifier'];
  const parentSku = r['Parent Identifier'] || '';
  return {
    apple_id: (parentSku && skus.get(parentSku)) || productId,
    product_apple_id: productId,
    sku: r['SKU'] || null,
    parent_sku: parentSku || null,
    title: r['Title'] || null,
    product_type: r['Product Type Identifier'] || null,
    category: categorize(r['Product Type Identifier']),
    units: int(r['Units']),
    proceeds_per_unit: num(r['Developer Proceeds']),
    proceeds_currency: r['Currency of Proceeds'] || 'USD',
    customer_price: num(r['Customer Price']),
    customer_currency: r['Customer Currency'] || null,
    country_code: r['Country Code'] || null,
    device: r['Device'] || null,
    app_version: r['Version'] || null,
    promo_code: r['Promo Code'] || null,
    subscription: r['Subscription'] || null,
    period: r['Period'] || null,
  };
}

/**
 * Yearly reports overlap the daily/monthly rows we already hold for that year.
 * Store only the difference as 'Y' rows, grouped on every column that carries
 * meaning, so any total over D + M + Y rows equals Apple's yearly figure.
 * Rebuilt from scratch after each sync because the daily data underneath changes.
 */
export function rebuildYearlyRemainder() {
  const db = getDb();
  const keys = SALES_COLUMNS.filter((c) => !['sku', 'parent_sku', 'title', 'category', 'units'].includes(c));
  const cols = SALES_COLUMNS.join(', ');
  db.transaction(() => {
    db.prepare(`DELETE FROM sales WHERE granularity = 'Y'`).run();
    db.prepare(`
      INSERT INTO sales (granularity, date, ${cols})
      SELECT 'Y', year || '-01-01', ${SALES_COLUMNS.map((c) => (c === 'units' ? 'SUM(units)' : keys.includes(c) ? c : `MAX(${c})`)).join(', ')}
      FROM (
        SELECT year, ${cols} FROM yearly_sales
        UNION ALL
        SELECT substr(date, 1, 4), ${SALES_COLUMNS.map((c) => (c === 'units' ? '-units' : c)).join(', ')}
        FROM sales WHERE granularity IN ('D', 'M') AND substr(date, 1, 4) IN (SELECT DISTINCT year FROM yearly_sales)
      )
      GROUP BY year, ${keys.join(', ')}
      HAVING SUM(units) != 0`).run();
  })();
}

function storeReport(plan: ReportPlan, date: string, rows: Record<string, string>[], skus: Map<string, string>) {
  const db = getDb();
  const day = plan.granularity === 'M' ? `${date}-01` : date;

  if (plan.reportType === 'SALES' && plan.granularity === 'Y') {
    const insert = db.prepare(
      `INSERT INTO yearly_sales (year, ${SALES_COLUMNS.join(', ')}) VALUES (@year, ${SALES_COLUMNS.map((c) => '@' + c).join(', ')})`
    );
    db.transaction(() => {
      db.prepare(`DELETE FROM yearly_sales WHERE year = ?`).run(date);
      for (const r of rows) insert.run({ year: date, ...salesRow(r, skus) });
    })();
  } else if (plan.reportType === 'SALES') {
    const insert = db.prepare(
      `INSERT INTO sales (granularity, date, ${SALES_COLUMNS.join(', ')})
       VALUES (@granularity, @date, ${SALES_COLUMNS.map((c) => '@' + c).join(', ')})`
    );
    db.transaction(() => {
      db.prepare(`DELETE FROM sales WHERE granularity = ? AND date = ?`).run(plan.granularity, day);
      // A monthly report supersedes any daily rows that aged out of the daily window.
      if (plan.granularity === 'M') {
        db.prepare(`DELETE FROM sales WHERE granularity = 'D' AND substr(date, 1, 7) = ?`).run(date);
      }
      for (const r of rows) insert.run({ granularity: plan.granularity, date: day, ...salesRow(r, skus) });
    })();
  } else if (plan.reportType === 'SUBSCRIPTION_EVENT') {
    const insert = db.prepare(`
      INSERT INTO sub_events (date, apple_id, subscription_name, subscription_id, event, offer_type, country_code, device, quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    db.transaction(() => {
      db.prepare(`DELETE FROM sub_events WHERE date = ?`).run(day);
      for (const r of rows) {
        insert.run(day, r['App Apple ID'], r['Subscription Name'], r['Subscription Apple ID'], r['Event'],
          r['Subscription Offer Type'] || null, r['Country'], r['Device'] || null, int(r['Quantity']) || 1);
      }
    })();
  } else {
    const insert = db.prepare(`
      INSERT INTO sub_snapshot (date, apple_id, subscription_name, subscription_id, country_code, proceeds_per_unit,
        proceeds_currency, active_standard, active_trial, active_intro, active_promo, billing_retry, grace_period)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    db.transaction(() => {
      db.prepare(`DELETE FROM sub_snapshot WHERE date = ?`).run(day);
      for (const r of rows) {
        let trial = 0, intro = 0, promo = 0;
        for (const [col, value] of Object.entries(r)) {
          if (!/subscriptions$/i.test(col) || /^Active Standard/i.test(col)) continue;
          if (/free trial/i.test(col)) trial += int(value);
          else if (/^Active Pay/i.test(col)) intro += int(value);
          else if (/promotional offer|offer code|win-back/i.test(col)) promo += int(value);
        }
        insert.run(day, r['App Apple ID'], r['Subscription Name'], r['Subscription Apple ID'], r['Country'],
          num(r['Developer Proceeds']), r['Proceeds Currency'] || 'USD', int(r['Active Standard Price Subscriptions']),
          trial, intro, promo, int(r['Billing Retry']), int(r['Grace Period']));
      }
    })();
  }
}

function markState(plan: ReportPlan, date: string, status: 'ok' | 'empty' | 'error', rows = 0, error: string | null = null) {
  getDb()
    .prepare(`
      INSERT INTO sync_state (report_type, granularity, report_date, status, rows, attempts, last_error, synced_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(report_type, granularity, report_date) DO UPDATE SET
        status = excluded.status, rows = excluded.rows, attempts = sync_state.attempts + 1,
        last_error = excluded.last_error, synced_at = CURRENT_TIMESTAMP`)
    .run(plan.reportType, plan.granularity, date, status, rows, error);
}

const PLAN_LABEL: Record<string, string> = {
  'SALES:D': 'daily sales',
  'SALES:M': 'monthly sales',
  'SALES:Y': 'yearly sales',
  'SUBSCRIPTION_EVENT:D': 'subscription events',
  'SUBSCRIPTION:D': 'active subscriptions',
};

async function syncReports(state: JobState, vendor: string, includeSubs: boolean) {
  const window = currentWindow();
  // A 404 for these may just mean "not published yet": leave them missing so the next run retries.
  const unpublished = (plan: ReportPlan, date: string) =>
    plan.granularity === 'D' ? date >= addDays(window.latestDay, -1) : plan.granularity === 'Y' && date === window.yearlyEnd;
  const skus = skuMap();
  const work = plans(window, includeSubs).map((p) => ({ plan: p, dates: missingDates(p) }));

  state.total = work.reduce((n, w) => n + w.dates.length, 0);
  state.done = 0;
  const fetched: Record<string, number> = {};

  for (const { plan, dates } of work) {
    const label = PLAN_LABEL[`${plan.reportType}:${plan.granularity}`];
    if (!dates.length) continue;
    state.phase = `Fetching ${label}`;
    let blocked: AscError | null = null;
    // Daily and monthly sales dates also note what they held before, for the change report.
    const tracked = plan.reportType === 'SALES' && plan.granularity !== 'Y' ? (plan.granularity as 'D' | 'M') : null;
    const store = (date: string, rows: Record<string, string>[]) => {
      const was = tracked ? salesFigures(tracked, date) : null;
      storeReport(plan, date, rows, skus);
      if (tracked) {
        revisions('asc').push({
          label,
          date,
          before: was,
          after: salesFigures(tracked, date) || NO_FIGURES,
        });
      }
    };

    // Apple allows 3600 requests/hour per key and handles a dozen in parallel fine;
    // a full first backfill is roughly 1100 requests.
    await mapLimit(dates, 12, async (date) => {
      if (blocked) {
        state.done++;
        return;
      }
      try {
        const result = await fetchReport(vendor, plan.reportType, FREQUENCY[plan.granularity], date);
        if (result.status === 'ok') {
          store(date, result.rows);
          markState(plan, date, 'ok', result.rows.length);
          fetched[label] = (fetched[label] || 0) + 1;
        } else if (!unpublished(plan, date)) {
          store(date, []);
          markState(plan, date, 'empty');
        }
      } catch (err: any) {
        const e = err instanceof AscError ? err : new AscError(0, err?.message || String(err));
        if (e.status === 400 || e.status === 410) {
          // Deterministic rejection (e.g. a report older than Apple retains): don't keep retrying it.
          markState(plan, date, 'empty', 0, e.message);
        } else {
          markState(plan, date, 'error', 0, e.message);
          if (e.isPermission || e.status === 0) blocked = e;
        }
      }
      state.done++;
    });

    if (blocked) {
      state.errors.push(`Couldn't fetch ${label}: ${(blocked as AscError).message}`);
      // The rest of this report type would fail the same way; count them as done for progress.
    }
  }

  rebuildYearlyRemainder();
  return fetched;
}

async function syncReviews(state: JobState) {
  const db = getDb();
  const apps = db.prepare(`SELECT apple_id, name FROM apps`).all() as { apple_id: string; name: string }[];
  const alpha3 = new Map(TERRITORIES.map((t) => [t.alpha3, t.code]));
  const insert = db.prepare(`
    INSERT INTO reviews (id, apple_id, country_code, rating, title, body, reviewer, created_date, response_body, response_date)
    VALUES (@id, @apple_id, @country_code, @rating, @title, @body, @reviewer, @created_date, @response_body, @response_date)
    ON CONFLICT(id) DO UPDATE SET response_body = excluded.response_body, response_date = excluded.response_date`);

  state.phase = 'Fetching customer reviews';
  state.total = apps.length;
  state.done = 0;
  let added = 0;
  for (const app of apps) {
    try {
      const known = new Set(
        (db.prepare(`SELECT id FROM reviews WHERE apple_id = ?`).all(app.apple_id) as { id: string }[]).map((r) => r.id)
      );
      const reviews = await fetchCustomerReviews(app.apple_id, known);
      db.transaction(() => {
        for (const r of reviews) {
          insert.run({
            id: r.id,
            apple_id: app.apple_id,
            country_code: alpha3.get(r.territory) || r.territory,
            rating: r.rating,
            title: r.title,
            body: r.body,
            reviewer: r.reviewer,
            created_date: r.createdDate,
            response_body: r.responseBody,
            response_date: r.responseDate,
          });
        }
      })();
      added += reviews.length;
    } catch (err: any) {
      state.errors.push(`Reviews for ${app.name}: ${err.message}`);
      if (err instanceof AscError && err.isPermission) break;
    }
    state.done++;
  }
  return added;
}

export async function refreshFxRates(force = false) {
  const db = getDb();
  const row = db.prepare(`SELECT MAX(updated_at) AS t FROM fx_rates`).get() as { t: string | null };
  if (!force && row.t && Date.now() - new Date(row.t + 'Z').getTime() < 12 * 3600 * 1000) return;
  const rates = await fetchUsdRates();
  if (!rates) return;
  const upsert = db.prepare(`INSERT INTO fx_rates (currency, per_usd, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(currency) DO UPDATE SET per_usd = excluded.per_usd, updated_at = CURRENT_TIMESTAMP`);
  db.transaction(() => {
    for (const [cur, rate] of Object.entries(rates)) upsert.run(cur, rate);
  })();
}

async function runAscSync(state: JobState) {
  const config = getSyncConfig();
  const { vendor_number } = getCredentials();
  const db = getDb();

  state.phase = 'Fetching apps';
  const apps = await fetchApps();
  const upsert = db.prepare(`
    INSERT INTO apps (apple_id, name, bundle_id, sku, platform) VALUES (?, ?, ?, ?, 'iOS')
    ON CONFLICT(apple_id) DO UPDATE SET name = excluded.name, bundle_id = excluded.bundle_id, sku = excluded.sku`);
  db.transaction(() => apps.forEach((a) => upsert.run(a.id, a.name, a.bundleId, a.sku)))();

  // Release dates bound the backfill, so we never ask for days before an app existed.
  const unknownRelease = db.prepare(`SELECT apple_id FROM apps WHERE release_date IS NULL`).all() as { apple_id: string }[];
  if (unknownRelease.length) {
    state.phase = 'Looking up release dates';
    await updateAppMetadata(unknownRelease.map((a) => a.apple_id), ['US', 'GB', 'CA', 'AU', 'DE']).catch(() => {});
  }

  await refreshFxRates().catch(() => {});

  const parts: string[] = [`${apps.length} apps`];
  if (vendor_number) {
    const fetched = await syncReports(state, vendor_number, config.syncSubscriptions);
    for (const [label, n] of Object.entries(fetched)) parts.push(`${n} ${label} report${n === 1 ? '' : 's'}`);
  } else {
    state.errors.push('Vendor number is not set, so sales and subscription reports were skipped.');
  }

  if (config.syncAnalytics) {
    const { imported, pending } = await syncEngagement(state, apps.map((a) => a.id));
    if (imported) parts.push(`${imported} impressions & page views report${imported === 1 ? '' : 's'}`);
    if (pending) parts.push(`asked Apple to start ${pending} analytics reports (ready in 1–2 days)`);
  }

  if (config.syncReviews) {
    const added = await syncReviews(state);
    parts.push(`${added} new review${added === 1 ? '' : 's'}`);
  }
  state.summary = `Synced ${parts.join(', ')}.`;
}

// ---------------------------------------------------------------------------
// Store sync: ratings in every storefront + chart rankings
// ---------------------------------------------------------------------------

function applyListing(listing: StoreListing) {
  getDb()
    .prepare(`
      UPDATE apps SET
        icon_url = COALESCE(?, icon_url), store_url = COALESCE(?, store_url),
        primary_genre_id = COALESCE(?, primary_genre_id), primary_genre = COALESCE(?, primary_genre),
        price = COALESCE(?, price), current_version = COALESCE(?, current_version),
        release_date = COALESCE(?, release_date)
      WHERE apple_id = ?`)
    .run(listing.iconUrl, listing.storeUrl, listing.primaryGenreId, listing.primaryGenre, listing.price,
      listing.version, listing.releaseDate, listing.appleId);
}

async function updateAppMetadata(appIds: string[], countries: string[]) {
  const remaining = new Set(appIds);
  for (const cc of countries) {
    if (!remaining.size) break;
    const listings = await lookupApps([...remaining], cc);
    for (const l of listings) {
      applyListing(l);
      remaining.delete(l.appleId);
    }
  }
}

async function runStoreSync(state: JobState) {
  const config = getSyncConfig();
  const db = getDb();
  let apps = db.prepare(`SELECT apple_id FROM apps`).all() as { apple_id: string }[];
  if (!apps.length) {
    state.phase = 'Fetching apps';
    const fetched = await fetchApps();
    const upsert = db.prepare(`INSERT OR IGNORE INTO apps (apple_id, name, bundle_id, sku) VALUES (?, ?, ?, ?)`);
    fetched.forEach((a) => upsert.run(a.id, a.name, a.bundleId, a.sku));
    apps = fetched.map((a) => ({ apple_id: a.id }));
  }
  const ids = apps.map((a) => a.apple_id);
  const countries =
    config.storeCountries === 'all' ? TERRITORIES.map((t) => t.code) : config.storeCountries.filter(Boolean);
  const today = pacificToday();

  // 1. Ratings: one lookup per storefront covers every app.
  state.phase = `Checking ratings in ${countries.length} storefronts`;
  state.total = countries.length;
  state.done = 0;
  const availability = new Map<string, Map<string, number | null>>(); // country -> app id -> price there
  const upsertRating = db.prepare(`
    INSERT INTO ratings (apple_id, country_code, date, avg_rating, rating_count, current_avg_rating, current_rating_count, version, price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(apple_id, country_code, date) DO UPDATE SET
      avg_rating = excluded.avg_rating, rating_count = excluded.rating_count,
      current_avg_rating = excluded.current_avg_rating, current_rating_count = excluded.current_rating_count,
      version = excluded.version, price = excluded.price`);
  let failures = 0;

  await mapLimit(countries, 4, async (cc) => {
    try {
      // Lookup accepts up to ~200 ids at once.
      const listings: StoreListing[] = [];
      for (let i = 0; i < ids.length; i += 150) listings.push(...(await lookupApps(ids.slice(i, i + 150), cc)));
      availability.set(cc, new Map(listings.map((l) => [l.appleId, l.price])));
      db.transaction(() => {
        for (const l of listings) {
          upsertRating.run(l.appleId, cc, today, l.avgRating, l.ratingCount, l.currentAvgRating, l.currentRatingCount, l.version, l.price);
          if (cc === 'US') applyListing(l);
        }
      })();
    } catch {
      failures++;
    }
    state.done++;
  });
  // Fill metadata for apps not sold in the US from wherever they were found.
  const notInUs = ids.filter((id) => !availability.get('US')?.has(id));
  if (notInUs.length) {
    const where = [...availability.entries()].filter(([, set]) => notInUs.some((id) => set.has(id))).map(([cc]) => cc);
    await updateAppMetadata(notInUs, where.slice(0, 5)).catch(() => {});
  }
  if (failures) state.errors.push(`Ratings lookup failed in ${failures} storefronts (Apple throttling); they'll be retried next run.`);

  // 2. Rankings: each storefront's top 100 per chart, in each app's category and overall.
  const genreOf = new Map(
    (db.prepare(`SELECT apple_id, primary_genre_id FROM apps`).all() as { apple_id: string; primary_genre_id: string | null }[])
      .map((r) => [r.apple_id, r.primary_genre_id])
  );
  // Skip charts an app can't be on: free apps aren't in Top Paid (and vice versa), and an app
  // with no proceeds in a storefront lately can't be in its Top Grossing.
  const recentSales = db.prepare(`SELECT COUNT(*) AS n FROM sales WHERE granularity = 'D' AND date >= ?`).get(addDays(today, -30)) as { n: number };
  const earning = new Set(
    (db.prepare(`
      SELECT DISTINCT apple_id || ':' || country_code AS k FROM sales
      WHERE granularity = 'D' AND date >= ? AND units * proceeds_per_unit > 0`)
      .all(addDays(today, -30)) as { k: string }[]).map((r) => r.k)
  );
  const canChart = (chart: ChartId, id: string, cc: string, price: number | null) => {
    if (chart === 'topfree') return price === null || price === 0;
    if (chart === 'toppaid') return price === null || price > 0;
    return !recentSales.n || earning.has(`${id}:${cc}`);
  };

  type Task = { cc: string; chart: ChartId; genre: string };
  const tasks: Task[] = [];
  for (const cc of countries) {
    const sold = availability.get(cc);
    if (!sold?.size) continue;
    for (const chart of config.rankCharts) {
      const genres = new Set<string>();
      sold.forEach((price, id) => {
        if (!canChart(chart, id, cc, price)) return;
        genres.add(genreOf.get(id) || '0');
        if (config.rankOverall) genres.add('0');
      });
      if (!config.rankOverall) genres.delete('0');
      for (const genre of genres) tasks.push({ cc, chart, genre });
    }
  }

  state.phase = `Checking ${tasks.length} top charts`;
  state.total = tasks.length;
  state.done = 0;
  const ours = new Set(ids);
  let found = 0;
  let chartFailures = 0;
  // Saved as we go, so an interrupted run still keeps what it found.
  db.prepare(`DELETE FROM rankings WHERE date = ?`).run(today);
  const insertRank = db.prepare(`INSERT OR REPLACE INTO rankings (apple_id, country_code, date, chart, genre_id, rank) VALUES (?, ?, ?, ?, ?, ?)`);
  const check = async (t: Task) => {
    try {
      const list = await fetchChart(t.cc, t.chart, t.genre);
      list.forEach((id, i) => {
        if (ours.has(id)) {
          insertRank.run(id, t.cc, today, t.chart, t.genre, i + 1);
          found++;
        }
      });
    } catch {
      chartFailures++;
    }
    state.done++;
  };
  // itunes.apple.com requests are paced by its shared gate, so concurrency there only overlaps
  // latency; the unthrottled feed runs alongside it instead of queueing behind the gate.
  const throttled = tasks.filter((t) => isThrottledChart(t.chart, t.genre));
  const free = tasks.filter((t) => !isThrottledChart(t.chart, t.genre));
  await Promise.all([mapLimit(throttled, 4, check), mapLimit(free, 16, check)]);
  if (chartFailures) state.errors.push(`${chartFailures} chart requests failed (Apple throttling); they'll be retried next run.`);

  const rated = [...availability.values()].reduce((n, s) => n + s.size, 0);
  state.summary = `Checked ${countries.length} storefronts (${rated} app listings) and ${tasks.length} charts; ${found} chart positions found.`;
}
