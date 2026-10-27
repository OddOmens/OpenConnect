'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AppNav } from '@/components/nav/app-nav'
import { ScreenThumb, type PromoScreens } from './screen-thumb'
import { PromoCardEditor } from './promo-card-editor'
import { hasOwnSettings, previewParam, promoUrl, resolvePromo, statsUrl, type ResolvedPromo } from '@/lib/promo-settings'
import {
  AlertTriangle, Award, ChevronDown, Download, Globe, Heart, Images, LayoutDashboard, ListChecks, Loader2, Map as MapIcon, Maximize2, MessageSquareQuote, PartyPopper,
  RefreshCw, Rocket, SlidersHorizontal, Smartphone, Sparkles, Star, Store, Trophy,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { EmptyState, Segmented, Toggle } from '@/components/dashboard/section'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CARD_SIZES, CardSizeId, PROMO_ACCENTS, PROMO_FORMATS, PROMO_FRAMES, PROMO_STYLES, PROMO_TEMPLATES, PromoFormatId, PromoStyleId, PromoTemplateId,
  SHARE_HEROES, SHARE_STATS, SHARE_TEMPLATES, ShareHeroId, ShareStatId, ShareTemplateId, UiPrefs, monthRangeLabel,
} from '@/lib/prefs'
import type { App } from '@/components/dashboard/app-selector'
import { cn } from '@/lib/utils'
import { inputCls, selectCls } from '@/components/ui/field'

const RANGES = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '365d': 'Last 12 months',
  ytd: 'Year to date',
  all: 'All time',
} as const
type Range = UiPrefs['share']['range']
type Theme = 'dark' | 'light'
type Format = '4x5' | '9x16'
type Marketing = UiPrefs['marketing']
type Copy = Marketing['copy'][string]

const TEMPLATE_ICONS: Record<ShareTemplateId, React.ElementType> = {
  overview: LayoutDashboard,
  reach: Globe,
  map: MapIcon,
  rating: Star,
  review: MessageSquareQuote,
  milestone: Trophy,
}

const TEMPLATE_NOTES: Record<ShareTemplateId, string> = {
  overview: '',
  reach: 'How many of the 175 App Store storefronts each app has been downloaded in, all time. The range decides what counts as newly reached.',
  map: 'Where first-time downloads came from in the chosen range, with the top markets.',
  rating: 'The App Store rating with its stars, the breakdown of written reviews and the storefronts with the most ratings.',
  review: 'One of the best recent 5★ written reviews as a quote. Use “Another review” on a card to pick a different one.',
  milestone: 'Lifetime first-time downloads rounded to a milestone, with countries reached and the rating.',
}

const PROMO_ICONS: Record<PromoTemplateId, React.ElementType> = {
  launch: Rocket,
  update: Sparkles,
  screens: Images,
  loved: Heart,
  reviews: MessageSquareQuote,
  download: Smartphone,
  feature: ListChecks,
  store: Store,
  rated: Award,
  milestone: PartyPopper,
}

// What each style looks like, for its picker button.
const STYLE_SWATCH: Record<PromoStyleId, (accent: string) => string> = {
  studio: () => '#09090b',
  light: (a) => `linear-gradient(180deg, #ffffff, ${a}22)`,
  gradient: (a) => `linear-gradient(155deg, #000000aa, ${a})`,
  bold: (a) => a,
  glow: (a) => `radial-gradient(circle at 50% 0%, ${a}, #050507 75%)`,
}

const ASPECT: Record<PromoFormatId, string> = {
  '1x1': 'aspect-square',
  '4x5': 'aspect-[4/5]',
  '9x16': 'aspect-[9/16]',
  '16x9': 'aspect-video',
}

