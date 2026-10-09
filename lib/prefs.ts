// Client-safe types and defaults for dashboard customization and sync options.

export const SECTIONS = {
  kpis: 'Key Metrics',
  history: 'History Chart',
  map: 'World Map',
  breakdowns: 'Products, Devices & Versions',
  store: 'Ratings & Rankings',
  territories: 'Territories',
  subscriptions: 'Subscriptions',
  reviews: 'Customer Reviews',
} as const
export type SectionId = keyof typeof SECTIONS

export const KPIS = {
  downloads: 'First-Time Downloads',
  redownloads: 'Redownloads',
  updates: 'Updates',
  iap: 'In-App Purchases',
  proceeds: 'Proceeds',
  impressions: 'Impressions',
  pageViews: 'Product Page Views',
  activeSubs: 'Active Subscriptions',
  rating: 'Average Rating',
  ratingCount: 'Ratings',
  countries: 'Storefronts Available',
  bestRank: 'Best Chart Rank',
} as const
export type KpiId = keyof typeof KPIS

export const TERRITORY_COLUMNS = {
  first_time: 'First-Time',
  redownloads: 'Redownloads',
  updates: 'Updates',
  iap: 'IAP Units',
  proceeds: 'Proceeds',
  share: '% of Downloads',
} as const
export type TerritoryColumn = keyof typeof TERRITORY_COLUMNS

export const STORE_COLUMNS = {
  rating: 'Rating',
  rating_count: 'Ratings',
  current_rating: 'Current Version',
  topfree: 'Top Free',
  toppaid: 'Top Paid',
  topgrossing: 'Top Grossing',
} as const
export type StoreColumn = keyof typeof STORE_COLUMNS

export const HISTORY_SERIES = {
  first_time: 'First-Time',
  redownloads: 'Redownloads',
  updates: 'Updates',
  iap: 'IAP Units',
  impressions: 'Impressions',
  page_views: 'Page Views',
  proceeds: 'Proceeds',
} as const
export type HistorySeries = keyof typeof HISTORY_SERIES

// Parts of sections that can be switched off one by one (Settings → Customize → Inside each section).
export const BREAKDOWN_TABS = {
  products: 'Products',
  devices: 'Devices',
  versions: 'Versions',
  prices: 'Price points',
} as const
export type BreakdownTab = keyof typeof BREAKDOWN_TABS

export const MAP_ITEMS = {
  downloads: 'Downloads view',
  proceeds: 'Proceeds view',
  rating: 'Rating view',
  rank: 'Rank view',
  topList: 'Top storefronts list',
} as const
export type MapItem = keyof typeof MAP_ITEMS

export const SUBSCRIPTION_ITEMS = {
  active: 'Active',
  paying: 'Paying',
  trials: 'Free trials',
  intro: 'Intro / promo',
  billingRetry: 'Billing retry',
  proceeds: 'Est. period proceeds',
  trend: 'Trend chart',
  bySubscription: 'By subscription',
  events: 'Events',
} as const
export type SubscriptionItem = keyof typeof SUBSCRIPTION_ITEMS

export const RANGES = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '365d': 'Last 365 days',
  ytd: 'Year to date',
  all: 'All time',
} as const
export type RangeId = keyof typeof RANGES
/** A single calendar month, e.g. "m:2026-09". */
export type MonthRangeId = `m:${string}`

