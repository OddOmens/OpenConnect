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
  proceeds: 'Proceeds',
} as const
export type HistorySeries = keyof typeof HISTORY_SERIES

export const RANGES = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '365d': 'Last 365 days',
  ytd: 'Year to date',
  all: 'All time',
} as const
export type RangeId = keyof typeof RANGES

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK', 'NZD', 'INR', 'BRL', 'MXN'] as const

export interface UiPrefs {
  sectionOrder: SectionId[]
  hiddenSections: SectionId[]
  hiddenKpis: KpiId[]
  hiddenTerritoryColumns: TerritoryColumn[]
  hiddenStoreColumns: StoreColumn[]
  hiddenHistorySeries: HistorySeries[]
  range: RangeId
  granularity: 'day' | 'week' | 'month'
  chartType: 'area' | 'bar' | 'line'
  currency: string
  mapMetric: 'downloads' | 'proceeds' | 'rating' | 'rank'
  compareToPrevious: boolean
}

export const DEFAULT_PREFS: UiPrefs = {
  sectionOrder: Object.keys(SECTIONS) as SectionId[],
  hiddenSections: [],
  hiddenKpis: ['updates'],
  hiddenTerritoryColumns: [],
  hiddenStoreColumns: ['toppaid'],
  hiddenHistorySeries: ['updates', 'proceeds'],
  range: '90d',
  granularity: 'day',
  chartType: 'area',
  currency: 'USD',
  mapMetric: 'downloads',
  compareToPrevious: true,
}

export function mergePrefs(saved: Partial<UiPrefs> | null | undefined): UiPrefs {
  const p = { ...DEFAULT_PREFS, ...(saved || {}) }
  // Keep order valid if sections were added or removed since the prefs were saved.
  const known = Object.keys(SECTIONS) as SectionId[]
  const order = p.sectionOrder.filter((s) => known.includes(s))
  for (const s of known) if (!order.includes(s)) order.push(s)
  p.sectionOrder = order
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
  backfillYears: number          // monthly reports before the 365-day daily window (0-5)
  rankCharts: ChartId[]
  rankOverall: boolean           // also check the all-categories charts
  storeCountries: 'all' | string[]
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  autoSyncHours: 6,
  storeSyncHours: 24,
  syncSubscriptions: true,
  syncReviews: true,
  backfillYears: 3,
  rankCharts: ['topfree', 'topgrossing'],
  rankOverall: true,
  storeCountries: 'all',
}
