// In-memory cache for query results. Everything the dashboard shows comes from the local
// database and only changes when a sync finishes, an app is hidden or shown, exchange
// rates update, or a new day starts; the cache is dropped whenever any of those change.

import { getDb } from './db';
import { pacificToday } from './dates';
import { getJobStates } from './sync';

const g = globalThis as unknown as { __queryCache?: { version: string; entries: Map<string, unknown> } };

/** Changes whenever anything a query reads could have changed. */
export function dataVersion(): string {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT
        (SELECT COALESCE(MAX(finished_at), '') FROM job_runs) AS runs,
        (SELECT COALESCE(group_concat(apple_id || ':' || hidden || ':' || COALESCE(icon_url, '')), '') FROM apps) AS apps,
        (SELECT COALESCE(MAX(updated_at), '') FROM fx_rates) AS fx`)
    .get() as { runs: string; apps: string; fx: string };
  // While a sync is writing, results go stale quickly: keep them for 5 seconds at most.
  const running = Object.values(getJobStates()).some((j) => j.running);
  const live = running ? `live:${Math.floor(Date.now() / 5000)}` : '';
  return [row.runs, row.apps, row.fx, pacificToday(), live].join('|');
}

export function cached<T>(key: string, compute: () => T): T {
  const version = dataVersion();
  if (!g.__queryCache || g.__queryCache.version !== version) g.__queryCache = { version, entries: new Map() };
  const entries = g.__queryCache.entries;
  if (entries.has(key)) return entries.get(key) as T;
  const value = compute();
  entries.set(key, value);
  if (entries.size > 200) entries.delete(entries.keys().next().value!);
  return value;
}
