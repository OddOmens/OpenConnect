'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Lightbulb, Loader2, RefreshCw } from 'lucide-react'
import { AppNav } from '@/components/nav/app-nav'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Section } from '@/components/dashboard/section'
import { selectCls } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { fmtCompact, fmtDate } from '@/lib/format'
import { TERRITORIES, countryToFlag, territoryName } from '@/lib/territories'
import { auditListing, keywordCoverage } from '@/lib/aso-audit'
import type { AsoOverview } from '@/lib/aso'
import type { App } from '@/components/dashboard/app-selector'
import { KeywordsPanel } from './keywords-panel'
import { ListingPanel } from './listing-panel'
import { FunnelPanel } from './funnel-panel'
import { ChangesPanel } from './changes-panel'

export type Days = 7 | 30 | 90

const STORAGE_KEY = 'openconnect.aso'

function saved(): { app?: string; country?: string } {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

export const pct = (n: number, d: number, digits = 1) => (d ? `${((n / d) * 100).toFixed(digits)}%` : '—')

/** POST /api/aso; resolves to the response body, or throws with Apple's (or our) message. */
export async function asoAction(body: Record<string, unknown>) {
  const res = await fetch('/api/aso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export function AsoView({ apps }: { apps: App[] }) {
  const visible = useMemo(() => apps.filter((a) => !a.hidden).sort((a, b) => b.first_time_downloads - a.first_time_downloads), [apps])
  const [appId, setAppId] = useState<string | null>(visible[0]?.apple_id ?? null)
  const [country, setCountry] = useState('US')
  const [days, setDays] = useState<Days>(30)
  const [data, setData] = useState<{ query: string; overview: AsoOverview | null; error?: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // ?app=<id> (links from elsewhere), else the last app and storefront in this browser.
  useEffect(() => {
    const s = saved()
    const linked = new URLSearchParams(window.location.search).get('app')
    const app = [linked, s.app].find((id) => id && visible.some((a) => a.apple_id === id))
    if (app) setAppId(app)
    if (s.country && TERRITORIES.some((t) => t.code === s.country)) setCountry(s.country)
  }, [visible])
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ app: appId, country }))
    } catch {
      // private window
    }
  }, [appId, country])

  const query = appId ? `app=${appId}&country=${country}&days=${days}` : ''
  // Bumped to load the same query again after a change; resolves `load()`'s promise once it's in.
  const [version, setVersion] = useState(0)
  const pending = useRef<(() => void)[]>([])
  useEffect(() => {
    if (!query) return
    let live = true
    fetch(`/api/aso?${query}`)
      .then(async (res) => ({ res, body: await res.json().catch(() => null) }))
      .catch(() => ({ res: null, body: null }))
      .then(({ res, body }) => {
        if (!live) return
        setData({ query, overview: res?.ok ? body : null, error: res?.ok ? undefined : body?.error || 'Couldn’t load ASO data.' })
        pending.current.splice(0).forEach((resolve) => resolve())
      })
    return () => {
      live = false
    }
  }, [query, version])
  const load = useCallback(
    () =>
      new Promise<void>((resolve) => {
        pending.current.push(resolve)
        setVersion((v) => v + 1)
      }),
    []
  )

  const overview = data?.overview ?? null
  const stale = data?.query !== query

  const refresh = async () => {
    if (!appId) return
    setRefreshing(true)
    setNotice(null)
    try {
      const r = await asoAction({ action: 'refresh', app: appId })
      if (r.error) setNotice(r.error)
      await load()
    } catch (err: any) {
      setNotice(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  const countries = useMemo(() => {
    const tracked = new Map((overview?.keywordCountries || []).map((c) => [c.country, c.count]))
    const sorted = [...TERRITORIES].sort((a, b) => a.name.localeCompare(b.name))
    return { tracked: sorted.filter((t) => tracked.has(t.code)).map((t) => ({ ...t, count: tracked.get(t.code)! })), rest: sorted.filter((t) => !tracked.has(t.code)) }
  }, [overview?.keywordCountries])

  if (!visible.length) {
    return (
      <div className="min-h-screen bg-background">
        <AppNav active="aso" />
        <main className="mx-auto max-w-screen-2xl px-4 py-16 text-center text-sm text-muted-foreground">No apps yet. Run a sync from the dashboard first.</main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav
        active="aso"
        actions={
          <>
            <select value={appId ?? ''} onChange={(e) => setAppId(e.target.value)} className={cn(selectCls, 'min-w-0 max-w-[14rem]')} aria-label="App">
              {visible.map((a) => <option key={a.apple_id} value={a.apple_id}>{a.name.split(':')[0]}</option>)}
            </select>
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={cn(selectCls, 'max-w-[11rem]')} aria-label="Storefront for keyword ranks">
              {countries.tracked.length > 0 && (
                <optgroup label="Tracking keywords">
                  {countries.tracked.map((t) => <option key={t.code} value={t.code}>{countryToFlag(t.code)} {t.name} ({t.count})</option>)}
                </optgroup>
              )}
              <optgroup label={countries.tracked.length ? 'Other storefronts' : 'Storefront'}>
                {countries.rest.map((t) => <option key={t.code} value={t.code}>{countryToFlag(t.code)} {t.name}</option>)}
              </optgroup>
            </select>
            <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} title="Fetch the listing from App Store Connect and check this app’s keyword ranks now">
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2 hidden md:inline">Refresh</span>
            </Button>
          </>
        }
      />

      <main className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {notice && (
          <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>{notice}</div>
          </div>
        )}
        {!data ? (
          <Loading />
        ) : !overview ? (
          <div className="rounded-lg border border-border px-4 py-10 text-center text-sm text-muted-foreground">{data.error}</div>
        ) : (
          <div className={cn('space-y-6 transition-opacity', stale && 'opacity-60')}>
            <Summary overview={overview} />
            <NextSteps overview={overview} />
            <KeywordsPanel key={`${overview.app.apple_id}:${overview.country}`} overview={overview} onChange={load} />
            <ListingPanel key={overview.app.apple_id} overview={overview} onRefresh={refresh} refreshing={refreshing} />
            <FunnelPanel overview={overview} days={days} onDays={setDays} />
            <ChangesPanel overview={overview} onChange={load} />
          </div>
        )}
      </main>
    </div>
  )
}

function Loading() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-48" />
      <Skeleton className="h-96" />
    </div>
  )
}

