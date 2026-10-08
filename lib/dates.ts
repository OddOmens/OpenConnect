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
  /** First day of daily-only reports (subscriptions), which Apple keeps for 365 days. */
  subscriptionStart: string;
}

/**
 * Daily reports exist for the last 365 days. To avoid gaps or double counting at
 * the boundary, daily coverage starts on the first full month inside that window
 * and everything before it comes from monthly reports.
 */
export function syncWindow(backfillYears: number, earliestRelease?: string | null): SyncWindow {
  const latestDay = addDays(pacificToday(), -1);
  const oldestDaily = addDays(latestDay, -364);
  let dailyStart = oldestDaily.endsWith('-01') ? oldestDaily : addMonths(oldestDaily.slice(0, 7), 1) + '-01';
  const monthlyEnd = addMonths(dailyStart.slice(0, 7), -1);
  let monthlyStart = addMonths(dailyStart.slice(0, 7), -backfillYears * 12);

  if (earliestRelease) {
    const releaseMonth = earliestRelease.slice(0, 7);
    if (releaseMonth > monthlyStart) monthlyStart = releaseMonth;
    // Nothing to fetch before the first app existed.
    if (earliestRelease.slice(0, 10) > dailyStart) dailyStart = earliestRelease.slice(0, 10);
  }
  if (backfillYears <= 0) monthlyStart = addMonths(monthlyEnd, 1);
  const releaseDay = earliestRelease?.slice(0, 10);
  const subscriptionStart = releaseDay && releaseDay > oldestDaily ? releaseDay : oldestDaily;

  return { latestDay, dailyStart, monthlyStart, monthlyEnd, subscriptionStart };
}

/** Resolve a range preset (or explicit dates) to an inclusive [start, end]. */
export function resolveRange(range: string | null, start?: string | null, end?: string | null) {
  const latest = addDays(pacificToday(), -1);
  if (start || end) return { start: start || undefined, end: end || latest };
  const days: Partial<Record<RangeId, number>> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
  const r = (range || '90d') as RangeId;
  if (r === 'all') return { start: undefined, end: undefined };
  if (r === 'ytd') return { start: latest.slice(0, 4) + '-01-01', end: latest };
  return { start: addDays(latest, -((days[r] ?? 90) - 1)), end: latest };
}
