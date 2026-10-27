'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Lightbulb, Loader2, RefreshCw } from 'lucide-react'
import { AppNav } from '@/components/nav/app-nav'
import { AppSelector, type App } from '@/components/dashboard/app-selector'
import { SyncStatusButton, useSyncStatus } from '@/components/dashboard/sync-status'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Section } from '@/components/dashboard/section'
import { selectCls } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { fmtCompact, fmtDate } from '@/lib/format'
import { TERRITORIES, countryToFlag, territoryName } from '@/lib/territories'
import { auditListing, keywordCoverage } from '@/lib/aso-audit'
import type { AsoOverview, PortfolioApp } from '@/lib/aso'
import { KeywordsPanel } from './keywords-panel'
import { ListingPanel } from './listing-panel'
import { FunnelPanel } from './funnel-panel'
import { ChangesPanel } from './changes-panel'
import { PortfolioPanel } from './portfolio-panel'

export type Days = 7 | 30 | 90

const STORAGE_KEY = 'openconnect.aso'

function saved(): { app?: string; countries?: Record<string, string> } {
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

export function AsoView({ initialApps, initialPortfolio, sidebar }: { initialApps: App[]; initialPortfolio: PortfolioApp[]; sidebar: 'left' | 'right' }) {
  const [apps, setApps] = useState(initialApps)
  const visible = useMemo(() => apps.filter((a) => !a.hidden), [apps])
  // null = All Apps, as on the dashboard.
  const [appId, setAppId] = useState<string | null>(null)
  // The storefront per app: its primary language's until you pick another.
  const [countries, setCountries] = useState<Record<string, string>>({})
  const country = (appId && countries[appId]) || 'US'
  const [days, setDays] = useState<Days>(30)
  const [data, setData] = useState<{ query: string; overview: AsoOverview | null; error?: string } | null>(null)
  const [portfolio, setPortfolio] = useState<{ days: number; apps: PortfolioApp[] }>({ days: 30, apps: initialPortfolio })
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null)

  // ?app=<id> (links from elsewhere), else the last selection in this browser.
  useEffect(() => {
    const s = saved()
    const linked = new URLSearchParams(window.location.search).get('app')
    const app = [linked, s.app].find((id) => id && visible.some((a) => a.apple_id === id))
    if (app) setAppId(app)
    if (s.countries) setCountries(Object.fromEntries(Object.entries(s.countries).filter(([, c]) => TERRITORIES.some((t) => t.code === c))))
    // Only on first load: later changes to the app list don't move the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ app: appId, countries }))
    } catch {
      // private window
    }
  }, [appId, countries])

  const query = appId ? `app=${appId}&country=${country}&days=${days}` : ''
  // Bumped to load the same query again after a change; resolves `load()`'s promise once it's in.
  const [version, setVersion] = useState(0)
  const pending = useRef<(() => void)[]>([])
  useEffect(() => {
    if (!query) return
    let live = true
    const app = appId!
    fetch(`/api/aso?${query}`)
      .then(async (res) => ({ res, body: await res.json().catch(() => null) }))
      .catch(() => ({ res: null, body: null }))
      .then(({ res, body }) => {
        if (!live) return
        setData({ query, overview: res?.ok ? body : null, error: res?.ok ? undefined : body?.error || 'Couldn’t load ASO data.' })
        pending.current.splice(0).forEach((resolve) => resolve())
        // First visit to this app: switch to its primary language's storefront.
        const first = (body as AsoOverview | null)?.markets?.[0]?.country
        if (res?.ok && first) setCountries((c) => (c[app] ? c : { ...c, [app]: first }))
      })
    return () => {
      live = false
    }
  }, [query, version, appId])
  const load = useCallback(
    () =>
      new Promise<void>((resolve) => {
        pending.current.push(resolve)
        setVersion((v) => v + 1)
      }),
    []
  )

  const [portfolioVersion, setPortfolioVersion] = useState(0)
  useEffect(() => {
    if (!portfolioVersion && days === 30) return // the server rendered this one
    let live = true
    fetch(`/api/aso?app=all&days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d?.apps && setPortfolio({ days: d.days, apps: d.apps }), () => {})
    return () => {
      live = false
    }
  }, [days, portfolioVersion])
  const loadPortfolio = useCallback(() => setPortfolioVersion((v) => v + 1), [])

  const sync = useSyncStatus(() => {
    loadPortfolio()
    if (appId) load()
  })

  const overview = data?.overview ?? null
  const stale = data?.query !== query

  const refresh = async () => {
    if (!appId) return
    setRefreshing(true)
    setNotice(null)
    try {
      const r = await asoAction({ action: 'refresh', app: appId, country })
      if (r.error) setNotice({ tone: 'warn', text: r.error })
      else if (r.queued) setNotice({ tone: 'info', text: `Ranked ${r.checked} keyword${r.checked === 1 ? '' : 's'} in ${territoryName(country)}. The other ${r.queued} storefronts’ keywords are being checked in the background; switch storefront in a minute or two to see them.` })
      await load()
      loadPortfolio()
    } catch (err: any) {
      setNotice({ tone: 'warn', text: err.message })
    } finally {
      setRefreshing(false)
    }
  }

  const toggleApp = async (id: string) => {
    // A hidden app leaves the sidebar, so don't stay on it.
    if (id === appId) setAppId(null)
    await fetch('/api/apps', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apple_id: id }) })
    const r = await fetch('/api/apps').then((res) => res.json()).catch(() => null)
    if (r?.apps) setApps(r.apps)
    loadPortfolio()
  }

  const select = (id: string | null) => {
    setNotice(null)
    setAppId(id)
  }

  const countryOptions = useMemo(() => {
    const markets = overview?.markets || []
    const listed = new Set(markets.map((m) => m.country))
    return {
      markets,
      rest: [...TERRITORIES].sort((a, b) => a.name.localeCompare(b.name)).filter((t) => !listed.has(t.code)),
    }
  }, [overview?.markets])

  const byApp = useMemo(() => new Map(portfolio.apps.map((p) => [p.apple_id, p])), [portfolio.apps])
  const appDetail = (a: App) => {
    const p = byApp.get(a.apple_id)
    if (!p || p.score == null) return 'Listing not fetched yet'
    return `Score ${p.score}${p.keywords ? ` · ${p.top10}/${p.keywords} in top 10` : ''}`
  }
  const allTop10 = portfolio.apps.reduce((n, p) => n + p.top10, 0)
  const allKeywords = portfolio.apps.reduce((n, p) => n + p.keywords, 0)

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
            {appId && (
              <select value={country} onChange={(e) => setCountries((c) => ({ ...c, [appId]: e.target.value }))} className={cn(selectCls, 'max-w-[13rem]')} aria-label="Storefront">
                {countryOptions.markets.length > 0 && (
                  <optgroup label="Your listing’s languages">
                    {countryOptions.markets.map((m) => (
                      <option key={m.country} value={m.country}>
                        {countryToFlag(m.country)} {m.country_name}{m.locale_name ? ` · ${m.locale_name}` : ''} ({m.keywords})
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label={countryOptions.markets.length ? 'Other storefronts' : 'Storefront'}>
                  {countryOptions.rest.map((t) => <option key={t.code} value={t.code}>{countryToFlag(t.code)} {t.name}</option>)}
                </optgroup>
              </select>
            )}
            {appId && (
              <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} title="Fetch the listing from App Store Connect and check this app’s keyword ranks now">
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-2 hidden md:inline">Refresh</span>
              </Button>
            )}
            <SyncStatusButton sync={sync} />
          </>
        }
      />

      <div className={`mx-auto max-w-screen-2xl gap-6 px-4 py-6 sm:px-6 lg:grid lg:px-8 ${sidebar === 'right' ? 'lg:grid-cols-[minmax(0,1fr)_240px]' : 'lg:grid-cols-[240px_minmax(0,1fr)]'}`}>
        <aside className={`mb-6 lg:mb-0 ${sidebar === 'right' ? 'lg:order-2' : ''}`}>
          <div className="lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-112px)] lg:overflow-y-auto">
            <AppSelector
              apps={apps}
              selectedAppId={appId}
              onSelect={select}
              onToggleVisibility={toggleApp}
              detail={appDetail}
              allDetail={allKeywords ? `${allTop10}/${allKeywords} keywords in top 10` : `${portfolio.apps.length} apps`}
            />
          </div>
        </aside>

        <main className="min-w-0 space-y-6">
          {notice && (
            <div className={cn('flex gap-3 rounded-lg border px-4 py-3 text-sm', notice.tone === 'warn' ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-card')}>
              {notice.tone === 'warn' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
              <div>{notice.text}</div>
            </div>
          )}
          {!appId ? (
            <PortfolioPanel apps={portfolio.apps} days={days} onDays={setDays} onSelect={select} />
          ) : !data || (stale && data.overview?.app.apple_id !== appId) ? (
            <Loading />
          ) : !overview ? (
            <div className="rounded-lg border border-border px-4 py-10 text-center text-sm text-muted-foreground">{data.error}</div>
          ) : (
            <div className={cn('space-y-6 transition-opacity', stale && 'opacity-60')}>
              <Summary overview={overview} />
              <NextSteps overview={overview} />
              <KeywordsPanel
                key={`${overview.app.apple_id}:${overview.country}`}
                overview={overview}
                onChange={load}
                onCountry={(c) => setCountries((m) => ({ ...m, [overview.app.apple_id]: c }))}
                onRefresh={refresh}
                refreshing={refreshing}
              />
              <ListingPanel key={overview.app.apple_id} overview={overview} onRefresh={refresh} refreshing={refreshing} onSaved={load} />
              <FunnelPanel overview={overview} days={days} onDays={setDays} />
              <ChangesPanel overview={overview} onChange={load} />
            </div>
          )}
        </main>
      </div>
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
    steps.push({
      tone: 'do',
      text: listing?.keywords.trim()
        ? <>The {listing.locale_name} keyword field’s terms are tracked in {where} once the listing is fetched again: press <b>Refresh</b>.</>
        : <>Nothing in the keyword field to track in {where}. Fill the {listing?.locale_name ?? 'listing’s'} keyword field in App Store Connect, or track 10–20 keywords people would type to find this app.</>,
    })
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
