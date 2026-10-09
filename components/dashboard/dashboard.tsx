'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Settings, Share2, SlidersHorizontal } from 'lucide-react'
import { AppSelector, App } from '@/components/dashboard/app-selector'
import { KPICards, KPI_COLUMNS } from '@/components/dashboard/kpi-cards'
import dynamic from 'next/dynamic'
import type { SalesTerritory } from '@/components/dashboard/world-map'
import type { CoarseHistory, HistoryPoint } from '@/components/dashboard/history-chart'
import type { StoreData } from '@/components/dashboard/store-table'
import type { SubscriptionData } from '@/components/dashboard/subscription-panel'
import type { BreakdownData } from '@/components/dashboard/breakdowns'
import { SyncStatusButton, useSyncStatus } from '@/components/dashboard/sync-status'
import type { ServerSettings } from '@/components/settings/settings-view'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { CURRENCIES, DEFAULT_PREFS, RANGES, RangeId, SECTIONS, SectionId, UiPrefs, monthRangeLabel } from '@/lib/prefs'
import { fmtDate } from '@/lib/format'

// Charts, the map and the tables are loaded after the first paint, in parallel, so the page
// shows its numbers straight away instead of waiting for ~1 MB of chart and map code.
const panel = (h: number) => function PanelLoading() {
  return <Skeleton className="w-full rounded-lg" style={{ height: h }} />
}
const HistoryChart = dynamic(() => import('@/components/dashboard/history-chart').then((m) => m.HistoryChart), { ssr: false, loading: panel(420) })
const WorldMap = dynamic(() => import('@/components/dashboard/world-map').then((m) => m.WorldMap), { ssr: false, loading: panel(360) })
const TerritoryTable = dynamic(() => import('@/components/dashboard/territory-table').then((m) => m.TerritoryTable), { ssr: false, loading: panel(360) })
const StoreTable = dynamic(() => import('@/components/dashboard/store-table').then((m) => m.StoreTable), { ssr: false, loading: panel(420) })
const SubscriptionPanel = dynamic(() => import('@/components/dashboard/subscription-panel').then((m) => m.SubscriptionPanel), { ssr: false, loading: panel(300) })
const Breakdowns = dynamic(() => import('@/components/dashboard/breakdowns').then((m) => m.Breakdowns), { ssr: false, loading: panel(360) })
const ReviewsPanel = dynamic(() => import('@/components/dashboard/reviews-panel').then((m) => m.ReviewsPanel), { ssr: false, loading: panel(360) })

export interface DashboardData {
  range: { start?: string; end?: string }
  totals: HistoryPoint & { proceeds: number }
  previous: (HistoryPoint & { proceeds: number }) | null
  history: HistoryPoint[]
  coarseHistory: CoarseHistory
  engagementPending: boolean
  territories: SalesTerritory[]
  breakdowns: BreakdownData
  subscriptions: SubscriptionData
}


const selectCls =
  'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

/** Everything the first render needs, read from the local database on the server. */
export interface InitialData {
  apps: App[]
  months: string[]
  settings: ServerSettings
  dash: DashboardData
  store: StoreData
}

