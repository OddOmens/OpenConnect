// Public, unauthenticated App Store endpoints: per-storefront ratings (iTunes
// Lookup) and per-storefront top charts (iTunes RSS, top 100 per chart).

import type { ChartId } from './prefs';

// itunes.apple.com rate-limits per IP and answers 403 once you go too fast.
// All requests to it share one adaptive gate: slow down on 403, speed up on success.
const gate = { interval: 250, next: 0 };
const MIN_INTERVAL = 250;
const MAX_INTERVAL = 15_000;

async function waitTurn() {
  const now = Date.now();
  const at = Math.max(now, gate.next);
  gate.next = at + gate.interval;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

async function getJson(url: string, attempt = 0): Promise<any> {
  const throttled = url.startsWith('https://itunes.apple.com/');
  if (throttled) await waitTurn();
  const res = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'OpenConnect/1.0' } });
  if (res.ok) {
    if (throttled) gate.interval = Math.max(MIN_INTERVAL, gate.interval * 0.9);
    return res.json();
  }
  if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt < 8) {
    if (throttled) gate.interval = Math.min(MAX_INTERVAL, gate.interval * 2);
    else await new Promise((r) => setTimeout(r, 1500 * 2 ** Math.min(attempt, 4)));
    return getJson(url, attempt + 1);
  }
  if (res.status === 404 || res.status === 400) return null;
  throw new Error(`${url} → HTTP ${res.status}`);
}

export interface StoreListing {
  appleId: string;
  avgRating: number | null;
  ratingCount: number;
  currentAvgRating: number | null;
  currentRatingCount: number;
  version: string | null;
  price: number | null;
  iconUrl: string | null;
  storeUrl: string | null;
  primaryGenreId: string | null;
  primaryGenre: string | null;
  releaseDate: string | null;
}

/** Look up several apps in one storefront. Apps not sold there are simply absent. */
export async function lookupApps(appleIds: string[], country: string): Promise<StoreListing[]> {
  const body = await getJson(
    `https://itunes.apple.com/lookup?id=${appleIds.join(',')}&country=${country.toLowerCase()}&entity=software`
  );
  return (body?.results || [])
    .filter((r: any) => r.wrapperType === 'software' || r.kind === 'software')
    .map((r: any) => ({
      appleId: String(r.trackId),
      avgRating: typeof r.averageUserRating === 'number' ? r.averageUserRating : null,
      ratingCount: r.userRatingCount || 0,
      currentAvgRating:
        typeof r.averageUserRatingForCurrentVersion === 'number' ? r.averageUserRatingForCurrentVersion : null,
      currentRatingCount: r.userRatingCountForCurrentVersion || 0,
      version: r.version || null,
      price: typeof r.price === 'number' ? r.price : null,
      iconUrl: r.artworkUrl512 || r.artworkUrl100 || null,
      storeUrl: r.trackViewUrl ? String(r.trackViewUrl).split('?')[0] : null,
      primaryGenreId: r.primaryGenreId ? String(r.primaryGenreId) : null,
      primaryGenre: r.primaryGenreName || null,
      releaseDate: r.releaseDate || null,
    }));
}

const CHART_FEED: Record<ChartId, string> = {
  topfree: 'topfreeapplications',
  toppaid: 'toppaidapplications',
  topgrossing: 'topgrossingapplications',
};

const OVERALL_FEED: Partial<Record<ChartId, string>> = { topfree: 'top-free', toppaid: 'top-paid' };

/** False for charts served by the newer marketing-tools feed, which isn't rate limited. */
export function isThrottledChart(chart: ChartId, genreId: string): boolean {
  return !((!genreId || genreId === '0') && OVERALL_FEED[chart]);
}

/** Returns app ids in chart order (index 0 = #1). Empty if the storefront has no such chart. */
export async function fetchChart(country: string, chart: ChartId, genreId: string): Promise<string[]> {
  const overall = !genreId || genreId === '0';
  // The newer marketing-tools feed covers the overall free/paid charts and isn't throttled.
  if (!isThrottledChart(chart, genreId)) {
    const body = await getJson(
      `https://rss.marketingtools.apple.com/api/v2/${country.toLowerCase()}/apps/${OVERALL_FEED[chart]}/100/apps.json`
    );
    return (body?.feed?.results || []).map((r: any) => String(r.id));
  }
  const genre = overall ? '' : `/genre=${genreId}`;
  const body = await getJson(
    `https://itunes.apple.com/${country.toLowerCase()}/rss/${CHART_FEED[chart]}/limit=200${genre}/json`
  );
  const entries = body?.feed?.entry;
  if (!entries) return [];
  return [].concat(entries).map((e: any) => String(e?.id?.attributes?.['im:id'] ?? ''));
}

export async function fetchUsdRates(): Promise<Record<string, number> | null> {
  try {
    const body = await getJson('https://open.er-api.com/v6/latest/USD');
    return body?.result === 'success' ? body.rates : null;
  } catch {
    return null;
  }
}

/** Run `fn` over `items` with bounded concurrency. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
