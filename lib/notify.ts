// Notifications sent to Signal through a signal-cli-rest-api server
// (https://github.com/bbernhard/signal-cli-rest-api):
//  - chart entries, right after a ratings & rankings check finds an app in a top 100 chart
//    it wasn't in at the check before;
//  - a daily recap of every app at a set time: its last reported day of downloads and
//    proceeds, ratings, new reviews and chart moves.

import { getDb } from './db';
import { getJson, getNotifyConfig, getUiPrefs, setSetting } from './config';
import { addDays } from './dates';
import { CHARTS, ChartId, NotifyConfig } from './prefs';
import { FX_JOIN, SUMS, currencyRate } from './queries';
import { territoryName } from './territories';

export function notifyConfigured(c: NotifyConfig = getNotifyConfig()) {
  return !!(c.signalUrl && c.signalNumber && c.signalTo);
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

async function signalFetch(c: NotifyConfig, path: string, init?: RequestInit) {
  const res = await fetch(`${c.signalUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'OpenConnect/1.0' },
    signal: AbortSignal.timeout(20_000),
  }).catch((err) => {
    throw new Error(`Couldn’t reach the Signal API at ${c.signalUrl} (${err?.cause?.code || err?.message || err}).`);
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Signal API: ${body?.error || `HTTP ${res.status}`}`);
  return body;
}

/** A phone number or group.… id as is; anything else is the name of one of the account's groups. */
async function recipient(c: NotifyConfig): Promise<string> {
  const to = c.signalTo;
  if (/^\+\d+$/.test(to) || to.startsWith('group.')) return to;
  const groups = ((await signalFetch(c, `/v1/groups/${encodeURIComponent(c.signalNumber)}`)) || []) as { name: string; id: string }[];
  const group = groups.find((g) => g.name?.trim().toLowerCase() === to.toLowerCase());
  if (!group) throw new Error(`${c.signalNumber} isn’t in a Signal group named “${to}”.`);
  return group.id;
}

export async function sendSignal(message: string, c: NotifyConfig = getNotifyConfig()) {
  if (!notifyConfigured(c)) throw new Error('Signal isn’t set up: fill in the API address, the number and who to send to.');
  await signalFetch(c, '/v2/send', {
    method: 'POST',
    body: JSON.stringify({ number: c.signalNumber, recipients: [await recipient(c)], message }),
  });
}

// ---------------------------------------------------------------------------
// Chart positions
// ---------------------------------------------------------------------------

interface AppInfo {
  name: string;
  genreId: string | null;
  genre: string | null;
}

function visibleApps(): Map<string, AppInfo> {
  const rows = getDb()
    .prepare(`SELECT apple_id, name, primary_genre_id, primary_genre FROM apps WHERE hidden = 0 ORDER BY name`)
    .all() as { apple_id: string; name: string | null; primary_genre_id: string | null; primary_genre: string | null }[];
  return new Map(rows.map((r) => [r.apple_id, { name: r.name || r.apple_id, genreId: r.primary_genre_id, genre: r.primary_genre }]));
}

/** "Top Free Productivity · Germany", "Top Grossing overall · Japan" */
function chartLabel(app: AppInfo | undefined, cc: string, chart: string, genre: string) {
  const name = CHARTS[chart as ChartId] || chart;
  const where = genre === '0' ? 'overall' : genre === app?.genreId && app.genre ? app.genre : 'category';
  return `${name} ${where} · ${territoryName(cc)}`;
}

const pacificDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(iso));

/**
 * The newest chart check and the one before it. The earlier date comes from the sync runs, not the
 * rankings, so an app that held no positions at the last check counts as entering when it shows up.
 */
function checkDates(): { latest: string | null; previous: string | null } {
  const db = getDb();
  const latest = (db.prepare(`SELECT MAX(date) AS d FROM rankings`).get() as { d: string | null }).d;
  if (!latest) return { latest: null, previous: null };
  const runs = db
    .prepare(`SELECT started_at FROM job_runs WHERE job = 'store' AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 500`)
    .all() as { started_at: string }[];
  const previous = runs.map((r) => pacificDate(r.started_at)).find((d) => d < latest) || null;
  return { latest, previous };
}