export function Dashboard({ initial }: { initial: InitialData }) {
  const [apps, setApps] = useState<App[]>(initial.apps)
  const [months, setMonths] = useState<string[]>(initial.months)
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<UiPrefs>(initial.settings.prefs ?? DEFAULT_PREFS)
  const [dash, setDash] = useState<DashboardData | null>(initial.dash)
  const [store, setStore] = useState<StoreData | null>(initial.store)
  const [loading, setLoading] = useState(false)
  const [reviewsKey, setReviewsKey] = useState(0)

  const loadApps = useCallback(async () => {
    const res = await fetch('/api/apps').catch(() => null)
    if (res?.ok) {
      const data = await res.json()
      setApps(data.apps || [])
      setMonths(data.months || [])
    }
  }, [])


  const loadStore = useCallback(async () => {
    const res = await fetch(`/api/store?app=${selectedAppId || 'all'}`).catch(() => null)
    if (res?.ok) setStore(await res.json())
  }, [selectedAppId])

  const dashQuery = `app=${selectedAppId || 'all'}&range=${prefs.range}&granularity=${prefs.granularity}&currency=${prefs.currency}&compare=${prefs.compareToPrevious ? 1 : 0}`
  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboard?${dashQuery}`)
      if (res.ok) setDash(await res.json())
    } finally {
      setLoading(false)
    }
  }, [dashQuery])

  // The server rendered the first view's data; only fetch again when the view changes.
  const firstDash = useRef(true)
  useEffect(() => {
    if (firstDash.current) {
      firstDash.current = false
      return
    }
    loadDashboard()
  }, [loadDashboard])

  const firstStore = useRef(true)
  useEffect(() => {
    if (firstStore.current) {
      firstStore.current = false
      return
    }
    loadStore()
  }, [loadStore])

  // Persist preference changes (debounced) so they survive reloads and live in the data volume.
  // Only the changed fields are sent, so this tab can't overwrite settings saved elsewhere
  // (e.g. the share page's choices).
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pendingPrefs = useRef<Partial<UiPrefs>>({})
  const updatePrefs = useCallback((patch: Partial<UiPrefs>) => {
    setPrefs((prev) => ({ ...prev, ...patch }))
    pendingPrefs.current = { ...pendingPrefs.current, ...patch }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const body = JSON.stringify({ prefs: pendingPrefs.current })
      pendingPrefs.current = {}
      fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {})
    }, 400)
  }, [])

  const sync = useSyncStatus((job) => {
    loadApps()
    if (job === 'asc') {
      loadDashboard()
      setReviewsKey((k) => k + 1)
    } else {
      loadStore()
    }
  })

  const toggleApp = async (appleId: string) => {
    // A hidden app leaves the sidebar, so don't stay on it.
    if (appleId === selectedAppId && !apps.find((a) => a.apple_id === appleId)?.hidden) setSelectedAppId(null)
    await fetch('/api/apps', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apple_id: appleId }),
    })
    await loadApps()
    if (!selectedAppId) {
      loadDashboard()
      loadStore()
    }
  }

  const hide = (id: SectionId) => updatePrefs({ hiddenSections: [...prefs.hiddenSections, id] })

  const permissionError = sync.status?.coverage.reports.find((r) => r.error > 0 && /HTTP 40[13]/.test(r.lastError || ''))

  const renderSection = (id: SectionId) => {
    switch (id) {
      case 'kpis':
        return loading && !dash ? (
          <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${KPI_COLUMNS[prefs.kpiColumns] ?? KPI_COLUMNS[4]}`}>
            {Array.from({ length: prefs.kpiColumns }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-lg" />)}
          </div>
        ) : (
          <KPICards
            data={{
              totals: dash?.totals ?? null,
              previous: dash?.previous ?? null,
              activeSubs: dash?.subscriptions.active?.total ?? null,
              engagementPending: !!dash?.engagementPending,
              store: store?.summary ?? null,
            }}
            currency={prefs.currency}
            hidden={prefs.hiddenKpis}
            order={prefs.kpiOrder}
            columns={prefs.kpiColumns}
            onHide={(k) => updatePrefs({ hiddenKpis: [...prefs.hiddenKpis, k] })}
          />
        )
      case 'history':
        return (
          <HistoryChart
            data={dash?.history || []}
            isLoading={loading && !dash}
            coarseHistory={dash?.coarseHistory ?? null}
            prefs={prefs}
            onPrefs={updatePrefs}
            onHide={() => hide('history')}
          />
        )
      case 'map':
        return (
          <WorldMap
            sales={dash?.territories || []}
            store={store?.countries || []}
            metric={prefs.mapMetric}
            currency={prefs.currency}
            onMetric={(mapMetric) => updatePrefs({ mapMetric })}
            hidden={prefs.hiddenMapItems}
            onHide={() => hide('map')}
          />
        )
      case 'territories':
        return (
          <TerritoryTable
            territories={dash?.territories || []}
            currency={prefs.currency}
            hiddenColumns={prefs.hiddenTerritoryColumns}
            onColumns={(hiddenTerritoryColumns) => updatePrefs({ hiddenTerritoryColumns })}
            onHide={() => hide('territories')}
          />
        )
      case 'store':
        return (
          <StoreTable
            data={store}
            apps={apps}
            selectedAppId={selectedAppId}
            hiddenColumns={prefs.hiddenStoreColumns}
            onColumns={(hiddenStoreColumns) => updatePrefs({ hiddenStoreColumns })}
            onHide={() => hide('store')}
            onRefresh={() => sync.start('store')}
            refreshing={!!sync.status?.jobs.store.running}
          />
        )
      case 'subscriptions':
        return <SubscriptionPanel data={dash?.subscriptions ?? null} currency={prefs.currency} hidden={prefs.hiddenSubscriptionItems} onHide={() => hide('subscriptions')} />
      case 'breakdowns':
        return <Breakdowns data={dash?.breakdowns ?? null} currency={prefs.currency} hidden={prefs.hiddenBreakdowns} onHide={() => hide('breakdowns')} />
      case 'reviews':
        return <ReviewsPanel appId={selectedAppId} apps={apps} refreshKey={reviewsKey} onHide={() => hide('reviews')} />
    }
  }

  const visible = prefs.sectionOrder.filter((s) => !prefs.hiddenSections.includes(s))
  // Pair adjacent half-width sections; a half-width section without a partner spans the full row.
  const spans = new Map<SectionId, 1 | 2>()
  for (let i = 0; i < visible.length; i++) {
    const s = visible[i]
    const half = (id: SectionId | undefined) => !!id && prefs.sectionWidths[id] === 'half'
    if (half(s) && half(visible[i + 1]) && !spans.has(s)) {
      spans.set(s, 1)
      spans.set(visible[i + 1], 1)
      i++
    } else if (!spans.has(s)) spans.set(s, 2)
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 max-w-screen-2xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="truncate text-lg font-semibold tracking-tight">OpenConnect</h1>
            {dash?.range.start && (
              <span className="hidden text-xs text-muted-foreground md:inline">
                {fmtDate(dash.range.start)} – {fmtDate(dash.range.end)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select value={prefs.range} onChange={(e) => updatePrefs({ range: e.target.value as UiPrefs['range'] })} className={selectCls} aria-label="Date range">
              {(Object.keys(RANGES) as RangeId[]).map((r) => <option key={r} value={r}>{RANGES[r]}</option>)}
              {months.length > 0 && (
                <optgroup label="Month">
                  {months.map((m) => <option key={m} value={`m:${m}`}>{monthRangeLabel(m)}</option>)}
                </optgroup>
              )}
            </select>
            <select value={prefs.currency} onChange={(e) => updatePrefs({ currency: e.target.value })} className={`${selectCls} hidden sm:block`} aria-label="Currency">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <SyncStatusButton sync={sync} />
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href="/share">
                <Share2 className="h-4 w-4" />
                <span className="hidden sm:inline">Share</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href="/settings#customize">
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Customize</span>
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" title="Settings">
              <Link href="/settings" aria-label="Settings">
                <Settings className="h-5 w-5 text-muted-foreground" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div
        className={`mx-auto max-w-screen-2xl gap-6 px-4 py-6 sm:px-6 lg:grid lg:px-8 ${
          prefs.sidebar === 'right' ? 'lg:grid-cols-[minmax(0,1fr)_240px]' : 'lg:grid-cols-[240px_minmax(0,1fr)]'
        }`}
      >
        <aside className={`mb-6 lg:mb-0 ${prefs.sidebar === 'right' ? 'lg:order-2' : ''}`}>
          <div className="lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-112px)] lg:overflow-y-auto">
            <AppSelector apps={apps} selectedAppId={selectedAppId} onSelect={setSelectedAppId} onToggleVisibility={toggleApp} />
          </div>
        </aside>

        <main className="min-w-0 space-y-6">
          {permissionError && (
            <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <div className="font-medium">Sales data can&apos;t be downloaded with this API key</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Apple says: “{permissionError.lastError?.split(' (HTTP')[0]}”. Create a Team Key with the <b>Sales</b> role in App Store Connect →
                  Users and Access → Integrations, enter it in Settings, then sync again. Ratings, rankings and reviews work without it.
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            {visible.map((id) => (
              <div key={id} className={spans.get(id) === 1 ? 'min-w-0' : 'min-w-0 xl:col-span-2'}>
                {renderSection(id)}
              </div>
            ))}
          </div>

          {prefs.hiddenSections.length > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Hidden: {prefs.hiddenSections.map((s) => SECTIONS[s]).join(', ')} ·{' '}
              <button className="underline underline-offset-2 hover:text-foreground" onClick={() => updatePrefs({ hiddenSections: [] })}>
                Show all
              </button>
            </p>
          )}
        </main>
      </div>
    </div>
  )
}
