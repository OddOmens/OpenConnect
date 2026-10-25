// Public, unauthenticated App Store endpoints: per-storefront ratings (iTunes
// Lookup), per-storefront top charts (iTunes RSS, top 100 per chart), and App Store
// search results and suggestions (for keyword ranks, see lib/aso.ts).

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

export interface SearchHit {
  id: string;
  name: string;
  seller: string;
  icon: string | null;
  ratings: number;
  rating: number | null;
  price: number | null;
  genre: string | null;
  released: string | null;
  updated: string | null;
}

/** App Store search in one storefront, in result order (index 0 = #1). Apple returns at most 200. */
export async function searchStore(term: string, country: string): Promise<SearchHit[]> {
  const params = new URLSearchParams({ term, country: country.toLowerCase(), entity: 'software', limit: '200' });
  const body = await getJson(`https://itunes.apple.com/search?${params}`);
  return (body?.results || [])
    .filter((r: any) => r.wrapperType === 'software' || r.kind === 'software')
    .map((r: any) => ({
      id: String(r.trackId),
      name: r.trackName || '',
      seller: r.sellerName || r.artistName || '',
      icon: r.artworkUrl100 || r.artworkUrl60 || null,
      ratings: r.userRatingCount || 0,
      rating: typeof r.averageUserRating === 'number' ? r.averageUserRating : null,
      price: typeof r.price === 'number' ? r.price : null,
      genre: r.primaryGenreName || null,
      released: r.releaseDate || null,
      updated: r.currentVersionReleaseDate || null,
    }));
}

// App Store storefront ids, which the search-suggestions endpoint needs to answer per country.
// Only storefronts whose id has been checked against localized suggestions are listed.
export const STOREFRONT_IDS: Record<string, number> = {
  US: 143441, FR: 143442, DE: 143443, GB: 143444, AT: 143445, BE: 143446, FI: 143447, GR: 143448, IE: 143449,
  IT: 143450, LU: 143451, NL: 143452, PT: 143453, ES: 143454, CA: 143455, SE: 143456, NO: 143457, DK: 143458,
  CH: 143459, AU: 143460, NZ: 143461, JP: 143462, HK: 143463, SG: 143464, CN: 143465, KR: 143466, IN: 143467,
  MX: 143468, RU: 143469, TW: 143470, VN: 143471, ZA: 143472, MY: 143473, PH: 143474, TH: 143475, ID: 143476,
  PK: 143477, PL: 143478, SA: 143479, TR: 143480, AE: 143481, HU: 143482, CL: 143483, CZ: 143489, IL: 143491,
  UA: 143492, CO: 143501, BR: 143503, AR: 143505,
};

const hintGate = { next: 0 };

/**
 * What App Store search suggests as someone types `prefix`, most searched first. Empty for a
 * storefront without a known id. Unofficial endpoint: treat an error as "no suggestions".
 */
export async function searchHints(prefix: string, country: string): Promise<string[]> {
  const storefront = STOREFRONT_IDS[country.toUpperCase()];
  if (!storefront || !prefix.trim()) return [];
  const now = Date.now();
  const at = Math.max(now, hintGate.next);
  hintGate.next = at + 300;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
  try {
    const res = await fetch(
      `https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints?clientApplication=Software&term=${encodeURIComponent(prefix)}`,
      { cache: 'no-store', headers: { 'User-Agent': 'OpenConnect/1.0', 'X-Apple-Store-Front': `${storefront}-1,29` } }
    );
    if (!res.ok) return [];
    const xml = await res.text();
    const decode = (s: string) =>
      s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
    return [...xml.matchAll(/<key>term<\/key>\s*<string>([^<]*)<\/string>/g)].map((m) => decode(m[1]).trim()).filter(Boolean);
  } catch {
    return [];
  }
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
