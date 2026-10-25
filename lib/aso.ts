// App Store Optimization: the listing as App Store Connect holds it, search ranks for the
// keywords you track, and what the analytics reports say about search.
//
// - Listings come from the App Store Connect API (appInfos for name and subtitle, app store
//   versions for keywords, promotional text and description), every Sales & analytics sync.
//   Each released version's metadata is fetched once; diffing consecutive versions gives the
//   keyword history back to before OpenConnect was installed.
// - Ranks come from Apple's public search API, once a day with Ratings & Rankings. It follows
//   App Store search closely, not exactly. One search per keyword and storefront serves every app.
// - Popularity is estimated from App Store search suggestions: the fewer letters someone has to
//   type before the keyword is suggested, the more it is searched.

import { getDb } from './db';
import { AscError, ascGetAll } from './asc-client';
import { mapLimit, searchHints, searchStore, SearchHit, STOREFRONT_IDS } from './itunes-client';
import { addDays, pacificToday } from './dates';
import { territoryName } from './territories';
import { isGenericWord, words } from './aso-audit';
import type { JobState } from './sync';

// ---------------------------------------------------------------------------
// Listings from App Store Connect
// ---------------------------------------------------------------------------

// A version in one of these states is (or was) on the store.
const RELEASED = new Set([
  'READY_FOR_SALE', 'READY_FOR_DISTRIBUTION', 'REPLACED_WITH_NEW_VERSION', 'REMOVED_FROM_SALE',
  'DEVELOPER_REMOVED_FROM_SALE', 'PROCESSING_FOR_DISTRIBUTION',
]);
// Keywords and the description can only be changed while a version is in one of these.
const EDITABLE = new Set(['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY']);
// Old versions whose metadata is fetched for the history, newest first.
const HISTORY_VERSIONS = 15;

interface AscVersion {
  id: string;
  version: string;
  state: string;
  created: string;
}

interface VersionText {
  keywords: string;
  promotional_text: string;
  description: string;
  whats_new: string;
}

const versionState = (a: any): string => a.appVersionState || a.appStoreState || '';

async function fetchVersions(appId: string): Promise<AscVersion[]> {
  const fields = 'fields[appStoreVersions]=versionString,appStoreState,appVersionState,createdDate,platform';
  let { data } = await ascGetAll(`/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=50&${fields}`);
  // A Mac-only (or tvOS-only) app has no iOS versions.
  if (!data.length) ({ data } = await ascGetAll(`/v1/apps/${appId}/appStoreVersions?limit=50&${fields}`));
  return data
    .map((v) => ({ id: v.id, version: v.attributes.versionString, state: versionState(v.attributes), created: v.attributes.createdDate || '' }))
    .sort((a, b) => b.created.localeCompare(a.created));
}

async function fetchVersionText(versionId: string): Promise<Map<string, VersionText>> {
  const { data } = await ascGetAll(`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=50`);
  return new Map(
    data.map((l) => [
      l.attributes.locale,
      {
        keywords: l.attributes.keywords || '',
        promotional_text: l.attributes.promotionalText || '',
        description: l.attributes.description || '',
        whats_new: l.attributes.whatsNew || '',
      },
    ])
  );
}

async function fetchAppInfos(appId: string) {
  const { data } = await ascGetAll(`/v1/apps/${appId}/appInfos?limit=10`);
  const out: { live: boolean; locales: Map<string, { name: string; subtitle: string }> }[] = [];
  for (const info of data) {
    const { data: locs } = await ascGetAll(`/v1/appInfos/${info.id}/appInfoLocalizations?limit=50`);
    const live = info.attributes.state === 'READY_FOR_DISTRIBUTION' || info.attributes.appStoreState === 'READY_FOR_SALE';
    out.push({ live, locales: new Map(locs.map((l) => [l.attributes.locale, { name: l.attributes.name || '', subtitle: l.attributes.subtitle || '' }])) });
  }
  return out;
}

interface ListingRow {
  locale: string;
  version: string | null;
  version_state: string | null;
  name: string;
  subtitle: string;
  keywords: string;
  promotional_text: string;
  description: string;
  whats_new: string;
}

function mergeListing(
  info: Map<string, { name: string; subtitle: string }> | undefined,
  text: Map<string, VersionText> | undefined,
  version: AscVersion | undefined
): ListingRow[] {
  const locales = new Set([...(info?.keys() || []), ...(text?.keys() || [])]);
  return [...locales].map((locale) => ({
    locale,
    version: version?.version ?? null,
    version_state: version?.state ?? null,
    name: info?.get(locale)?.name ?? '',
    subtitle: info?.get(locale)?.subtitle ?? '',
    keywords: text?.get(locale)?.keywords ?? '',
    promotional_text: text?.get(locale)?.promotional_text ?? '',
    description: text?.get(locale)?.description ?? '',
    whats_new: text?.get(locale)?.whats_new ?? '',
  }));
}