interface Position {
  appId: string;
  cc: string;
  chart: string;
  genre: string;
  rank: number;
}

const keyOf = (p: Position) => `${p.appId}|${p.cc}|${p.chart}|${p.genre}`;

function positions(date: string | null): Map<string, Position> {
  if (!date) return new Map();
  const rows = getDb()
    .prepare(`SELECT apple_id AS appId, country_code AS cc, chart, genre_id AS genre, rank FROM rankings WHERE date = ?`)
    .all(date) as Position[];
  return new Map(rows.map((p) => [keyOf(p), p]));
}

interface ChartMoves {
  now: Position[];
  entered: Position[];
  up: (Position & { old: number })[];
  down: (Position & { old: number })[];
  dropped: Position[];
}

function chartMoves(latest: string | null, previous: string | null): Map<string, ChartMoves> {
  const after = positions(latest);
  const before = positions(previous);
  const out = new Map<string, ChartMoves>();
  const of = (id: string) => {
    if (!out.has(id)) out.set(id, { now: [], entered: [], up: [], down: [], dropped: [] });
    return out.get(id)!;
  };
  for (const [key, p] of after) {
    const m = of(p.appId);
    m.now.push(p);
    const old = before.get(key)?.rank;
    if (old === undefined) m.entered.push(p);
    else if (p.rank < old) m.up.push({ ...p, old });
    else if (p.rank > old) m.down.push({ ...p, old });
  }
  for (const [key, p] of before) if (!after.has(key)) of(p.appId).dropped.push(p);
  for (const m of out.values()) {
    m.now.sort((a, b) => a.rank - b.rank);
    m.entered.sort((a, b) => a.rank - b.rank);
    m.up.sort((a, b) => b.old - b.rank - (a.old - a.rank));
    m.down.sort((a, b) => b.rank - b.old - (a.rank - a.old));
  }
  return out;
}

/** "a; b; c and 4 more" */
function listed(items: string[], max: number) {
  return items.length > max ? `${items.slice(0, max).join('; ')} and ${items.length - max} more` : items.join('; ');
}

/** After a ratings & rankings check: one message with every chart an app has just entered. */
export async function notifyChartEntries() {
  const c = getNotifyConfig();
  if (!notifyConfigured(c) || !c.chartEntries) return;
  const { latest, previous } = checkDates();
  // The very first check finds everything "new"; there's nothing to compare it with yet.
  if (!latest || !previous) return;

  const apps = visibleApps();
  const sent = getJson<{ date: string; keys: string[] }>('notify_chart_sent');
  const already = new Set(sent?.date === latest ? sent.keys : []);
  const fresh = [...chartMoves(latest, previous)]
    .filter(([id]) => apps.has(id))
    .map(([id, m]) => [id, m.entered.filter((p) => !already.has(keyOf(p)))] as const)
    .filter(([, entered]) => entered.length);
  if (!fresh.length) return;

  const blocks = fresh.map(([id, entered]) => {
    const app = apps.get(id);
    const lines = entered.slice(0, 12).map((p) => `#${p.rank} ${chartLabel(app, p.cc, p.chart, p.genre)}`);
    if (entered.length > 12) lines.push(`and ${entered.length - 12} more`);
    return `📈 ${app?.name} entered ${entered.length === 1 ? 'a top 100 chart' : `${entered.length} top 100 charts`}\n${lines.join('\n')}`;
  });
  await sendSignal(blocks.join('\n\n'), c);
  setSetting('notify_chart_sent', JSON.stringify({
    date: latest,
    keys: [...already, ...fresh.flatMap(([, entered]) => entered.map(keyOf))],
  }));
}

// ---------------------------------------------------------------------------
// Daily recap
// ---------------------------------------------------------------------------

function fmtMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtAvg = (n: number) => (n && n < 10 ? n.toFixed(1) : fmtInt(n));
const downloads = (n: number) => `${fmtInt(n)} ${n === 1 ? 'download' : 'downloads'}`;
const fmtDay = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
const stars = (n: number) => '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(Math.max(0, 5 - n));

