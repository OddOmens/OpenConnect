// Client-safe types and defaults for dashboard customization and sync options.

export const SECTIONS = {
  kpis: 'Key Metrics',
  history: 'History',
  forecast: 'Projections',
  map: 'World Map',
  reach: 'Global Reach',
  breakdowns: 'Breakdowns',
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
  reach: 'Countries Reached',
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
  downloads: 'First-time downloads view',
  proceeds: 'Proceeds view',
  rating: 'Rating view',
  rank: 'Rank view',
  topList: 'Top storefronts list',
} as const
export type MapItem = keyof typeof MAP_ITEMS

export const REACH_ITEMS = {
  map: 'Map',
  apps: 'Per-app comparison',
  missing: 'Countries not reached yet',
} as const
export type ReachItem = keyof typeof REACH_ITEMS

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

// Share card designs.
export const SHARE_TEMPLATES = {
  overview: 'Overview',
  reach: 'Global Reach',
  map: 'World Map',
  rating: 'Rating',
  review: 'Review',
  milestone: 'Milestone',
} as const
export type ShareTemplateId = keyof typeof SHARE_TEMPLATES

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
  reach: 'Countries Reached',
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

// Marketing: promo cards for one app, built from its App Store listing.
export const PROMO_TEMPLATES = {
  launch: 'Launch',
  update: "What's New",
  screens: 'Screenshots',
  feature: 'Features',
  store: 'App Store Page',
  loved: 'Loved By',
  reviews: 'Reviews',
  rated: 'Top Rated',
  milestone: 'Milestone',
  download: 'Download',
} as const
export type PromoTemplateId = keyof typeof PROMO_TEMPLATES

export const PROMO_STYLES = {
  studio: 'Studio',
  light: 'Light',
  gradient: 'Gradient',
  bold: 'Bold',
  glow: 'Glow',
} as const
export type PromoStyleId = keyof typeof PROMO_STYLES

export const PROMO_FORMATS = {
  '1x1': '1:1 · 1080×1080',
  '4x5': '4:5 · 1080×1350',
  '9x16': '9:16 · 1080×1920',
  '16x9': '16:9 · 1920×1080',
} as const
export type PromoFormatId = keyof typeof PROMO_FORMATS

/** One promo card's own settings for one app; anything unset follows the toolbar (all cards). */
export interface PromoCardSettings {
  style?: PromoStyleId
  accent?: string
  format?: PromoFormatId
  frameColor?: string
  showBadge?: boolean
  showRating?: boolean
  headline?: string
  tagline?: string
  cta?: string
  notes?: string
  shots?: string[]             // this card's screenshots, in order
  quotes?: number[]            // Reviews: which reviews, the first in front
  reviewCount?: ReviewCount    // Reviews: one review, or three fanned out
}

export const REVIEW_COUNTS = { 1: '1 review', 3: '3 reviews' } as const
export type ReviewCount = 1 | 3

// iPhone frame colours for the promo cards.
export const PROMO_FRAMES = {
  '#2c2c30': 'Black',
  '#d4d4d8': 'Silver',
  '#b8ad9e': 'Natural',
  '#c9a77c': 'Desert',
  '#34405a': 'Blue',
} as const

// How big the Marketing page draws its cards (S fits more on screen, L shows more detail).
export const CARD_SIZES = { s: 'S', m: 'M', l: 'L' } as const
export type CardSizeId = keyof typeof CARD_SIZES

export const PROMO_ACCENTS = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4'] as const

// What an API token can open (Settings → Security → API tokens). Never the dashboard or settings.
export const TOKEN_SCOPES = {
  studio: { label: 'Screenshot studio', detail: 'Read and edit screenshot sets, preview and export' },
  marketing: { label: 'Marketing', detail: 'Render stats and promo cards, read the figures on them, the projections and ASO' },
  aso: { label: 'ASO changes', detail: 'Read ASO, track keywords and change App Store listings (keywords, subtitle, promotional text…) in App Store Connect' },
} as const
export type TokenScope = keyof typeof TOKEN_SCOPES

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
  hiddenReachItems: ReachItem[]
  hiddenSubscriptionItems: SubscriptionItem[]
  range: RangeId | MonthRangeId
  granularity: 'day' | 'week' | 'month' | 'year'
  chartType: 'area' | 'bar' | 'line'
  currency: string
  mapMetric: 'downloads' | 'proceeds' | 'rating' | 'rank'
  compareToPrevious: boolean
  forecast: {
    horizon: 30 | 90 | 365
    metric: 'first_time' | 'impressions' | 'page_views' | 'proceeds'
  }
  share: {
    format: '4x5' | '9x16'
    theme: 'dark' | 'light'
    range: '30d' | '90d' | '365d' | 'ytd' | 'all' | MonthRangeId
    template: ShareTemplateId    // which card design
    hero: ShareHeroId            // the big number and its chart (Overview)
    stats: ShareStatId[]         // tiles to show, in this order
    showList: boolean            // Top Markets (one app) / Top Apps (All Apps)
  }
  marketing: {
    mode: 'stats' | 'promo'
    app: string                  // apple_id of the app the promo cards are about ('' = the top app)
    style: PromoStyleId
    accent: string               // #rrggbb
    format: PromoFormatId
    showBadge: boolean           // "Download on the App Store" button
    showRating: boolean
    frameColor: string           // iPhone frame, #rrggbb
    shots: Record<string, string[]> // picked screenshots per app, in order ("s:<studio slide>", "a:<App Store n>")
    // Text for every card of an app; empty means each template's own wording.
    copy: Record<string, { headline?: string; tagline?: string; cta?: string; notes?: string }>
    // Each card's own settings, per app and template (edited in the card's popup).
    cards: Record<string, Partial<Record<PromoTemplateId, PromoCardSettings>>>
    optionsOpen: boolean         // the toolbar's option rows are shown (else folded away)
    cardSize: CardSizeId
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
  hiddenReachItems: [],
  hiddenSubscriptionItems: [],
  range: '90d',
  granularity: 'day',
  chartType: 'area',
  currency: 'USD',
  mapMetric: 'downloads',
  compareToPrevious: true,
  forecast: { horizon: 90, metric: 'first_time' },
  share: {
    format: '4x5',
    theme: 'dark',
    range: '30d',
    template: 'overview',
    hero: 'first_time',
    stats: Object.keys(SHARE_STATS) as ShareStatId[],
    showList: true,
  },
  marketing: {
    mode: 'stats',
    app: '',
    style: 'gradient',
    accent: PROMO_ACCENTS[0],
    format: '4x5',
    showBadge: true,
    showRating: true,
    frameColor: '#2c2c30',
    shots: {},
    copy: {},
    cards: {},
    optionsOpen: true,
    cardSize: 'm',
  },
}