/** Records name, subtitle and promotional text changes, and new locales, against the last sync. */
function recordListingChanges(appId: string, rows: ListingRow[]) {
  const db = getDb();
  const before = new Map(
    (db.prepare(`SELECT locale, name, subtitle, promotional_text FROM aso_listings WHERE apple_id = ? AND kind = 'live'`).all(appId) as
      { locale: string; name: string; subtitle: string; promotional_text: string }[]).map((r) => [r.locale, r])
  );
  if (!before.size) return; // first look at this app: nothing to compare with
  const today = pacificToday();
  const insert = db.prepare(`INSERT INTO aso_changes (apple_id, date, locale, field, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const row of rows) {
    const old = before.get(row.locale);
    if (!old) {
      insert.run(appId, today, row.locale, 'locale', null, row.name);
      continue;
    }
    for (const field of ['name', 'subtitle', 'promotional_text'] as const) {
      if ((old[field] || '') !== (row[field] || '')) insert.run(appId, today, row.locale, field, old[field] || '', row[field] || '');
    }
  }
}

/** Fetches one app's live and draft listing, and the metadata of released versions not seen yet. */
export async function syncListing(appId: string) {
  const db = getDb();
  const [versions, infos, primary] = await Promise.all([
    fetchVersions(appId),
    fetchAppInfos(appId),
    ascGetAll(`/v1/apps?filter[id]=${appId}&fields[apps]=primaryLocale`).then(({ data }) => data[0]?.attributes?.primaryLocale as string | undefined),
  ]);
  if (primary) db.prepare(`UPDATE apps SET primary_locale = ? WHERE apple_id = ?`).run(primary, appId);
  const live = versions.find((v) => RELEASED.has(v.state));
  const draft = versions.find((v) => !RELEASED.has(v.state) && (!live || v.created > live.created));
  const liveInfo = infos.find((i) => i.live)?.locales ?? infos[0]?.locales;
  const draftInfo = infos.find((i) => !i.live)?.locales;

  // Released versions: metadata never changes after release, so each is fetched once.
  const upsertVersion = db.prepare(`
    INSERT INTO aso_versions (id, apple_id, version, state, created_date) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET version = excluded.version, state = excluded.state`);
  versions.forEach((v) => upsertVersion.run(v.id, appId, v.version, v.state, v.created));
  const fetched = new Set(
    (db.prepare(`SELECT id FROM aso_versions WHERE apple_id = ? AND fetched = 1`).all(appId) as { id: string }[]).map((r) => r.id)
  );
  const insertText = db.prepare(`INSERT OR REPLACE INTO aso_version_locales (version_id, locale, keywords, description) VALUES (?, ?, ?, ?)`);
  const markFetched = db.prepare(`UPDATE aso_versions SET fetched = 1 WHERE id = ?`);
  let liveText: Map<string, VersionText> | undefined;
  for (const v of versions.filter((x) => RELEASED.has(x.state)).slice(0, HISTORY_VERSIONS)) {
    // The live version is read every time: its promotional text can change without a new version.
    if (fetched.has(v.id) && v !== live) continue;
    const text = await fetchVersionText(v.id);
    if (v === live) liveText = text;
    db.transaction(() => {
      text.forEach((t, locale) => insertText.run(v.id, locale, t.keywords, t.description));
      markFetched.run(v.id);
    })();
  }
  const draftText = draft ? await fetchVersionText(draft.id) : undefined;

  // An app that was never released has no live listing, only the one being prepared.
  const liveRows = live ? mergeListing(liveInfo, liveText, live) : [];
  const draftRows = draft || draftInfo ? mergeListing(draftInfo ?? liveInfo, draftText ?? liveText, draft ?? live) : [];
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO aso_listings (apple_id, kind, locale, version, version_state, name, subtitle, keywords, promotional_text, description, whats_new, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  db.transaction(() => {
    recordListingChanges(appId, liveRows);
    db.prepare(`DELETE FROM aso_listings WHERE apple_id = ?`).run(appId);
    for (const [kind, rows] of [['live', liveRows], ['draft', draftRows]] as const) {
      for (const r of rows) {
        insert.run(appId, kind, r.locale, r.version, r.version_state, r.name, r.subtitle, r.keywords, r.promotional_text, r.description, r.whats_new, now);
      }
    }
  })();
}

/** Part of the Sales & analytics sync. */
export async function syncListings(state: JobState, appIds: string[]) {
  state.phase = 'Fetching App Store listings';
  state.total = appIds.length;
  state.done = 0;
  let synced = 0;
  for (const appId of appIds) {
    try {
      await syncListing(appId);
      synced++;
    } catch (err: any) {
      if (err instanceof AscError && err.isPermission) {
        state.errors.push('App Store listings (for ASO) need an API key with the App Manager, Developer or Marketing role, or Admin.');
        break;
      }
      state.errors.push(`Listing for app ${appId}: ${err.message}`);
    }
    state.done++;
  }
  return synced;
}

// ---------------------------------------------------------------------------
// Keyword ranks and popularity
// ---------------------------------------------------------------------------

export const MAX_KEYWORDS_PER_APP = 60;

export function normalizeKeyword(k: string): string {
  return k.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 100);
}

interface Popularity {
  popularity: number;
  prefix: string | null;
  position: number | null;
}

/**
 * 0-100 from App Store search suggestions. A keyword suggested after its first few letters is
 * searched a lot; one only suggested once fully typed, rarely; one never suggested, hardly ever.
 * Binary search over the prefix length: about five requests per keyword.
 */
async function estimatePopularity(keyword: string, country: string): Promise<Popularity | null> {
  if (!STOREFRONT_IDS[country]) return null;
  const letters = [...keyword];
  const position = new Map<number, number>();
  const at = async (n: number) => {
    if (!position.has(n)) {
      const hints = await searchHints(letters.slice(0, n).join(''), country);
      position.set(n, hints.findIndex((h) => normalizeKeyword(h) === keyword));
    }
    return position.get(n)!;
  };
  const full = letters.length;
  if ((await at(full)) < 0) return { popularity: 5, prefix: null, position: null };
  let lo = 1;
  let hi = full;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((await at(mid)) >= 0) hi = mid;
    else lo = mid + 1;
  }
  const pos = await at(lo);
  // Typing 1 letter of 10 → ~100; all 10 → ~10. Lower in the list costs a little.
  const share = 1 - (lo - 1) / Math.max(full, 6);
  const popularity = Math.round(Math.max(6, Math.min(100, 100 * share - 3 * pos)));
  return { popularity, prefix: letters.slice(0, lo).join(''), position: pos };
}

/**
 * Searches one keyword in one storefront (once a day) and records the rank of every app tracking
 * it there. Popularity is re-estimated weekly.
 */
export async function checkKeyword(country: string, keyword: string) {
  const db = getDb();
  const today = pacificToday();
  const trackers = db.prepare(`SELECT apple_id FROM aso_keywords WHERE country = ? AND keyword = ?`).all(country, keyword) as { apple_id: string }[];
  // Searched today already, and every app tracking it has its rank: nothing to do. (The stored
  // top 10 can't tell rank 57 from unranked, so an app that started tracking since searches again.)
  const ranked = (db.prepare(`SELECT COUNT(*) AS n FROM aso_ranks WHERE country = ? AND keyword = ? AND date = ?`).get(country, keyword, today) as { n: number }).n;
  const searched = db.prepare(`SELECT 1 FROM aso_searches WHERE country = ? AND keyword = ? AND date = ?`).get(country, keyword, today);
  if (searched && ranked >= trackers.length) return;

  const hits = await searchStore(keyword, country);
  const ranks = new Map(hits.map((h, i) => [h.id, i + 1]));

  const last = db
    .prepare(`SELECT popularity, hint_prefix, hint_position, date FROM aso_searches WHERE country = ? AND keyword = ? AND popularity IS NOT NULL ORDER BY date DESC LIMIT 1`)
    .get(country, keyword) as { popularity: number; hint_prefix: string | null; hint_position: number | null; date: string } | undefined;
  let pop: Popularity | null = last && last.date >= addDays(today, -7) ? { popularity: last.popularity, prefix: last.hint_prefix, position: last.hint_position } : null;
  if (!pop) pop = await estimatePopularity(keyword, country).catch(() => null);

  db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO aso_searches (country, keyword, date, total, top, popularity, hint_prefix, hint_position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(country, keyword, today, hits.length, JSON.stringify(hits.slice(0, 10)), pop?.popularity ?? null, pop?.prefix ?? null, pop?.position ?? null);
    const insert = db.prepare(`INSERT OR REPLACE INTO aso_ranks (apple_id, country, keyword, date, rank) VALUES (?, ?, ?, ?, ?)`);
    trackers.forEach((t) => insert.run(t.apple_id, country, keyword, today, ranks.get(t.apple_id) ?? null));
  })();
}

/** Part of the Ratings & Rankings sync: every tracked keyword, once a day. */
export async function syncKeywordRanks(state: JobState) {
  const pairs = getDb().prepare(`SELECT DISTINCT country, keyword FROM aso_keywords`).all() as { country: string; keyword: string }[];
  if (!pairs.length) return 0;
  state.phase = `Checking ${pairs.length} keyword rank${pairs.length === 1 ? '' : 's'}`;
  state.total = pairs.length;
  state.done = 0;
  let failures = 0;
  await mapLimit(pairs, 2, async (p) => {
    try {
      await checkKeyword(p.country, p.keyword);
    } catch {
      failures++;
    }
    state.done++;
  });
  if (failures) state.errors.push(`${failures} keyword searches failed (Apple throttling); they'll be retried next run.`);
  return pairs.length - failures;
}

export async function addKeywords(appId: string, country: string, keywords: string[]) {
  const db = getDb();
  const have = (db.prepare(`SELECT COUNT(*) AS n FROM aso_keywords WHERE apple_id = ?`).get(appId) as { n: number }).n;
  const fresh = [...new Set(keywords.map(normalizeKeyword).filter(Boolean))]
    .filter((k) => !db.prepare(`SELECT 1 FROM aso_keywords WHERE apple_id = ? AND country = ? AND keyword = ?`).get(appId, country, k))
    .slice(0, Math.max(0, MAX_KEYWORDS_PER_APP - have));
  const insert = db.prepare(`INSERT OR IGNORE INTO aso_keywords (apple_id, country, keyword) VALUES (?, ?, ?)`);
  db.transaction(() => fresh.forEach((k) => insert.run(appId, country, k)))();
  // Rank them now rather than tomorrow.
  const failed: string[] = [];
  await mapLimit(fresh, 2, (k) => checkKeyword(country, k).catch(() => void failed.push(k)));
  return { added: fresh.length, failed };
}

export function removeKeyword(appId: string, country: string, keyword: string) {
  const db = getDb();
  db.transaction(() => {
    db.prepare(`DELETE FROM aso_keywords WHERE apple_id = ? AND country = ? AND keyword = ?`).run(appId, country, keyword);
    db.prepare(`DELETE FROM aso_ranks WHERE apple_id = ? AND country = ? AND keyword = ?`).run(appId, country, keyword);
  })();
}

/** 0-100: how hard the top 10 results are to beat (their ratings, and whether the keyword is in their names). */
export function difficulty(keyword: string, top: SearchHit[]): number | null {
  const ten = top.slice(0, 10);
  if (!ten.length) return null;
  const counts = ten.map((h) => h.ratings).sort((a, b) => a - b);
  const median = counts[Math.floor(counts.length / 2)];
  const strength = Math.min(1, Math.log10(median + 1) / 5); // 100k ratings → 1
  const kw = words(keyword).filter((w) => !isGenericWord(w));
  const titled = kw.length ? ten.filter((h) => { const n = new Set(words(h.name)); return kw.every((w) => n.has(w)); }).length / ten.length : 0;
  return Math.round(100 * (0.65 * strength + 0.35 * titled));
}

// ---------------------------------------------------------------------------
// What the ASO page reads
// ---------------------------------------------------------------------------

// Locales App Store Connect offers that fit each storefront, best first. A storefront counts as
// localized when the listing has any locale in its language.
const STOREFRONT_LOCALES: Record<string, string[]> = {
  US: ['en-US'], GB: ['en-GB', 'en-US'], AU: ['en-AU', 'en-GB', 'en-US'], CA: ['en-CA', 'en-US', 'fr-CA'], NZ: ['en-AU', 'en-GB', 'en-US'],
  IE: ['en-GB', 'en-US'], IN: ['en-US', 'hi'], SG: ['en-US', 'zh-Hans'], PH: ['en-US'], ZA: ['en-GB', 'en-US'], MY: ['ms', 'en-US'],
  DE: ['de-DE'], AT: ['de-DE'], CH: ['de-DE', 'fr-FR', 'it'], FR: ['fr-FR', 'fr-CA'], BE: ['nl-NL', 'fr-FR'], LU: ['fr-FR', 'de-DE'],
  NL: ['nl-NL'], ES: ['es-ES', 'es-MX'], MX: ['es-MX', 'es-ES'], AR: ['es-MX', 'es-ES'], CO: ['es-MX', 'es-ES'], CL: ['es-MX', 'es-ES'],
  PE: ['es-MX', 'es-ES'], IT: ['it'], PT: ['pt-PT', 'pt-BR'], BR: ['pt-BR', 'pt-PT'], JP: ['ja'], KR: ['ko'], CN: ['zh-Hans'],
  TW: ['zh-Hant'], HK: ['zh-Hant', 'zh-Hans'], RU: ['ru'], UA: ['uk'], TR: ['tr'], PL: ['pl'], SE: ['sv'], NO: ['no'], DK: ['da'],
  FI: ['fi'], CZ: ['cs'], SK: ['sk'], HU: ['hu'], RO: ['ro'], GR: ['el'], HR: ['hr'], IL: ['he'], SA: ['ar-SA'], AE: ['ar-SA', 'en-US'],
  EG: ['ar-SA'], TH: ['th'], VN: ['vi'], ID: ['id'], PK: ['en-US', 'ur'],
};

const LOCALE_NAMES: Record<string, string> = {
  'en-US': 'English (U.S.)', 'en-GB': 'English (U.K.)', 'en-AU': 'English (Australia)', 'en-CA': 'English (Canada)', 'fr-FR': 'French',
  'fr-CA': 'French (Canada)', 'de-DE': 'German', 'es-ES': 'Spanish (Spain)', 'es-MX': 'Spanish (Mexico)', it: 'Italian', 'pt-BR': 'Portuguese (Brazil)',
  'pt-PT': 'Portuguese (Portugal)', ja: 'Japanese', ko: 'Korean', 'zh-Hans': 'Chinese (Simplified)', 'zh-Hant': 'Chinese (Traditional)',
  ru: 'Russian', uk: 'Ukrainian', tr: 'Turkish', pl: 'Polish', sv: 'Swedish', no: 'Norwegian', da: 'Danish', fi: 'Finnish', cs: 'Czech',
  sk: 'Slovak', hu: 'Hungarian', ro: 'Romanian', el: 'Greek', hr: 'Croatian', he: 'Hebrew', 'ar-SA': 'Arabic', th: 'Thai', vi: 'Vietnamese',
  id: 'Indonesian', ms: 'Malay', hi: 'Hindi', 'nl-NL': 'Dutch', ca: 'Catalan', ur: 'Urdu',
};

export function localeName(locale: string): string {
  return LOCALE_NAMES[locale] || locale;
}

const lang = (locale: string) => locale.split('-')[0];

/** The listing locale App Store search most likely uses in a storefront. */
export function localeForCountry(country: string, locales: string[], primary: string | null): string | null {
  const wanted = STOREFRONT_LOCALES[country] || [];
  for (const w of wanted) if (locales.includes(w)) return w;
  for (const w of wanted) {
    const same = locales.find((l) => lang(l) === lang(w));
    if (same) return same;
  }
  return primary && locales.includes(primary) ? primary : locales[0] ?? null;
}

export interface ListingLocale extends ListingRow {
  locale_name: string;
}

export interface KeywordRow {
  keyword: string;
  rank: number | null;
  /** Rank 7 and 30 days ago; undefined = not tracked back then. */
  rank7: number | null | undefined;
  rank30: number | null | undefined;
  best: number | null;
  history: { date: string; rank: number | null }[];
  checked: string | null;
  total: number;
  popularity: number | null;
  hintPrefix: string | null;
  hintPosition: number | null;
  difficulty: number | null;
  top: SearchHit[];
}

export interface FunnelCounts {
  impressions: number;
  page_views: number;
  gets: number;
}

export interface ImpactWindow extends FunnelCounts {
  days: number;
  search_impressions: number;
  search_page_views: number;
  search_gets: number;
  downloads: number;
}

export interface ChangeItem {
  locale: string;
  locale_name: string;
  field: 'keywords' | 'description' | 'name' | 'subtitle' | 'promotional_text' | 'locale';
  old: string | null;
  new: string | null;
}

export interface ChangeEvent {
  date: string;
  version: string | null;
  items: ChangeItem[];
  notes: { id: number; note: string }[];
  before: ImpactWindow | null;
  after: ImpactWindow | null;
  /** Keyword ranks (selected storefront) that got better / worse, before vs after. */
  ranks: { better: number; worse: number; compared: number } | null;
  overlaps: string[];
}

export interface AsoOverview {
  app: { apple_id: string; name: string; icon_url: string | null; primary_genre: string | null; primary_locale: string | null; store_url: string | null };
  country: string;
  countryLocale: string | null;
  listing: {
    live: ListingLocale[];
    draft: ListingLocale[];
    liveVersion: string | null;
    draftVersion: { version: string | null; state: string | null; editable: boolean } | null;
    updatedAt: string | null;
  };
  localeGaps: { country: string; country_name: string; locale: string; locale_name: string; impressions: number; reason: 'missing' | 'secondary' }[];
  keywords: KeywordRow[];
  keywordCountries: { country: string; count: number }[];
  ideas: { word: string; count: number; apps: string[] }[];
  funnel: {
    start: string | null;
    end: string | null;
    sources: (FunnelCounts & { source: string; previous: FunnelCounts | null })[];
    weekly: { week: string; search_impressions: number; search_page_views: number; search_gets: number; other_impressions: number; other_gets: number }[];
    territories: (FunnelCounts & { country: string; country_name: string; localized: boolean | null })[];
  };
  changes: ChangeEvent[];
  storefrontsWithSuggestions: string[];
}

const IMPACT_DAYS = 14;

/** Daily engagement + downloads for one app over [start, end], for before/after comparisons. */
function impactWindow(appId: string, start: string, end: string): ImpactWindow | null {
  if (end < start) return null;
  const db = getDb();
  const e = db
    .prepare(`
      SELECT COUNT(DISTINCT date) AS days,
        COALESCE(SUM(CASE WHEN lower(event) = 'impression' THEN counts END), 0) AS impressions,
        COALESCE(SUM(CASE WHEN lower(event) = 'page view' AND lower(page_type) = 'product page' THEN counts END), 0) AS page_views,
        COALESCE(SUM(CASE WHEN lower(event) = 'tap' AND lower(engagement_type) = 'get' THEN counts END), 0) AS gets,
        COALESCE(SUM(CASE WHEN lower(event) = 'impression' AND lower(source_type) = 'app store search' THEN counts END), 0) AS search_impressions,
        COALESCE(SUM(CASE WHEN lower(event) = 'page view' AND lower(page_type) = 'product page' AND lower(source_type) = 'app store search' THEN counts END), 0) AS search_page_views,
        COALESCE(SUM(CASE WHEN lower(event) = 'tap' AND lower(engagement_type) = 'get' AND lower(source_type) = 'app store search' THEN counts END), 0) AS search_gets
      FROM engagement WHERE apple_id = ? AND granularity = 'D' AND date BETWEEN ? AND ?`)
    .get(appId, start, end) as Omit<ImpactWindow, 'downloads'>;
  if (!e.days) return null;
  const d = db
    .prepare(`SELECT COALESCE(SUM(units), 0) AS n FROM sales WHERE apple_id = ? AND granularity = 'D' AND category = 'download' AND date BETWEEN ? AND ?`)
    .get(appId, start, end) as { n: number };
  return { ...e, downloads: d.n };
}

/** When each version reached the store: the first day it shows up in sales or store lookups. */
function releaseDates(appId: string): Map<string, string> {
  const db = getDb();
  const out = new Map<string, string>();
  const take = (rows: { v: string; d: string }[]) => rows.forEach((r) => r.v && (!out.has(r.v) || r.d < out.get(r.v)!) && out.set(r.v, r.d));
  take(db.prepare(`SELECT app_version AS v, MIN(date) AS d FROM sales WHERE apple_id = ? AND granularity = 'D' AND app_version <> '' GROUP BY app_version`).all(appId) as { v: string; d: string }[]);
  take(db.prepare(`SELECT version AS v, MIN(date) AS d FROM ratings WHERE apple_id = ? AND version IS NOT NULL GROUP BY version`).all(appId) as { v: string; d: string }[]);
  return out;
}

/** Keyword and description changes between consecutive released versions, dated by release. */
function versionChanges(appId: string): { date: string; version: string; items: ChangeItem[] }[] {
  const db = getDb();
  const released = releaseDates(appId);
  const versions = (db.prepare(`SELECT id, version, created_date FROM aso_versions WHERE apple_id = ? AND fetched = 1`).all(appId) as
    { id: string; version: string; created_date: string }[])
    .map((v) => ({ ...v, date: released.get(v.version) || v.created_date?.slice(0, 10) || '' }))
    .filter((v) => v.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const textOf = db.prepare(`SELECT locale, keywords, description FROM aso_version_locales WHERE version_id = ?`);
  const out: { date: string; version: string; items: ChangeItem[] }[] = [];
  let prev: Map<string, { keywords: string; description: string }> | null = null;
  for (const v of versions) {
    const cur = new Map((textOf.all(v.id) as { locale: string; keywords: string; description: string }[]).map((r) => [r.locale, r]));
    if (prev) {
      const items: ChangeItem[] = [];
      cur.forEach((t, locale) => {
        const p = prev!.get(locale);
        const base = { locale, locale_name: localeName(locale) };
        if (!p) {
          items.push({ ...base, field: 'locale', old: null, new: locale });
          return;
        }
        const norm = (k: string) => (k || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).join(',');
        if (norm(p.keywords) !== norm(t.keywords)) items.push({ ...base, field: 'keywords', old: p.keywords, new: t.keywords });
        const prose = (d: string) => (d || '').replace(/\s+/g, ' ').trim(); // line-break and spacing edits aren't rewrites
        if (prose(p.description) !== prose(t.description)) items.push({ ...base, field: 'description', old: p.description, new: t.description });
      });
      if (items.length) out.push({ date: v.date, version: v.version, items });
    }
    prev = cur;
  }
  return out;
}

function engagementEnd(appId: string): string | null {
  return (getDb().prepare(`SELECT MAX(date) AS d FROM engagement WHERE apple_id = ? AND granularity = 'D'`).get(appId) as { d: string | null }).d;
}

function changeEvents(appId: string, country: string): ChangeEvent[] {
  const db = getDb();
  const byDate = new Map<string, ChangeEvent>();
  const event = (date: string) => {
    if (!byDate.has(date)) byDate.set(date, { date, version: null, items: [], notes: [], before: null, after: null, ranks: null, overlaps: [] });
    return byDate.get(date)!;
  };
  for (const v of versionChanges(appId)) {
    const e = event(v.date);
    e.version = v.version;
    e.items.push(...v.items);
  }
  const listed = db.prepare(`SELECT date, locale, field, old_value, new_value FROM aso_changes WHERE apple_id = ? ORDER BY id`).all(appId) as
    { date: string; locale: string; field: ChangeItem['field']; old_value: string | null; new_value: string | null }[];
  for (const c of listed) {
    // A locale added with a new version is already in that version's changes.
    const e = event(c.date);
    if (c.field === 'locale' && e.items.some((i) => i.field === 'locale' && i.locale === c.locale)) continue;
    e.items.push({ locale: c.locale, locale_name: localeName(c.locale), field: c.field, old: c.old_value, new: c.new_value });
  }
  for (const n of db.prepare(`SELECT id, date, note FROM aso_notes WHERE apple_id = ?`).all(appId) as { id: number; date: string; note: string }[]) {
    event(n.date).notes.push({ id: n.id, note: n.note });
  }

  const end = engagementEnd(appId);
  const events = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
  const rankAvg = db.prepare(`
    SELECT keyword, AVG(COALESCE(rank, 201)) AS r FROM aso_ranks
    WHERE apple_id = ? AND country = ? AND date BETWEEN ? AND ? GROUP BY keyword`);
  for (const e of events) {
    e.before = impactWindow(appId, addDays(e.date, -IMPACT_DAYS), addDays(e.date, -1));
    if (end) e.after = impactWindow(appId, addDays(e.date, 1), [addDays(e.date, IMPACT_DAYS), end].sort()[0]);
    e.overlaps = events.filter((o) => o.date > e.date && o.date <= addDays(e.date, IMPACT_DAYS)).map((o) => o.date).sort();
    const before = new Map((rankAvg.all(appId, country, addDays(e.date, -IMPACT_DAYS), addDays(e.date, -1)) as { keyword: string; r: number }[]).map((r) => [r.keyword, r.r]));
    const after = rankAvg.all(appId, country, addDays(e.date, 1), addDays(e.date, IMPACT_DAYS)) as { keyword: string; r: number }[];
    const pairs = after.filter((a) => before.has(a.keyword));
    if (pairs.length) {
      e.ranks = {
        better: pairs.filter((a) => a.r < before.get(a.keyword)! - 0.5).length,
        worse: pairs.filter((a) => a.r > before.get(a.keyword)! + 0.5).length,
        compared: pairs.length,
      };
    }
  }
  return events;
}

const SOURCE_ORDER = ['App Store search', 'App Store browse', 'App referrer', 'Web referrer', 'Unavailable'];

function funnel(appId: string, days: number, localized: (country: string) => boolean | null): AsoOverview['funnel'] {
  const db = getDb();
  const end = engagementEnd(appId);
  if (!end) return { start: null, end: null, sources: [], weekly: [], territories: [] };
  const start = addDays(end, -(days - 1));
  const sums = `
    COALESCE(SUM(CASE WHEN lower(event) = 'impression' THEN counts END), 0) AS impressions,
    COALESCE(SUM(CASE WHEN lower(event) = 'page view' AND lower(page_type) = 'product page' THEN counts END), 0) AS page_views,
    COALESCE(SUM(CASE WHEN lower(event) = 'tap' AND lower(engagement_type) = 'get' THEN counts END), 0) AS gets`;
  const bySource = (s: string, e: string) =>
    new Map((db.prepare(`SELECT source_type AS source, ${sums} FROM engagement WHERE apple_id = ? AND granularity = 'D' AND date BETWEEN ? AND ? GROUP BY source_type`)
      .all(appId, s, e) as (FunnelCounts & { source: string })[]).map((r) => [r.source, r]));
  const cur = bySource(start, end);
  const prev = bySource(addDays(start, -days), addDays(start, -1));
  const sources = [...cur.values()]
    .filter((r) => r.impressions || r.page_views || r.gets)
    .map((r) => ({ ...r, previous: prev.get(r.source) ?? null }))
    .sort((a, b) => (SOURCE_ORDER.indexOf(a.source) + 1 || 99) - (SOURCE_ORDER.indexOf(b.source) + 1 || 99));

  // 26 weeks ending on the last reported day, so the newest week is a whole one.
  const weeksStart = addDays(end, -(26 * 7 - 1));
  const daily = db.prepare(`
    SELECT date,
      COALESCE(SUM(CASE WHEN lower(event) = 'impression' AND lower(source_type) = 'app store search' THEN counts END), 0) AS si,
      COALESCE(SUM(CASE WHEN lower(event) = 'page view' AND lower(page_type) = 'product page' AND lower(source_type) = 'app store search' THEN counts END), 0) AS sp,
      COALESCE(SUM(CASE WHEN lower(event) = 'tap' AND lower(engagement_type) = 'get' AND lower(source_type) = 'app store search' THEN counts END), 0) AS sg,
      COALESCE(SUM(CASE WHEN lower(event) = 'impression' AND lower(source_type) <> 'app store search' THEN counts END), 0) AS oi,
      COALESCE(SUM(CASE WHEN lower(event) = 'tap' AND lower(engagement_type) = 'get' AND lower(source_type) <> 'app store search' THEN counts END), 0) AS og
    FROM engagement WHERE apple_id = ? AND granularity = 'D' AND date BETWEEN ? AND ? GROUP BY date`)
    .all(appId, weeksStart, end) as { date: string; si: number; sp: number; sg: number; oi: number; og: number }[];
  const weekly: AsoOverview['funnel']['weekly'] = [];
  for (let w = 0; w < 26; w++) {
    const ws = addDays(weeksStart, w * 7);
    const we = addDays(ws, 6);
    const rows = daily.filter((d) => d.date >= ws && d.date <= we);
    const sum = (k: 'si' | 'sp' | 'sg' | 'oi' | 'og') => rows.reduce((n, r) => n + r[k], 0);
    weekly.push({ week: ws, search_impressions: sum('si'), search_page_views: sum('sp'), search_gets: sum('sg'), other_impressions: sum('oi'), other_gets: sum('og') });
  }
  while (weekly.length && !weekly[0].search_impressions && !weekly[0].other_impressions) weekly.shift();

  const territories = (db.prepare(`
      SELECT territory AS country, ${sums} FROM engagement
      WHERE apple_id = ? AND granularity = 'D' AND date BETWEEN ? AND ? AND lower(source_type) = 'app store search'
      GROUP BY territory ORDER BY impressions DESC LIMIT 25`)
    .all(appId, start, end) as (FunnelCounts & { country: string })[])
    .filter((t) => t.country && t.impressions)
    .map((t) => ({ ...t, country_name: territoryName(t.country), localized: localized(t.country) }));
  return { start, end, sources, weekly, territories };
}

/** Storefronts with search impressions but no listing in their language, biggest first. */
function localeGaps(appId: string, locales: string[]): AsoOverview['localeGaps'] {
  const end = engagementEnd(appId);
  if (!end || !locales.length) return [];
  const rows = getDb()
    .prepare(`
      SELECT territory AS country, SUM(counts) AS impressions FROM engagement
      WHERE apple_id = ? AND granularity = 'D' AND date BETWEEN ? AND ? AND lower(event) = 'impression' AND lower(source_type) = 'app store search'
      GROUP BY territory ORDER BY impressions DESC`)
    .all(appId, addDays(end, -89), end) as { country: string; impressions: number }[];
  const langs = new Set(locales.map(lang));
  const out: AsoOverview['localeGaps'] = [];
  for (const r of rows) {
    const wanted = STOREFRONT_LOCALES[r.country];
    if (!wanted || r.impressions < 50) continue;
    if (!wanted.some((w) => langs.has(lang(w)))) {
      out.push({ country: r.country, country_name: territoryName(r.country), locale: wanted[0], locale_name: localeName(wanted[0]), impressions: r.impressions, reason: 'missing' });
    }
    // The U.S. store also indexes the Spanish (Mexico) listing: another name, subtitle and keyword field for U.S. search.
    if (r.country === 'US' && !locales.includes('es-MX')) {
      out.push({ country: 'US', country_name: territoryName('US'), locale: 'es-MX', locale_name: localeName('es-MX'), impressions: r.impressions, reason: 'secondary' });
    }
  }
  return out.slice(0, 8);
}

function keywordRows(appId: string, country: string): KeywordRow[] {
  const db = getDb();
  const today = pacificToday();
  const tracked = db.prepare(`SELECT keyword FROM aso_keywords WHERE apple_id = ? AND country = ? ORDER BY added_at, keyword`).all(appId, country) as { keyword: string }[];
  const history = db.prepare(`SELECT date, rank FROM aso_ranks WHERE apple_id = ? AND country = ? AND keyword = ? AND date >= ? ORDER BY date`);
  const best = db.prepare(`SELECT MIN(rank) AS r FROM aso_ranks WHERE apple_id = ? AND country = ? AND keyword = ?`);
  const search = db.prepare(`SELECT date, total, top, popularity, hint_prefix, hint_position FROM aso_searches WHERE country = ? AND keyword = ? ORDER BY date DESC LIMIT 1`);
  return tracked.map(({ keyword }) => {
    const h = history.all(appId, country, keyword, addDays(today, -90)) as { date: string; rank: number | null }[];
    const at = (days: number) => {
      const target = addDays(today, -days);
      const row = [...h].reverse().find((r) => r.date <= target);
      return row ? row.rank : undefined;
    };
    const s = search.get(country, keyword) as { date: string; total: number; top: string; popularity: number | null; hint_prefix: string | null; hint_position: number | null } | undefined;
    const top: SearchHit[] = s?.top ? JSON.parse(s.top) : [];
    const last = h[h.length - 1];
    return {
      keyword,
      rank: last?.rank ?? null,
      rank7: at(7),
      rank30: at(30),
      best: (best.get(appId, country, keyword) as { r: number | null }).r,
      history: h,
      checked: last?.date ?? null,
      total: s?.total ?? 0,
      popularity: s?.popularity ?? null,
      hintPrefix: s?.hint_prefix ?? null,
      hintPosition: s?.hint_position ?? null,
      difficulty: difficulty(keyword, top),
      top,
    };
  });
}

/** Words that recur in the names of the apps ranking for your keywords, and aren't in your listing yet. */
function keywordIdeas(appId: string, rows: KeywordRow[], indexed: Set<string>): AsoOverview['ideas'] {
  const tracked = new Set(rows.flatMap((r) => words(r.keyword)));
  const counts = new Map<string, { count: number; apps: Set<string> }>();
  for (const r of rows) {
    for (const hit of r.top) {
      if (hit.id === appId) continue;
      // The part before ":" or "-" is usually the brand.
      const parts = hit.name.split(/\s[:\-–—|]\s|:\s/);
      const text = parts.length > 1 ? parts.slice(1).join(' ') : hit.name;
      for (const w of new Set(words(text))) {
        if (w.length < 3 || isGenericWord(w) || indexed.has(w) || tracked.has(w) || /^\d+$/.test(w)) continue;
        const c = counts.get(w) || { count: 0, apps: new Set<string>() };
        c.count++;
        c.apps.add(hit.name);
        counts.set(w, c);
      }
    }
  }
  // Two different apps at least: one app showing up for several keywords is just its brand.
  return [...counts.entries()]
    .filter(([, c]) => c.apps.size >= 2)
    .sort((a, b) => b[1].apps.size - a[1].apps.size || b[1].count - a[1].count)
    .slice(0, 24)
    .map(([word, c]) => ({ word, count: c.count, apps: [...c.apps].slice(0, 4) }));
}

export function asoOverview(appId: string, country: string, days: number): AsoOverview | null {
  const db = getDb();
  const app = db
    .prepare(`SELECT apple_id, name, icon_url, primary_genre, primary_locale, store_url FROM apps WHERE apple_id = ?`)
    .get(appId) as AsoOverview['app'] | undefined;
  if (!app) return null;

  const rows = db.prepare(`SELECT * FROM aso_listings WHERE apple_id = ? ORDER BY locale`).all(appId) as (ListingRow & { kind: string; updated_at: string })[];
  const withName = (r: ListingRow & { kind: string; updated_at: string }): ListingLocale => ({
    locale: r.locale, version: r.version, version_state: r.version_state, name: r.name || '', subtitle: r.subtitle || '', keywords: r.keywords || '',
    promotional_text: r.promotional_text || '', description: r.description || '', whats_new: r.whats_new || '', locale_name: localeName(r.locale),
  });
  const primary = app.primary_locale || 'en-US';
  const primaryFirst = (a: ListingLocale, b: ListingLocale) => (a.locale === primary ? -1 : b.locale === primary ? 1 : a.locale_name.localeCompare(b.locale_name));
  const live = rows.filter((r) => r.kind === 'live').map(withName).sort(primaryFirst);
  const draft = rows.filter((r) => r.kind === 'draft').map(withName).sort(primaryFirst);
  const draftRow = rows.find((r) => r.kind === 'draft');
  // Until the first release, the version being prepared is the only listing there is.
  const searched = live.length ? live : draft;
  const locales = searched.map((l) => l.locale);
  const countryLocale = localeForCountry(country, locales, app.primary_locale);
  const listingForCountry = searched.find((l) => l.locale === countryLocale);
  const indexed = new Set(listingForCountry ? [...words(listingForCountry.name), ...words(listingForCountry.subtitle), ...listingForCountry.keywords.split(',').flatMap(words)] : []);
  const langs = new Set(locales.map(lang));

  const keywords = keywordRows(appId, country);
  return {
    app,
    country,
    countryLocale,
    listing: {
      live,
      draft,
      liveVersion: live[0]?.version ?? null,
      draftVersion: draftRow && draftRow.version !== live[0]?.version
        ? { version: draftRow.version, state: draftRow.version_state, editable: EDITABLE.has(draftRow.version_state || '') }
        : null,
      updatedAt: rows[0]?.updated_at ?? null,
    },
    localeGaps: localeGaps(appId, locales),
    keywords,
    keywordCountries: db.prepare(`SELECT country, COUNT(*) AS count FROM aso_keywords WHERE apple_id = ? GROUP BY country ORDER BY count DESC`).all(appId) as { country: string; count: number }[],
    ideas: keywordIdeas(appId, keywords, indexed),
    funnel: funnel(appId, days, (cc) => {
      const wanted = STOREFRONT_LOCALES[cc];
      if (!langs.size || !wanted) return null; // listing not fetched yet, or a storefront we can't judge
      return wanted.some((w) => langs.has(lang(w)));
    }),
    changes: changeEvents(appId, country),
    storefrontsWithSuggestions: Object.keys(STOREFRONT_IDS),
  };
}

/** One keyword in one storefront, live: the top results and what search suggests around it. */
export async function keywordDetail(keyword: string, country: string) {
  const k = normalizeKeyword(keyword);
  const [hits, suggestions, more] = await Promise.all([
    searchStore(k, country),
    searchHints(k, country),
    searchHints(`${k} `, country),
  ]);
  const seen = new Set<string>([k]);
  const ideas = [...suggestions, ...more].map(normalizeKeyword).filter((s) => !seen.has(s) && seen.add(s));
  return { keyword: k, country, total: hits.length, top: hits.slice(0, 25), suggestions: ideas.slice(0, 16), difficulty: difficulty(k, hits) };
}

export function addNote(appId: string, date: string, note: string) {
  getDb().prepare(`INSERT INTO aso_notes (apple_id, date, note) VALUES (?, ?, ?)`).run(appId, date, note.trim().slice(0, 300));
}

export function removeNote(id: number) {
  getDb().prepare(`DELETE FROM aso_notes WHERE id = ?`).run(id);
}