/** Each app's ratings in every storefront, as they stood on `date` (newest per storefront up to then). */
function ratingsAsOf(date: string | null): Map<string, { count: number; avg: number | null }> {
  if (!date) return new Map();
  const rows = getDb()
    .prepare(`
      SELECT r.apple_id, SUM(r.rating_count) AS count,
             SUM(r.avg_rating * r.rating_count) / NULLIF(SUM(CASE WHEN r.avg_rating IS NOT NULL THEN r.rating_count END), 0) AS avg
      FROM ratings r
      WHERE r.date = (SELECT MAX(date) FROM ratings x WHERE x.apple_id = r.apple_id AND x.country_code = r.country_code AND x.date <= ?)
      GROUP BY r.apple_id`)
    .all(date) as { apple_id: string; count: number | null; avg: number | null }[];
  return new Map(rows.map((r) => [r.apple_id, { count: r.count || 0, avg: r.avg }]));
}

/** Local date and time ("2026-10-24", "08:05") in a time zone. */
function localNow(timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

interface RecapState {
  date: string; // local date of the last recap sent
  reviewRowid: number;
}

/** The recap text, and the newest review it covered (so the next one starts after it). */
export function buildRecap(since: RecapState | null = getJson<RecapState>('notify_recap_state')): { text: string; reviewRowid: number } {
  const db = getDb();
  const c = getNotifyConfig();
  const apps = visibleApps();
  const currency = getUiPrefs().currency || 'USD';
  const rate = currencyRate(currency);

  // Sales: the last day Apple has reported, against the 7 days before it.
  const salesDay = (db.prepare(`SELECT MAX(date) AS d FROM sales WHERE granularity = 'D'`).get() as { d: string | null }).d;
  const sales = new Map<string, { day: { n: number; p: number }; week: { n: number; p: number } }>();
  if (salesDay) {
    const rows = db
      .prepare(`SELECT s.apple_id, s.date, ${SUMS} FROM sales s ${FX_JOIN}
                WHERE s.granularity = 'D' AND s.date BETWEEN ? AND ? GROUP BY s.apple_id, s.date`)
      .all(addDays(salesDay, -7), salesDay) as { apple_id: string; date: string; first_time: number; proceeds_usd: number }[];
    for (const r of rows) {
      const s = sales.get(r.apple_id) || { day: { n: 0, p: 0 }, week: { n: 0, p: 0 } };
      const bucket = r.date === salesDay ? s.day : s.week;
      bucket.n += r.first_time;
      bucket.p += r.proceeds_usd * rate;
      sales.set(r.apple_id, s);
    }
  }

  // Ratings: the newest check against the one before it.
  const ratingDay = (db.prepare(`SELECT MAX(date) AS d FROM ratings`).get() as { d: string | null }).d;
  const ratingPrev = ratingDay ? (db.prepare(`SELECT MAX(date) AS d FROM ratings WHERE date < ?`).get(ratingDay) as { d: string | null }).d : null;
  const ratingsNow = ratingsAsOf(ratingDay);
  const ratingsBefore = ratingsAsOf(ratingPrev);

  // Reviews stored since the last recap (the last day's, the first time).
  const reviews = (since
    ? db.prepare(`SELECT rowid, apple_id, rating, title, country_code FROM reviews WHERE rowid > ? ORDER BY created_date DESC`).all(since.reviewRowid)
    : db.prepare(`SELECT rowid, apple_id, rating, title, country_code FROM reviews WHERE created_date >= ? ORDER BY created_date DESC`)
        .all(new Date(Date.now() - 86_400_000).toISOString())) as { rowid: number; apple_id: string; rating: number; title: string | null; country_code: string }[];
  const reviewRowid = (db.prepare(`SELECT COALESCE(MAX(rowid), 0) AS n FROM reviews`).get() as { n: number }).n;

  const { latest, previous } = checkDates();
  const moves = chartMoves(latest, previous);

  const blocks: string[] = [];
  const quiet: string[] = [];
  const total = { n: 0, p: 0 };
  for (const [id, app] of apps) {
    const lines: string[] = [];
    const s = sales.get(id);
    if (s && (s.day.n || s.day.p || s.week.n)) {
      total.n += s.day.n;
      total.p += s.day.p;
      const avg = `7-day avg ${fmtAvg(s.week.n / 7)}${s.week.p ? ` · ${fmtMoney(s.week.p / 7, currency)}` : ''}`;
      lines.push(`${downloads(s.day.n)}${s.day.p || s.week.p ? ` · ${fmtMoney(s.day.p, currency)}` : ''} (${avg})`);
    }

    const r = ratingsNow.get(id);
    const was = ratingsBefore.get(id);
    if (r?.count) {
      const diff = was ? r.count - was.count : 0;
      lines.push(`${fmtInt(r.count)} ratings${diff ? ` (${diff > 0 ? '+' : '−'}${fmtInt(Math.abs(diff))})` : ''}${r.avg != null ? ` · ${r.avg.toFixed(2)}★` : ''}`);
    }

    const mine = reviews.filter((x) => x.apple_id === id);
    if (mine.length) {
      const quoted = mine.slice(0, 3).map((x) => `${stars(x.rating)} “${(x.title || '(no title)').slice(0, 60)}” (${x.country_code})`);
      lines.push(`${mine.length} new ${mine.length === 1 ? 'review' : 'reviews'}: ${quoted.join(', ')}${mine.length > 3 ? ` and ${mine.length - 3} more` : ''}`);
    }

    const m = moves.get(id);
    if (m) {
      const at = (p: Position) => chartLabel(app, p.cc, p.chart, p.genre);
      if (m.entered.length) lines.push(`Entered: ${listed(m.entered.map((p) => `#${p.rank} ${at(p)}`), 3)}`);
      if (m.up.length) lines.push(`Up: ${listed(m.up.map((p) => `#${p.old} → #${p.rank} ${at(p)}`), 3)}`);
      if (m.down.length) lines.push(`Down: ${listed(m.down.map((p) => `#${p.old} → #${p.rank} ${at(p)}`), 3)}`);
      if (m.dropped.length) lines.push(`Left the top 100: ${listed(m.dropped.map((p) => `was #${p.rank} ${at(p)}`), 3)}`);
      if (m.now.length) {
        const countries = new Set(m.now.map((p) => p.cc)).size;
        lines.push(`Charting in ${countries} ${countries === 1 ? 'country' : 'countries'} (${m.now.length} ${m.now.length === 1 ? 'chart' : 'charts'}), best #${m.now[0].rank} ${at(m.now[0])}`);
      }
    }

    const active = (s?.day.n || s?.day.p) || (r && was && r.count !== was.count) || mine.length || m?.now.length || m?.dropped.length;
    if (active) blocks.push(`${app.name}\n${lines.map((l) => `• ${l}`).join('\n')}`);
    else quiet.push(app.name);
  }

  const today = localNow(c.timezone).date;
  const head = [`☀️ Daily recap · ${fmtDay(today)}`];
  if (salesDay) head.push(`Sales for ${fmtDay(salesDay)}${blocks.length > 1 ? `: ${downloads(total.n)}${total.p ? ` · ${fmtMoney(total.p, currency)}` : ''} across all apps` : ''}`);
  const parts = [head.join('\n'), ...blocks];
  if (quiet.length) parts.push(`Quiet: ${quiet.join(', ')}`);
  if (!apps.size) parts.push('No apps yet: sync with App Store Connect first.');
  return { text: parts.join('\n\n'), reviewRowid };
}

const g = globalThis as unknown as { __recapSending?: boolean; __recapTriedAt?: number };

/** Called by the scheduler: sends the recap once a day, at or after the set time. */
export async function maybeSendRecap() {
  const c = getNotifyConfig();
  if (!notifyConfigured(c) || !c.recap || g.__recapSending) return;
  const now = localNow(c.timezone);
  const state = getJson<RecapState>('notify_recap_state');
  if (now.time < c.recapTime || state?.date === now.date) return;
  // After a failed send, try again every half hour rather than every tick.
  if (g.__recapTriedAt && Date.now() - g.__recapTriedAt < 30 * 60_000) return;
  g.__recapSending = true;
  g.__recapTriedAt = Date.now();
  try {
    const recap = buildRecap(state);
    await sendSignal(recap.text, c);
    setSetting('notify_recap_state', JSON.stringify({ date: now.date, reviewRowid: recap.reviewRowid }));
    g.__recapTriedAt = undefined;
  } finally {
    g.__recapSending = false;
  }
}