/** "m:2026-09" → "September 2026" */
export function monthRangeLabel(id: string, month: 'long' | 'short' = 'long') {
  const m = id.replace(/^m:/, '')
  return new Date(m + '-01T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month, year: 'numeric' })
}

// Share cards: the stat tiles you can pick, in the order they appear.
export const SHARE_STATS = {
  proceeds: 'Proceeds',
  rating: 'Average Rating',
  impressions: 'Impressions',
  pageViews: 'Product Page Views',
  redownloads: 'Redownloads',
  iap: 'In-App Purchases',
  bestRank: 'Best Chart Rank',
  storefronts: 'Storefronts',
  updates: 'Updates',
} as const
export type ShareStatId = keyof typeof SHARE_STATS

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK', 'NZD', 'INR', 'BRL', 'MXN'] as const

export type SectionWidth = 'full' | 'half'

/** The big number (and chart) on share cards. */
export const SHARE_HEROES = {
  first_time: 'First-Time Downloads',
  downloads: 'Total Downloads',
  proceeds: 'Proceeds',
  impressions: 'Impressions',
  page_views: 'Product Page Views',
} as const
export type ShareHeroId = keyof typeof SHARE_HEROES

export type ThemeId = 'system' | 'light' | 'dark'

export interface UiPrefs {
  theme: ThemeId                 // 'system' follows the device's light/dark setting
  sectionOrder: SectionId[]
  hiddenSections: SectionId[]
  sectionWidths: Partial<Record<SectionId, SectionWidth>>   // missing = full width; two halves side by side share a row
  kpiOrder: KpiId[]
  kpiColumns: 3 | 4 | 5 | 6
  sidebar: 'left' | 'right'
  hiddenKpis: KpiId[]
  hiddenTerritoryColumns: TerritoryColumn[]
  hiddenStoreColumns: StoreColumn[]
  hiddenHistorySeries: HistorySeries[]
  hiddenBreakdowns: BreakdownTab[]
  hiddenMapItems: MapItem[]
  hiddenSubscriptionItems: SubscriptionItem[]
  range: RangeId | MonthRangeId
  granularity: 'day' | 'week' | 'month' | 'year'
  chartType: 'area' | 'bar' | 'line'
  currency: string
  mapMetric: 'downloads' | 'proceeds' | 'rating' | 'rank'
  compareToPrevious: boolean
  share: {
    format: '4x5' | '9x16'
    theme: 'dark' | 'light'
    range: '30d' | '90d' | '365d' | 'ytd' | 'all' | MonthRangeId
    hero: ShareHeroId            // the big number and its chart
    stats: ShareStatId[]         // tiles to show, in this order
    showList: boolean            // Top Markets (one app) / Top Apps (All Apps)
  }
}

export const DEFAULT_PREFS: UiPrefs = {
  theme: 'dark',
  sectionOrder: Object.keys(SECTIONS) as SectionId[],
  hiddenSections: [],
  sectionWidths: {},
  kpiOrder: Object.keys(KPIS) as KpiId[],
  kpiColumns: 4,
  sidebar: 'left',
  hiddenKpis: ['updates'],
  hiddenTerritoryColumns: [],
  hiddenStoreColumns: ['toppaid'],
  hiddenHistorySeries: ['updates', 'proceeds'],
  hiddenBreakdowns: [],
  hiddenMapItems: [],
  hiddenSubscriptionItems: [],
  range: '90d',
  granularity: 'day',
  chartType: 'area',
  currency: 'USD',
  mapMetric: 'downloads',
  compareToPrevious: true,
  share: {
    format: '4x5',
    theme: 'dark',
    range: '30d',
    hero: 'first_time',
    stats: Object.keys(SHARE_STATS) as ShareStatId[],
    showList: true,
  },
}

export function mergePrefs(saved: Partial<UiPrefs> | null | undefined): UiPrefs {
  const p = { ...DEFAULT_PREFS, ...(saved || {}) }
  p.share = { ...DEFAULT_PREFS.share, ...(saved?.share || {}) }
  // Keep order valid if sections were added or removed since the prefs were saved.
  const known = Object.keys(SECTIONS) as SectionId[]
  const order = p.sectionOrder.filter((s) => known.includes(s))
  for (const s of known) if (!order.includes(s)) order.push(s)
  p.sectionOrder = order
  const kpis = Object.keys(KPIS) as KpiId[]
  p.kpiOrder = [...p.kpiOrder.filter((k) => kpis.includes(k)), ...kpis.filter((k) => !p.kpiOrder.includes(k))]
  if (!SHARE_HEROES[p.share.hero]) p.share.hero = DEFAULT_PREFS.share.hero
  return p
}

export const CHARTS = {
  topfree: 'Top Free',
  toppaid: 'Top Paid',
  topgrossing: 'Top Grossing',
} as const
export type ChartId = keyof typeof CHARTS

export interface SyncConfig {
  autoSyncHours: number          // 0 = off
  storeSyncHours: number         // ratings + rankings; 0 = off
  syncSubscriptions: boolean
  syncReviews: boolean
  syncAnalytics: boolean         // impressions & product page views (Analytics Reports API)
  rankCharts: ChartId[]
  rankOverall: boolean           // also check the all-categories charts
  storeCountries: 'all' | string[]
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  autoSyncHours: 6,
  storeSyncHours: 24,
  syncSubscriptions: true,
  syncReviews: true,
  syncAnalytics: true,
  rankCharts: ['topfree', 'topgrossing'],
  rankOverall: true,
  storeCountries: 'all',
}