// Grid columns for each card shape at each card size (S fits more on screen, L shows more detail).
type Shape = 'portrait' | 'tall' | 'wide'
const GRID: Record<Shape, Record<CardSizeId, string>> = {
  portrait: { s: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5', m: 'sm:grid-cols-2 xl:grid-cols-3', l: 'md:grid-cols-2' },
  tall: { s: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6', m: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4', l: 'sm:grid-cols-2 xl:grid-cols-3' },
  wide: { s: 'sm:grid-cols-2 xl:grid-cols-3', m: 'sm:grid-cols-2', l: 'grid-cols-1' },
}

const SIZE: Record<PromoFormatId, string> = {
  '1x1': '1080x1080',
  '4x5': '1080x1350',
  '9x16': '1080x1920',
  '16x9': '1920x1080',
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * One preview. Until its first image is in it shows a spinner; after that a change of settings
 * keeps the last image up (with a small spinner) until the new one has loaded, so nothing blanks
 * out while you tweak. Hovering it fetches the full-size card, so the popup opens sharp.
 */
function Preview({ src, full, alt, aspect, onOpen }: { src: string; full: string; alt: string; aspect: string; onOpen: () => void }) {
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => {
    if (!shown || shown === src) return
    const next = new Image()
    next.onload = next.onerror = () => setShown(src)
    next.src = src
    return () => {
      next.onload = next.onerror = null
    }
  }, [src, shown])
  const hover = useRef<ReturnType<typeof setTimeout>>(undefined)
  const prefetch = () => {
    hover.current = setTimeout(() => {
      new Image().src = full
    }, 250)
  }
  useEffect(() => () => clearTimeout(hover.current), [])
  return (
    <button
      onClick={onOpen}
      onPointerEnter={prefetch}
      onPointerLeave={() => clearTimeout(hover.current)}
      className={cn('group relative block w-full overflow-hidden rounded-lg border border-border bg-card', aspect)}
      aria-label={`Enlarge ${alt}`}
    >
      {!shown && (
        <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shown ?? src} alt={alt} loading="lazy" onLoad={() => !shown && setShown(src)} className={cn('h-full w-full object-cover transition-opacity', shown ? 'opacity-100' : 'opacity-0')} />
      {shown && shown !== src && (
        <span className="absolute left-2 top-2 rounded-md bg-background/80 p-1.5 text-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
      )}
      <span className="absolute right-2 top-2 rounded-md bg-background/80 p-1.5 text-foreground opacity-0 transition-opacity group-hover:opacity-100">
        <Maximize2 className="h-4 w-4" />
      </span>
    </button>
  )
}

/** The full-size card in the popup, over the grid's preview (already loaded) until it's in. */
function FullImage({ src, placeholder, alt, className }: { src: string; placeholder: string; alt: string; className: string }) {
  const [shown, setShown] = useState(placeholder)
  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shown} alt={alt} className={className} />
      {shown !== src && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="hidden" onLoad={() => setShown(src)} onError={() => setShown(src)} />
          <span className="absolute right-2 top-2 rounded-md bg-background/80 p-1.5">
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
        </>
      )}
    </div>
  )
}

/** Saves settings a moment after the last change, so they're kept between visits. */
function useSaved<T>(key: 'share' | 'marketing', initial: T) {
  const [value, setValue] = useState<T>(initial)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const update = (patch: Partial<T>) =>
    setValue((prev) => {
      const next = { ...prev, ...patch }
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefs: { [key]: next } }) }).catch(() => {})
      }, 400)
      return next
    })
  return [value, setValue, update] as const
}

/** `value`, but only once it has stopped changing for `ms` (so typing doesn't re-render cards per key). */
function useSettled<T>(value: T, ms: number) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