/** The listing search uses in the selected storefront: the live one, or before the first release the one being prepared. */
export function countryListing(o: AsoOverview) {
  return (o.listing.live.length ? o.listing.live : o.listing.draft).find((l) => l.locale === o.countryLocale) ?? null
}

function Tile({ label, value, detail, tone }: { label: string; value: React.ReactNode; detail?: React.ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums tracking-tight',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'bad' && 'text-red-600 dark:text-red-400',
          tone === 'warn' && 'text-amber-600 dark:text-amber-400'
        )}
      >
        {value}
      </div>
      {detail && <div className="mt-1 text-xs text-muted-foreground">{detail}</div>}
    </div>
  )
}

function Summary({ overview: o }: { overview: AsoOverview }) {
  const listing = countryListing(o)
  const audit = listing ? auditListing(listing, { category: o.app.primary_genre }) : null
  const search = o.funnel.sources.find((s) => s.source === 'App Store search')
  const allImpressions = o.funnel.sources.reduce((n, s) => n + s.impressions, 0)
  const conv = search && search.impressions ? search.gets / search.impressions : null
  const prevConv = search?.previous?.impressions ? search.previous.gets / search.previous.impressions : null
  const ranked = o.keywords.filter((k) => k.rank != null)
  const top10 = ranked.filter((k) => k.rank! <= 10).length
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label={`Listing score${listing ? ` · ${listing.locale_name}` : ''}`}
        value={audit ? audit.score : '—'}
        tone={audit ? (audit.score >= 80 ? 'good' : audit.score >= 60 ? 'warn' : 'bad') : undefined}
        detail={audit ? `${audit.wastedChars} wasted, ${audit.unusedChars} unused keyword characters` : 'Refresh to fetch the listing'}
      />
      <Tile
        label="Search conversion"
        value={conv == null ? '—' : `${(conv * 100).toFixed(1)}%`}
        tone={conv != null && prevConv != null ? (conv >= prevConv ? 'good' : 'bad') : undefined}
        detail={search ? `${fmtCompact(search.gets)} Get taps from ${fmtCompact(search.impressions)} search impressions${prevConv != null ? ` · was ${(prevConv * 100).toFixed(1)}%` : ''}` : 'No analytics reports yet'}
      />
      <Tile
        label="Impressions from search"
        value={search && allImpressions ? pct(search.impressions, allImpressions, 0) : '—'}
        detail={o.funnel.end ? `Last ${Math.round((Date.parse(o.funnel.end) - Date.parse(o.funnel.start!)) / 86400000) + 1} days, through ${fmtDate(o.funnel.end, { month: 'short', day: 'numeric' })}` : undefined}
      />
      <Tile
        label={`Keywords in the top 10 · ${countryToFlag(o.country)}`}
        value={o.keywords.length ? `${top10} / ${o.keywords.length}` : '—'}
        detail={o.keywords.length ? `${ranked.length} ranked in the top 200` : 'Track keywords below'}
      />
    </div>
  )
}

interface Step {
  tone: 'do' | 'good' | 'watch'
  text: React.ReactNode
}

