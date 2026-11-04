// Response bodies shared by the API routes and the server-rendered first page load, so
// both read the same (cached) data. Nothing here talks to Apple: it's all local SQLite.

import { cached } from './cache';
import { credentialSources, getCredentials, getNotifyConfig, getSyncConfig, getUiPrefs } from './config';
import { addDays, pacificToday, rangeDay, resolveRange } from './dates';
import { appTotals, availableMonths, comparisonRange, dailyCoverage, dashboard, dataBounds, HistoryGranularity, listApps, reach, storePresence } from './queries';

export function settingsResponse() {
  const creds = getCredentials();
  return {
    credentials: {
      key_id: creds.key_id,
      issuer_id: creds.issuer_id,
      private_key_path: creds.private_key_path,
      vendor_number: creds.vendor_number,
      // Never send the key itself back to the browser.
      has_private_key: !!creds.private_key,
    },
    sources: credentialSources(),
    sync: getSyncConfig(),
    prefs: getUiPrefs(),
    notify: getNotifyConfig(),
  };
}

export function appsResponse() {
  return cached('apps', () => ({ apps: listApps(), months: availableMonths() }));
}

export interface DashboardParams {
  app: string | null;          // apple id, or null/'all' for all visible apps
  range: string | null;
  start?: string | null;
  end?: string | null;
  granularity: string | null;
  currency: string | null;
  compare: boolean;
}

export function dashboardResponse(p: DashboardParams) {
  const appId = p.app && p.app !== 'all' ? p.app : undefined;
  const granularity = (['day', 'week', 'month', 'year'].includes(p.granularity || '') ? p.granularity : 'day') as HistoryGranularity;
  const currency = p.currency || 'USD';
  // Presets like Today and Last 7 days move at midnight (Pacific), so the day is part of the key.
  const key = `dashboard|${pacificToday()}|${appId}|${p.range}|${p.start}|${p.end}|${granularity}|${currency}|${p.compare}`;
  return cached(key, () => {
    const { start, end } = resolveRange(p.range, p.start, p.end);
    // One day is charted day by day with the two weeks before it, so it has something to stand against.
    const day = !p.start && !p.end && rangeDay(p.range);
    const data = day
      ? dashboard({ appId, start, end }, 'day', currency, p.compare, p.range, addDays(day, -13))
      : dashboard({ appId, start, end }, granularity, currency, p.compare, p.range);
    // Reach and the Apps section cover every app (they compare them); they only depend on the range.
    const reachData = cached(`reach|${start}|${end}`, () => reach({ start, end }));
    const apps = cached(`apps|${start}|${end}|${currency}|${p.compare}|${p.range}`, () =>
      appTotals({ start, end }, currency, p.compare ? comparisonRange({ start, end }, p.range) : null)
    );
    return { range: { start, end }, day: day || null, bounds: dataBounds(appId), daily: dailyCoverage(), ...data, reach: reachData, apps };
  });
}

export function storeResponse(app: string | null) {
  const appId = app && app !== 'all' ? app : undefined;
  return cached(`store|${appId}`, () => storePresence(appId));
}