export function mergePrefs(saved: Partial<UiPrefs> | null | undefined): UiPrefs {
  const p = { ...DEFAULT_PREFS, ...(saved || {}) }
  p.share = { ...DEFAULT_PREFS.share, ...(saved?.share || {}) }
  p.marketing = { ...DEFAULT_PREFS.marketing, ...(saved?.marketing || {}) }
  p.forecast = { ...DEFAULT_PREFS.forecast, ...(saved?.forecast || {}) }
  // Keep order valid if sections were added or removed since the prefs were saved.
  const known = Object.keys(SECTIONS) as SectionId[]
  const order = p.sectionOrder.filter((s) => known.includes(s))
  // Sections added since the prefs were saved go right after the one they follow by default.
  known.forEach((s, i) => {
    if (order.includes(s)) return
    const after = i > 0 ? order.indexOf(known[i - 1]) : -1
    order.splice(after + 1, 0, s)
  })
  p.sectionOrder = order
  const kpis = Object.keys(KPIS) as KpiId[]
  p.kpiOrder = [...p.kpiOrder.filter((k) => kpis.includes(k)), ...kpis.filter((k) => !p.kpiOrder.includes(k))]
  if (!SHARE_HEROES[p.share.hero]) p.share.hero = DEFAULT_PREFS.share.hero
  if (!SHARE_TEMPLATES[p.share.template]) p.share.template = DEFAULT_PREFS.share.template
  if (!PROMO_STYLES[p.marketing.style]) p.marketing.style = DEFAULT_PREFS.marketing.style
  if (!PROMO_FORMATS[p.marketing.format]) p.marketing.format = DEFAULT_PREFS.marketing.format
  if (!/^#[0-9a-f]{6}$/i.test(p.marketing.accent)) p.marketing.accent = DEFAULT_PREFS.marketing.accent
  if (!/^#[0-9a-f]{6}$/i.test(p.marketing.frameColor)) p.marketing.frameColor = DEFAULT_PREFS.marketing.frameColor
  if (!CARD_SIZES[p.marketing.cardSize]) p.marketing.cardSize = DEFAULT_PREFS.marketing.cardSize
  // Loved By used to quote reviews: its picks move to the Reviews card, and it's the map alone now.
  p.marketing.cards = Object.fromEntries(Object.entries(p.marketing.cards).map(([app, cards]) => {
    const old = cards.loved as (PromoCardSettings & { lovedShow?: string }) | undefined
    if (!old || !('quotes' in old || 'lovedShow' in old)) return [app, cards]
    const { quotes, lovedShow: _, ...loved } = old
    const reviews = quotes?.length && !cards.reviews?.quotes ? { ...cards.reviews, quotes } : cards.reviews
    return [app, { ...cards, loved, ...(reviews ? { reviews } : {}) }]
  }))
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
  syncListings: boolean          // App Store listings (name, subtitle, keywords) for ASO; keyword ranks run with Ratings & Rankings
  trackListingKeywords: boolean  // track every keyword-field term in its locale's storefront
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
  syncListings: true,
  trackListingKeywords: true,
  rankCharts: ['topfree', 'topgrossing'],
  rankOverall: true,
  storeCountries: 'all',
}

/** Messages sent through a signal-cli-rest-api server. */
export interface NotifyConfig {
  signalUrl: string              // the REST API, e.g. http://signal-api:8080
  signalNumber: string           // the Signal account it sends from
  signalTo: string               // a phone number, a group.… id, or a group's name
  chartEntries: boolean          // as soon as an app enters a top 100 chart
  recap: boolean                 // a daily recap of every app
  recapTime: string              // HH:MM, in `timezone`
  timezone: string               // IANA, e.g. America/Chicago
}

export const DEFAULT_NOTIFY_CONFIG: NotifyConfig = {
  signalUrl: '',
  signalNumber: '',
  signalTo: '',
  chartEntries: true,
  recap: true,
  recapTime: '08:00',
  timezone: 'UTC',
}
