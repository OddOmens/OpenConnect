// Response bodies shared by the API routes and the server-rendered first page load, so
// both read the same (cached) data. Nothing here talks to Apple: it's all local SQLite.

import { cached } from './cache';
import { credentialSources, getCredentials, getSyncConfig, getUiPrefs } from './config';
import { resolveRange } from './dates';
import { availableMonths, dashboard, dataBounds, HistoryGranularity, listApps, reach, storePresence } from './queries';

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
  const key = `dashboard|${appId}|${p.range}|${p.start}|${p.end}|${granularity}|${currency}|${p.compare}`;
  return cached(key, () => {
    const { start, end } = resolveRange(p.range, p.start, p.end);
    const data = dashboard({ appId, start, end }, granularity, currency, p.compare, p.range);
    // Reach covers every app (the section compares them); it only depends on the range.
    const reachData = cached(`reach|${start}|${end}`, () => reach({ start, end }));
    return { range: { start, end }, bounds: dataBounds(appId), ...data, reach: reachData };
  });
}

export function storeResponse(app: string | null) {
  const appId = app && app !== 'all' ? app : undefined;
  return cached(`store|${appId}`, () => storePresence(appId));
}
