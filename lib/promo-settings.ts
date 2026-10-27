// A promo card's settings: its own (from its popup) over the toolbar's, which apply to every card.
// Shared by the Marketing page; the render route reads the same names from the card's URL.

import type { CardSizeId, PromoCardSettings, ReviewCount, PromoTemplateId, UiPrefs } from './prefs'

type Marketing = UiPrefs['marketing']

/** What each template actually uses, so its popup only offers those. */
export const PROMO_USES: Record<PromoTemplateId, { text: ('headline' | 'tagline' | 'cta' | 'notes')[]; shots: number; quotes: boolean; rating: boolean }> = {
  launch: { text: ['headline', 'tagline', 'cta'], shots: 3, quotes: false, rating: true },
  update: { text: ['headline', 'notes', 'cta'], shots: 1, quotes: false, rating: false },
  screens: { text: ['headline', 'tagline', 'cta'], shots: 4, quotes: false, rating: false },
  loved: { text: ['headline', 'cta'], shots: 0, quotes: false, rating: false },
  reviews: { text: ['headline', 'cta'], shots: 0, quotes: true, rating: true },
  download: { text: ['headline', 'tagline', 'cta'], shots: 0, quotes: false, rating: true },
  feature: { text: ['headline', 'tagline', 'notes', 'cta'], shots: 1, quotes: false, rating: false },
  store: { text: ['headline', 'tagline', 'cta'], shots: 3, quotes: false, rating: true },
  rated: { text: ['headline', 'tagline', 'cta'], shots: 0, quotes: false, rating: false },
  milestone: { text: ['headline', 'tagline', 'cta'], shots: 0, quotes: false, rating: false },
}

export interface ResolvedPromo {
  style: NonNullable<PromoCardSettings['style']>
  accent: string
  format: NonNullable<PromoCardSettings['format']>
  frameColor: string
  showBadge: boolean
  showRating: boolean
  headline?: string
  tagline?: string
  cta?: string
  notes?: string
  shots: string[]
  quotes?: number[]
  reviewCount: ReviewCount
}

const set = <T,>(v: T | undefined | null) => (v === undefined || v === null || (v as unknown) === '' ? undefined : v)

/**
 * The settings a card renders with: its own, else the toolbar's. `toolbarShots` are the screenshots
 * picked for all cards (or the app's defaults).
 */
export function resolvePromo(mk: Marketing, appId: string, t: PromoTemplateId, toolbarShots: string[]): ResolvedPromo {
  const own = mk.cards[appId]?.[t] ?? {}
  const all = mk.copy[appId] ?? {}
  return {
    style: set(own.style) ?? mk.style,
    accent: set(own.accent) ?? mk.accent,
    format: set(own.format) ?? mk.format,
    frameColor: set(own.frameColor) ?? mk.frameColor,
    showBadge: own.showBadge ?? mk.showBadge,
    showRating: own.showRating ?? mk.showRating,
    headline: set(own.headline) ?? set(all.headline),
    tagline: set(own.tagline) ?? set(all.tagline),
    cta: set(own.cta) ?? set(all.cta),
    // The toolbar's notes are release notes (What's New); Features' list is its own.
    notes: t === 'update' ? set(own.notes) ?? set(all.notes) : t === 'feature' ? set(own.notes) : undefined,
    shots: own.shots?.length ? own.shots : toolbarShots,
    quotes: t === 'reviews' && own.quotes?.length ? own.quotes : undefined,
    reviewCount: own.reviewCount ?? 3,
  }
}

/** True when the card has any setting of its own. */
export function hasOwnSettings(mk: Marketing, appId: string, t: PromoTemplateId) {
  return Object.values(mk.cards[appId]?.[t] ?? {}).some((v) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))
}

/** The `preview` parameter for the grid's images at a card size (S draws them smaller still). */
export const previewParam = (size: CardSizeId) => (size === 's' ? 's' : '1')

/** A stats card's image URL. `v` (the data's version) lets the browser keep it. */
export function statsUrl(appId: string, share: UiPrefs['share'], pick: number, v?: string) {
  const q = new URLSearchParams({
    app: appId,
    t: share.template,
    range: share.range,
    format: share.format,
    theme: share.theme,
    hero: share.hero,
    stats: share.stats.join(','),
    list: share.showList ? '1' : '0',
    pick: String(pick),
  })
  if (v) q.set('v', v)
  return `/api/marketing?${q}`
}

/** The card's image URL. `v` (the app's promo version) lets the browser keep it. */
export function promoUrl(appId: string, t: PromoTemplateId, r: ResolvedPromo, v?: string) {
  const q = new URLSearchParams({
    app: appId,
    t,
    format: r.format,
    style: r.style,
    accent: r.accent.replace('#', ''),
    badge: r.showBadge ? '1' : '0',
    rating: r.showRating ? '1' : '0',
    frame: r.frameColor.replace('#', ''),
  })
  if (r.shots.length) q.set('shots', r.shots.join(','))
  if (r.headline) q.set('h', r.headline)
  if (r.tagline) q.set('sub', r.tagline)
  if (r.cta) q.set('cta', r.cta)
  if (r.notes) q.set('notes', r.notes)
  if (r.quotes?.length) q.set('quotes', r.quotes.join(','))
  if (t === 'reviews' && r.reviewCount === 1) q.set('n', '1')
  if (v) q.set('v', v)
  return `/api/marketing?${q}`
}
