import type { RangeId } from './prefs';

// Apple's sales reports are dated in Pacific Time; all date math here works on
// plain YYYY-MM-DD strings using UTC so it never drifts with the server timezone.

export function pacificToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let m = start; m <= end; m = addMonths(m, 1)) out.push(m);
  return out;
}

export interface SyncWindow {
  /** Most recent daily report that can exist (yesterday, Pacific). */
  latestDay: string;
  /** First day fetched with daily reports; always the 1st of a month. */
  dailyStart: string;
  /** Monthly reports cover [monthlyStart, monthlyEnd] (YYYY-MM). Empty when monthlyStart > monthlyEnd. */
  monthlyStart: string;
  monthlyEnd: string;
  /** Yearly reports cover [yearlyStart, yearlyEnd] (YYYY). Empty when yearlyStart > yearlyEnd. */
  yearlyStart: string;
  yearlyEnd: string;
  /** First day of daily-only reports (subscriptions), which Apple keeps for 365 days. */
  subscriptionStart: string;
}

/** The App Store Connect API (and so any vendor's sales data) starts here. */
const FIRST_SALES_YEAR = 2008;

/**
 * Apple keeps daily reports for 365 days, monthly reports for 12 months and
 * yearly reports forever. Daily coverage starts on the first full month inside
 * the daily window; the partial month before it comes from its monthly report;
 * everything older only exists as yearly totals.
 *
 * `earliestRelease` bounds the backfill; pass null when some app's release date
 * is unknown so every year is checked.
 */
export function syncWindow(earliestRelease?: string | null): SyncWindow {
  const latestDay = addDays(pacificToday(), -1);
  const oldestDaily = addDays(latestDay, -364);
  let dailyStart = oldestDaily.endsWith('-01') ? oldestDaily : addMonths(oldestDaily.slice(0, 7), 1) + '-01';
  const monthlyEnd = addMonths(dailyStart.slice(0, 7), -1);
  let monthlyStart = monthlyEnd;
  let yearlyStart = String(FIRST_SALES_YEAR);
  // Only completed years have a report; the current one is covered by daily/monthly data.
  const yearlyEnd = String(Number(pacificToday().slice(0, 4)) - 1);

  if (earliestRelease) {
    const releaseMonth = earliestRelease.slice(0, 7);
    if (releaseMonth > monthlyStart) monthlyStart = releaseMonth;
    // Nothing to fetch before the first app existed.
    if (earliestRelease.slice(0, 10) > dailyStart) dailyStart = earliestRelease.slice(0, 10);
    yearlyStart = earliestRelease.slice(0, 4);
  }
  const releaseDay = earliestRelease?.slice(0, 10);
  const subscriptionStart = releaseDay && releaseDay > oldestDaily ? releaseDay : oldestDaily;

  return { latestDay, dailyStart, monthlyStart, monthlyEnd, yearlyStart, yearlyEnd, subscriptionStart };
}

export function yearsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let y = Number(start); y <= Number(end); y++) out.push(String(y));
  return out;
}

/** A single calendar month as a range id: "m:2026-09". */
export const MONTH_RANGE = /^m:(\d{4}-\d{2})$/;

export function lastDayOfMonth(month: string): string {
  return addDays(addMonths(month, 1) + '-01', -1);
}

/** Resolve a range preset, a month ("m:YYYY-MM") or explicit dates to an inclusive [start, end]. */
export function resolveRange(range: string | null, start?: string | null, end?: string | null) {
  const latest = addDays(pacificToday(), -1);
  if (start || end) return { start: start || undefined, end: end || latest };
  const month = range?.match(MONTH_RANGE)?.[1];
  if (month) {
    const last = lastDayOfMonth(month);
    return { start: `${month}-01`, end: last < latest ? last : latest };
  }
  const days: Partial<Record<RangeId, number>> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
  const r = (range || '90d') as RangeId;
  if (r === 'all') return { start: undefined, end: undefined };
  if (r === 'ytd') return { start: latest.slice(0, 4) + '-01-01', end: latest };
  return { start: addDays(latest, -((days[r] ?? 90) - 1)), end: latest };
}

/**
 * The period a range is compared against: a month with the whole month before it (also
 * while the current month is still running), anything else with the equally long
 * stretch right before it.
 */
export function previousRange(range: string | null, start: string, end: string) {
  const month = range?.match(MONTH_RANGE)?.[1];
  if (month) {
    const prev = addMonths(month, -1);
    return { start: `${prev}-01`, end: lastDayOfMonth(prev) };
  }
  const len = daysBetween(start, end).length;
  return { start: addDays(start, -len), end: addDays(start, -1) };
}