/** Which screenshots the promo cards show, picked from the studio's screens and the App Store's. */
function ScreenPicker({ screens, shown, picked, frame, onToggle, onReset, rowCls, labelCls }: {
  screens: PromoScreens | null
  shown: string[]
  picked: boolean
  frame: string
  onToggle: (id: string) => void
  onReset: () => void
  rowCls: string
  labelCls: string
}) {
  const group = (source: 'studio' | 'store') => screens?.screens.filter((x) => x.source === source) ?? []
  const studio = group('studio')
  const store = group('store')
  const thumbs = (list: PromoScreens['screens']) => (
    <div className="flex items-start gap-2.5 overflow-x-auto py-1.5 pr-2">
      {list.map((x) => <ScreenThumb key={x.id} shot={x} order={shown.indexOf(x.id) + 1} frame={frame} onClick={() => onToggle(x.id)} />)}
    </div>
  )
  return (
    <div className={cn(rowCls, 'items-start')}>
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1">
        <span className={labelCls}>Screenshots</span>
        <span className="text-[11px] text-muted-foreground">
          {!screens ? 'Loading…' : shown.length ? `The cards use ${shown.length}, in this order. Click to add or remove.` : 'Pick the screens the cards should show.'}
        </span>
        {picked && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onReset}>Reset</Button>}
      </div>
      {screens && (
        <div className="flex w-full min-w-0 flex-col gap-1 lg:flex-row lg:gap-6">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-muted-foreground">
              Studio{screens.studio ? ` · ${screens.studio.name}` : ''}
              {screens.studio && <Link href={`/studio?app=${screens.studio.id}`} className="ml-2 underline-offset-2 hover:underline">Edit in Studio</Link>}
            </div>
            {studio.length ? thumbs(studio) : (
              <p className="py-2 text-[11px] text-muted-foreground">
                {screens.studio ? 'This studio project has no iPhone screenshots yet.' : <>No studio project for this app. <Link href="/studio" className="underline-offset-2 hover:underline">Make one in Studio</Link> to use its screens.</>}
              </p>
            )}
          </div>
          {store.length > 0 && (
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-muted-foreground">
                App Store <span className="font-normal">· often already designed, so they can look framed twice</span>
              </div>
              {thumbs(store)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface Card {
  key: string
  name: string     // shown under the preview
  title: string    // dialog title / alt text
  url: string
  file: string
  aspect: string   // CSS aspect class
  template?: PromoTemplateId  // promo cards: opens the card's settings popup
  resolved?: ResolvedPromo
  edited?: boolean // has settings of its own
  extra?: React.ReactNode
}

/** What the server already knows when it sends the page (see app/(dashboard)/marketing/page.tsx). */
export interface MarketingInitial {
  share: UiPrefs['share']
  marketing: Marketing
  apps: App[]
  months: string[]
  screens: { app: string; data: PromoScreens } | null // the promo app's, when they were quick to get
  statsVersion: string // goes in the stats cards' URLs, so the browser can keep them
}

export function MarketingStudio({ initial }: { initial: MarketingInitial }) {
  const { apps, months } = initial
  const [share, , updateShare] = useSaved<UiPrefs['share']>('share', initial.share)
  const [mk, , updateMk] = useSaved<Marketing>('marketing', initial.marketing)
  const [busy, setBusy] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  // Browsers block file downloads on plain http:// pages (except localhost).
  const [secure, setSecure] = useState(true)
  useEffect(() => setSecure(window.isSecureContext), [])

  // --- Stats cards: every app (and All Apps) in the chosen design ---------------------
  const { format, range, theme, template } = share
  // Which review each card shows on the Review template ("Another review" steps through them).
  const [picks, setPicks] = useState<Record<string, number>>({})
  const usesRange = template === 'overview' || template === 'reach' || template === 'map'
  const statsCards: Card[] = [{ id: 'all', name: 'All Apps' }, ...apps.map((a) => ({ id: a.apple_id, name: a.name.split(':')[0] }))].map((c) => ({
    key: c.id,
    name: c.name,
    title: `${c.name} card`,
    url: statsUrl(c.id, share, picks[c.id] ?? 0, initial.statsVersion),
    file: `${slug(c.name)}-${template}${usesRange ? `-${range.replace('m:', '')}` : ''}-${format === '4x5' ? '1080x1350' : '1080x1920'}.png`,
    aspect: ASPECT[format],
    extra: template === 'review' && (
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setPicks((p) => ({ ...p, [c.id]: (p[c.id] ?? 0) + 1 }))}>
        <RefreshCw className="h-3.5 w-3.5" />
        Another review
      </Button>
    ),
  }))
  const toggleStat = (id: ShareStatId) =>
    updateShare({ stats: share.stats.includes(id) ? share.stats.filter((s) => s !== id) : [...share.stats, id] })

  // --- Promo cards: one app in every promo template -----------------------------------
  const promo = mk.mode === 'promo'
  const promoApp = apps.find((a) => a.apple_id === mk.app) ?? apps[0]
  const appName = promoApp?.name.split(':')[0] ?? ''
  const copy: Copy = (promoApp && mk.copy[promoApp.apple_id]) || {}
  const setCopy = (patch: Copy) => promoApp && updateMk({ copy: { ...mk.copy, [promoApp.apple_id]: { ...copy, ...patch } } })
  const settledCopy = useSettled(copy, 700)
  const settledAccent = useSettled(mk.accent, 300)

  // Screenshots the cards can show: the app's studio screens and its App Store ones. The picked
  // ones (in order) are kept per app; until some are picked the cards use the defaults.
  const [loadedScreens, setLoadedScreens] = useState<{ app: string; data: PromoScreens } | null>(initial.screens)
  const promoAppId = promoApp?.apple_id
  // Only the answer for the app on screen counts (switching apps shows "Loading…" until it's in).
  const screens = loadedScreens && loadedScreens.app === promoAppId ? loadedScreens.data : null
  const haveScreens = !!screens
  useEffect(() => {
    if (!promo || !promoAppId || haveScreens) return
    let live = true
    fetch(`/api/marketing/promo?app=${promoAppId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setLoadedScreens({ app: promoAppId, data: d }))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [promo, promoAppId, haveScreens])
  const pickedShots = (promoAppId && mk.shots[promoAppId]) || []
  const available = new Set(screens?.screens.map((x) => x.id) ?? [])
  const shownShots = (pickedShots.length ? pickedShots : screens?.defaults ?? []).filter((id) => !screens || available.has(id))
  const toggleShot = (id: string) => {
    if (!promoAppId) return
    const next = shownShots.includes(id) ? shownShots.filter((x) => x !== id) : [...shownShots, id]
    updateMk({ shots: { ...mk.shots, [promoAppId]: next } })
  }
  const resetShots = () => {
    if (!promoAppId) return
    const rest = { ...mk.shots }
    delete rest[promoAppId]
    updateMk({ shots: rest })
  }
  // The cards' URLs name only picked screenshots: left out, the server uses the defaults itself, so
  // a card's URL doesn't change (and load twice) when the screenshot list arrives.
  const settledShots = useSettled(pickedShots.length ? shownShots.join(',') : '', 400)
  // Toolbar text and colour settle before the cards re-render (no render per keystroke).
  const mkForCards = { ...mk, accent: settledAccent, copy: promoAppId ? { ...mk.copy, [promoAppId]: settledCopy } : mk.copy }
  const toolbarShots = settledShots ? settledShots.split(',') : []
  // Promo cards wait for the app's version (with its screenshots, usually sent with the page), so
  // each card is asked for once, by the URL the browser can keep.
  const promoCards: Card[] = promoApp && screens
    ? (Object.keys(PROMO_TEMPLATES) as PromoTemplateId[]).map((t) => {
        const r = resolvePromo(mkForCards, promoApp.apple_id, t, toolbarShots)
        return {
          key: t,
          name: PROMO_TEMPLATES[t],
          title: `${appName} · ${PROMO_TEMPLATES[t]}`,
          url: promoUrl(promoApp.apple_id, t, r, screens?.version),
          file: `${slug(appName)}-${t}-${r.style}-${SIZE[r.format]}.png`,
          aspect: ASPECT[r.format],
          template: t,
          resolved: r,
          edited: hasOwnSettings(mk, promoApp.apple_id, t),
        }
      })
    : []

  const cards = promo ? promoCards : statsCards
  // Looked up live, so an open card's preview follows its settings.
  const open = cards.find((c) => c.key === openKey) ?? null
  const shape: Shape = (promo ? mk.format : format) === '16x9' ? 'wide' : (promo ? mk.format : format) === '9x16' ? 'tall' : 'portrait'
  const grid = GRID[shape][mk.cardSize]
  const optionsOpen = mk.optionsOpen
  const preview = previewParam(mk.cardSize)
  const waiting = promo && !!promoApp && !screens

  // Full size: straight from the server's cache if the card was opened, else drawn now (the grid's
  // previews are smaller).
  const download = async (card: Card) => {
    if (!secure) {
      // No download possible here: open the full-size PNG so it can be saved from the tab.
      window.open(card.url, '_blank', 'noopener')
      return
    }
    const res = await fetch(card.url)
    if (!res.ok) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(await res.blob())
    a.download = card.file
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // Every card's PNG is fetched at once (the server draws a few at a time), then saved in order.
  const downloadAll = async (list: Card[]) => {
    const files = list.map((c) => fetch(c.url).then((r) => (r.ok ? r.blob() : null)).catch(() => null))
    for (let i = 0; i < list.length; i++) {
      const blob = await files[i]
      if (!blob) continue
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = list[i].file
      a.click()
      URL.revokeObjectURL(a.href)
    }
  }

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  const rowCls = 'mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-2.5 sm:px-6 lg:px-8'
  const labelCls = 'text-xs font-medium text-muted-foreground'

  return (
    <div className="min-h-screen bg-background">
      <AppNav
        active="marketing"
        actions={
          <Button size="sm" onClick={() => run('all-cards', () => downloadAll(cards))} disabled={!!busy || !secure || !cards.length} title={secure ? undefined : 'Needs https://'} className="gap-1.5">
            {busy === 'all-cards' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Download all</span>
          </Button>
        }
      >
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-2.5 sm:px-6 lg:px-8">
          <Segmented
            value={mk.mode}
            onChange={(mode) => updateMk({ mode })}
            options={[
              { value: 'stats', label: 'Stats cards' },
              { value: 'promo', label: 'App promos' },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            {promo ? (
              <>
                <select value={promoApp?.apple_id ?? ''} onChange={(e) => updateMk({ app: e.target.value })} className={selectCls} aria-label="App">
                  {apps.map((a) => <option key={a.apple_id} value={a.apple_id}>{a.name.split(':')[0]}</option>)}
                </select>
                <Segmented
                  value={mk.format}
                  onChange={(f) => updateMk({ format: f })}
                  options={(Object.keys(PROMO_FORMATS) as PromoFormatId[]).map((f) => ({ value: f, label: PROMO_FORMATS[f] }))}
                />
              </>
            ) : (
              <>
                <Segmented
                  value={format}
                  onChange={(f: Format) => updateShare({ format: f })}
                  options={[
                    { value: '4x5', label: '4:5 · 1080×1350' },
                    { value: '9x16', label: '9:16 · 1080×1920' },
                  ]}
                />
                <Segmented
                  value={theme}
                  onChange={(t: Theme) => updateShare({ theme: t })}
                  options={[
                    { value: 'dark', label: 'Dark' },
                    { value: 'light', label: 'Light' },
                  ]}
                />
                {usesRange && (
                  <select value={range} onChange={(e) => updateShare({ range: e.target.value as Range })} className={selectCls} aria-label="Date range">
                    {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((r) => <option key={r} value={r}>{RANGES[r]}</option>)}
                    {months.length > 0 && (
                      <optgroup label="Month">
                        {months.map((m) => <option key={m} value={`m:${m}`}>{monthRangeLabel(m)}</option>)}
                      </optgroup>
                    )}
                  </select>
                )}
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Segmented
              value={mk.cardSize}
              onChange={(cardSize: CardSizeId) => updateMk({ cardSize })}
              options={(Object.keys(CARD_SIZES) as CardSizeId[]).map((sz) => ({ value: sz, label: CARD_SIZES[sz] }))}
            />
            <Button
              variant={optionsOpen ? 'secondary' : 'outline'}
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              aria-expanded={optionsOpen}
              onClick={() => updateMk({ optionsOpen: !optionsOpen })}
              title={optionsOpen ? 'Fold the options away to see more of the cards' : 'Show the options'}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Customize
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', optionsOpen && 'rotate-180')} />
            </Button>
          </div>
        </div>

        {!optionsOpen ? null : promo ? (
          <>
            <div className={rowCls}>
              <span className={labelCls}>Style</span>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(PROMO_STYLES) as PromoStyleId[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateMk({ style: s })}
                    aria-pressed={mk.style === s}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                      mk.style === s ? 'border-foreground/40 bg-accent text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <span className="h-4 w-4 rounded border border-border" style={{ background: STYLE_SWATCH[s](mk.accent) }} />
                    {PROMO_STYLES[s]}
                  </button>
                ))}
              </div>
              <span className={labelCls}>Accent</span>
              <div className="flex items-center gap-1.5">
                {PROMO_ACCENTS.map((c) => (
                  <button
                    key={c}
                    onClick={() => updateMk({ accent: c })}
                    aria-label={`Accent ${c}`}
                    className={cn('h-6 w-6 rounded-full border-2 transition-transform', mk.accent === c ? 'scale-110 border-foreground' : 'border-transparent hover:scale-110')}
                    style={{ background: c }}
                  />
                ))}
                <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-border" title="Custom color" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
                  <input type="color" value={mk.accent} onChange={(e) => updateMk({ accent: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom accent color" />
                </label>
              </div>
              <span className={labelCls}>iPhone</span>
              <div className="flex items-center gap-1.5">
                {(Object.keys(PROMO_FRAMES) as (keyof typeof PROMO_FRAMES)[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => updateMk({ frameColor: c })}
                    title={PROMO_FRAMES[c]}
                    aria-label={`${PROMO_FRAMES[c]} iPhone`}
                    className={cn('h-6 w-6 rounded-full border-2 transition-transform', mk.frameColor === c ? 'scale-110 border-foreground' : 'border-transparent hover:scale-110')}
                    style={{ background: `linear-gradient(135deg, ${c}, ${c}cc)` }}
                  />
                ))}
              </div>
              <span className={labelCls}>Show</span>
              <Toggle active={mk.showBadge} onClick={() => updateMk({ showBadge: !mk.showBadge })}>App Store button</Toggle>
              <Toggle active={mk.showRating} onClick={() => updateMk({ showRating: !mk.showRating })}>Rating</Toggle>
            </div>
            {promoApp && (
              <ScreenPicker
                screens={screens}
                shown={shownShots}
                picked={pickedShots.length > 0}
                frame={mk.frameColor}
                onToggle={toggleShot}
                onReset={resetShots}
                rowCls={rowCls}
                labelCls={labelCls}
              />
            )}
            {promoApp && (
              <div className="mx-auto grid max-w-screen-2xl gap-x-4 gap-y-2 border-t border-border px-4 py-2.5 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1fr_1.4fr_0.7fr_auto] lg:px-8">
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Headline</span>
                  <input value={copy.headline ?? ''} onChange={(e) => setCopy({ headline: e.target.value })} placeholder="Each template's own" maxLength={120} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Tagline</span>
                  <input value={copy.tagline ?? ''} onChange={(e) => setCopy({ tagline: e.target.value })} placeholder="First sentence of the App Store description" maxLength={240} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Button text</span>
                  <input value={copy.cta ?? ''} onChange={(e) => setCopy({ cta: e.target.value })} placeholder="Download on the App Store" maxLength={40} className={inputCls} />
                </label>
                <div className="flex items-end">
                  <Button variant="ghost" size="sm" disabled={!Object.values(copy).some(Boolean)} onClick={() => setCopy({ headline: '', tagline: '', cta: '', notes: '' })}>
                    Reset text
                  </Button>
                </div>
                <details className="sm:col-span-2 lg:col-span-4">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">What&apos;s New: release notes{copy.notes ? ' (edited)' : ''}</summary>
                  <textarea
                    value={copy.notes ?? ''}
                    onChange={(e) => setCopy({ notes: e.target.value })}
                    placeholder="Empty uses the release notes of the current App Store version. One point per line."
                    maxLength={1200}
                    rows={4}
                    className={cn(inputCls, 'mt-2 h-auto py-2')}
                  />
                </details>
              </div>
            )}
          </>
        ) : (
          <>
            <nav aria-label="Card design" className="mx-auto flex max-w-screen-2xl gap-1 overflow-x-auto border-t border-border px-4 py-2 sm:px-6 lg:px-8">
              {(Object.keys(SHARE_TEMPLATES) as ShareTemplateId[]).map((t) => {
                const Icon = TEMPLATE_ICONS[t]
                return (
                  <button
                    key={t}
                    onClick={() => updateShare({ template: t })}
                    aria-current={template === t ? 'page' : undefined}
                    className={cn(
                      'flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                      template === t ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {SHARE_TEMPLATES[t]}
                  </button>
                )
              })}
            </nav>
            {template !== 'overview' && (
              <p className="mx-auto max-w-screen-2xl border-t border-border px-4 py-2.5 text-xs text-muted-foreground sm:px-6 lg:px-8">{TEMPLATE_NOTES[template]}</p>
            )}
            {template === 'overview' && (
              <div className={rowCls}>
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  Big number
                  <select value={share.hero} onChange={(e) => updateShare({ hero: e.target.value as ShareHeroId })} className={selectCls} aria-label="Big number">
                    {(Object.keys(SHARE_HEROES) as ShareHeroId[]).map((h) => <option key={h} value={h}>{SHARE_HEROES[h]}</option>)}
                  </select>
                </label>
                <span className={labelCls}>Tiles</span>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(SHARE_STATS) as ShareStatId[]).map((id) => {
                    const position = share.stats.indexOf(id)
                    return (
                      <Toggle key={id} active={position >= 0} onClick={() => toggleStat(id)}>
                        {position >= 0 && <span className="tabular-nums text-muted-foreground">{position + 1}</span>}
                        {SHARE_STATS[id]}
                      </Toggle>
                    )
                  })}
                </div>
                <span className={labelCls}>Sections</span>
                <Toggle active={share.showList} onClick={() => updateShare({ showList: !share.showList })}>
                  Top Markets / Top Apps
                </Toggle>
                <span className="text-[11px] text-muted-foreground">Tiles appear in the order you turn them on. 4:5 shows up to 4, 9:16 up to 6.</span>
              </div>
            )}
          </>
        )}
      </AppNav>

      <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
        {!secure && (
          <div className="mb-6 flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>
              <div className="font-medium">Downloads need https://</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Your browser blocks downloads on http:// pages. Open OpenConnect at its Tailscale address
                (https://openconnect.&lt;your-tailnet&gt;.ts.net) to download. Until then, PNG opens the full-size card
                in a new tab: right-click it and choose Save image as.
              </div>
            </div>
          </div>
        )}
        {promo && apps.length === 0 && (
          <div className="rounded-lg border border-border">
            <EmptyState>Sync your apps first: promo cards are made from an app&apos;s App Store listing.</EmptyState>
          </div>
        )}
        {promo && promoApp && (
          <p className="mb-4 text-xs text-muted-foreground">
            Every promo for {appName}, from its live App Store listing: screenshots, version, release notes and price. Text you type here is kept per app.
          </p>
        )}
        <div className={cn('grid gap-6', grid)}>
          {waiting && [0, 1, 2].map((i) => <Skeleton key={i} className={cn('w-full rounded-lg', ASPECT[mk.format])} />)}
          {cards.map((c) => {
            const Icon = promo ? PROMO_ICONS[c.key as PromoTemplateId] : null
            return (
              <figure key={c.key} className="space-y-2">
                <Preview src={`${c.url}&preview=${preview}`} full={c.url} alt={c.title} aspect={c.aspect} onOpen={() => setOpenKey(c.key)} />
                <figcaption className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
                    {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    {c.name}
                    {c.edited && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">Own settings</Badge>}
                  </span>
                  <span className="flex shrink-0 gap-1.5">
                    {c.extra}
                    <Button variant="outline" size="sm" className="gap-1.5" disabled={!!busy} onClick={() => run(c.key, () => download(c))}>
                      {busy === c.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      PNG
                    </Button>
                  </span>
                </figcaption>
              </figure>
            )
          })}
        </div>
      </main>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenKey(null)}>
        {open?.template && open.resolved && promoApp ? (
          <DialogContent className="w-auto max-w-[95vw] gap-0 overflow-hidden p-0 sm:max-w-[95vw]">
            <DialogTitle className="sr-only">{open.title}</DialogTitle>
            <PromoCardEditor
              key={`${promoApp.apple_id}-${open.template}`}
              template={open.template}
              appId={promoApp.apple_id}
              mk={mk}
              updateMk={updateMk}
              info={screens}
              toolbarShots={shownShots}
              resolved={open.resolved}
              url={open.url}
              placeholder={`${open.url}&preview=${preview}`}
              aspect={open.aspect}
              busy={busy === open.key}
              onDownload={() => run(open.key, () => download(open))}
            />
          </DialogContent>
        ) : (
          <DialogContent className="w-auto max-w-[95vw] gap-3 p-3 sm:max-w-[95vw]">
            <DialogTitle className="sr-only">{open?.title}</DialogTitle>
            {open && (
              <>
                <FullImage key={open.url} src={open.url} placeholder={`${open.url}&preview=${preview}`} alt={open.title} className={cn('max-h-[82vh] w-auto max-w-[92vw] rounded-md', open.aspect)} />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{open.title}</span>
                  <Button size="sm" className="gap-1.5" disabled={!!busy} onClick={() => run(open.key, () => download(open))}>
                    {busy === open.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Download PNG
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