/** Plain-language recommendations from everything on the page, most useful first. */
function NextSteps({ overview: o }: { overview: AsoOverview }) {
  const steps: Step[] = []
  const listing = countryListing(o)
  const audit = listing ? auditListing(listing, { category: o.app.primary_genre }) : null
  const where = territoryName(o.country)

  // Popular keywords the listing doesn't contain can't rank, whatever else you do.
  const missing = o.keywords.filter((k) => (k.popularity ?? 0) >= 40 && ['missing', 'partial'].includes(keywordCoverage(k.keyword, listing)))
  if (listing && missing.length) {
    steps.push({ tone: 'do', text: <>Add {missing.slice(0, 4).map((k) => `“${k.keyword}”`).join(', ')} to the {listing.locale_name} listing: {missing.length === 1 ? 'it is' : 'they are'} searched a lot in {where}, and words that aren’t in the name, subtitle or keywords can’t rank.</> })
  }
  if (audit && audit.wastedChars >= 5) {
    steps.push({ tone: 'do', text: <>{audit.wastedChars} of the {listing!.locale_name} keyword field’s 100 characters do nothing (spaces, repeats, words already in the name or subtitle). Use <b>Clean up</b> in the keyword editor, then fill the room.</> })
  } else if (audit && audit.unusedChars >= 15) {
    steps.push({ tone: 'do', text: <>The {listing!.locale_name} keyword field has {audit.unusedChars} characters left. Fill them with words from the ideas below.</> })
  }

  // Search vs browse: seen in search but not tapped points at the icon, name, subtitle and first screenshots.
  const search = o.funnel.sources.find((s) => s.source === 'App Store search')
  const browse = o.funnel.sources.find((s) => s.source === 'App Store browse')
  if (search && search.impressions >= 200) {
    const sc = search.gets / search.impressions
    const bc = browse && browse.impressions >= 100 ? browse.gets / browse.impressions : null
    if (bc != null && sc < bc * 0.6) {
      steps.push({ tone: 'do', text: <>Search converts at {(sc * 100).toFixed(1)}%, browse at {(bc * 100).toFixed(1)}%. People see you in search results but don’t tap: the icon, name, subtitle and first three screenshots are what they see there.</> })
    }
    const prev = search.previous
    if (prev && prev.impressions >= 100) {
      const change = (search.impressions - prev.impressions) / prev.impressions
      if (Math.abs(change) >= 0.15) {
        steps.push({ tone: change > 0 ? 'good' : 'watch', text: <>Search impressions are {change > 0 ? 'up' : 'down'} {Math.abs(change * 100).toFixed(0)}% on the period before. {change > 0 ? 'Your keyword visibility is growing.' : 'Check the change timeline and keyword ranks for what moved.'}</> })
      }
    }
  }

  const gap = o.localeGaps.find((g) => g.reason === 'missing')
  if (gap) {
    steps.push({ tone: 'do', text: <>Localize for {gap.country_name}: {fmtCompact(gap.impressions)} search impressions in 90 days without a listing in {gap.locale_name}.</> })
  }
  const secondary = o.localeGaps.find((g) => g.reason === 'secondary')
  if (secondary && !gap) {
    steps.push({ tone: 'do', text: <>Add a Spanish (Mexico) listing: the U.S. store indexes it too, which gives you another name, subtitle and keyword field for U.S. search.</> })
  }

  const moved = o.keywords.filter((k) => k.rank7 !== undefined)
  const up = moved.filter((k) => (k.rank ?? 201) <= (k.rank7 ?? 201) - 5)
  const down = moved.filter((k) => (k.rank ?? 201) >= (k.rank7 ?? 201) + 5)
  if (up.length) steps.push({ tone: 'good', text: <>Up 5+ places this week: {up.slice(0, 5).map((k) => `“${k.keyword}”`).join(', ')}.</> })
  if (down.length) steps.push({ tone: 'watch', text: <>Down 5+ places this week: {down.slice(0, 5).map((k) => `“${k.keyword}”`).join(', ')}.</> })

  const easy = o.keywords.filter((k) => (k.popularity ?? 0) >= 35 && (k.difficulty ?? 100) <= 45 && (k.rank == null || k.rank > 10))
  if (easy.length) {
    steps.push({ tone: 'do', text: <>Best openings: {easy.slice(0, 3).map((k) => `“${k.keyword}”`).join(', ')}. Searched often, and the apps ranking for {easy.length === 1 ? 'it' : 'them'} are beatable. Put {easy.length === 1 ? 'it' : 'them'} in the subtitle or name.</> })
  }
  if (!o.keywords.length) {
    steps.push({ tone: 'do', text: <>Start by tracking 10–20 keywords people would type to find this app in {where}. Each gets a daily rank, a popularity estimate and a difficulty score.</> })
  }

  if (!steps.length) return null
  const icons = { do: ArrowRight, good: CheckCircle2, watch: AlertTriangle }
  return (
    <Section title="What to do next" description="Recommendations from your listing, keyword ranks and App Store analytics.">
      <ul className="space-y-2.5">
        {steps.slice(0, 7).map((s, i) => {
          const Icon = icons[s.tone]
          return (
            <li key={i} className="flex gap-3 text-sm">
              <Icon
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  s.tone === 'do' && 'text-primary',
                  s.tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
                  s.tone === 'watch' && 'text-amber-600 dark:text-amber-400'
                )}
              />
              <span>{s.text}</span>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lightbulb className="h-3.5 w-3.5" /> Change one thing at a time and give it two weeks: the change timeline below shows what each one did.
      </p>
    </Section>
  )
}
