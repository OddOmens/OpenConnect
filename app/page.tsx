'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { AppSelector, App } from '@/components/dashboard/app-selector'
import { KPICards } from '@/components/dashboard/kpi-cards'
import { WorldMap, SalesTerritory } from '@/components/dashboard/world-map'
import { HistoryChart, HistoryPoint } from '@/components/dashboard/history-chart'
import { TerritoryTable } from '@/components/dashboard/territory-table'
import { StoreTable, StoreData } from '@/components/dashboard/store-table'
import { SubscriptionPanel, SubscriptionData } from '@/components/dashboard/subscription-panel'
import { Breakdowns, BreakdownData } from '@/components/dashboard/breakdowns'
import { ReviewsPanel } from '@/components/dashboard/reviews-panel'
import { SyncStatusButton, useSyncStatus } from '@/components/dashboard/sync-status'
import { SettingsDialog, ServerSettings } from '@/components/dashboard/settings-dialog'
import { CustomizeDialog } from '@/components/dashboard/customize-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { CURRENCIES, DEFAULT_PREFS, RANGES, RangeId, SECTIONS, SectionId, UiPrefs } from '@/lib/prefs'
import { fmtDate } from '@/lib/format'

interface DashboardData {
  range: { start?: string; end?: string }
  totals: HistoryPoint & { proceeds: number }
  previous: (HistoryPoint & { proceeds: number }) | null
  history: HistoryPoint[]
  hasMonthlyHistory: boolean
  territories: SalesTerritory[]
  breakdowns: BreakdownData
  subscriptions: SubscriptionData
}

// Sections that can share a row with a neighbouring half-width section.
const HALF_WIDTH: SectionId[] = ['map', 'breakdowns']

const selectCls =
  'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export default function DashboardPage() {
  const [apps, setApps] = useState<App[]>([])
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const [settings, setSettings] = useState<ServerSettings | null>(null)
  const [prefs, setPrefs] = useState<UiPrefs>(DEFAULT_PREFS)
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const [dash, setDash] = useState<DashboardData | null>(null)
  const [store, setStore] = useState<StoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewsKey, setReviewsKey] = useState(0)

  const loadApps = useCallback(async () => {
    const res = await fetch('/api/apps').catch(() => null)
    if (res?.ok) setApps((await res.json()).apps || [])
  }, [])

  const loadSettings = useCallback(async () => {
    const res = await fetch('/api/settings').catch(() => null)
    if (!res?.ok) return
    const data = await res.json()
    setSettings(data)
    setPrefs(data.prefs)
    setPrefsLoaded(true)
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

  useEffect(() => {
    loadApps()
    loadSettings()
  }, [loadApps, loadSettings])

  useEffect(() => {
    if (prefsLoaded) loadDashboard()
  }, [loadDashboard, prefsLoaded])

  useEffect(() => {
    loadStore()
  }, [loadStore])

  // Persist preference changes (debounced) so they survive reloads and live in the data volume.
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const updatePrefs = useCallback((patch: Partial<UiPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefs: next }),
        }).catch(() => {})
      }, 400)
      return next
    })
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-lg" />)}
          </div>
        ) : (
          <KPICards
            data={{
              totals: dash?.totals ?? null,
              previous: dash?.previous ?? null,
              activeSubs: dash?.subscriptions.active?.total ?? null,
              store: store?.summary ?? null,
            }}
            currency={prefs.currency}
            hidden={prefs.hiddenKpis}
            onHide={(k) => updatePrefs({ hiddenKpis: [...prefs.hiddenKpis, k] })}
          />
        )
      case 'history':
        return (
          <HistoryChart
            data={dash?.history || []}
            isLoading={loading && !dash}
            hasMonthlyHistory={!!dash?.hasMonthlyHistory}
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
        return <SubscriptionPanel data={dash?.subscriptions ?? null} currency={prefs.currency} onHide={() => hide('subscriptions')} />
      case 'breakdowns':
        return <Breakdowns data={dash?.breakdowns ?? null} currency={prefs.currency} onHide={() => hide('breakdowns')} />
      case 'reviews':
        return <ReviewsPanel appId={selectedAppId} apps={apps} refreshKey={reviewsKey} onHide={() => hide('reviews')} />
    }
  }

  const visible = prefs.sectionOrder.filter((s) => !prefs.hiddenSections.includes(s))
  // Pair adjacent half-width sections; a half-width section without a partner spans the full row.
  const spans = new Map<SectionId, 1 | 2>()
  for (let i = 0; i < visible.length; i++) {
    const s = visible[i]
    if (HALF_WIDTH.includes(s) && HALF_WIDTH.includes(visible[i + 1]) && !spans.has(s)) {
      spans.set(s, 1)
      spans.set(visible[i + 1], 1)
      i++
    } else if (!spans.has(s)) spans.set(s, 2)
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="truncate text-lg font-semibold tracking-tight">OpenConnect</h1>
            {dash?.range.start && (
              <span className="hidden text-xs text-muted-foreground md:inline">
                {fmtDate(dash.range.start)} – {fmtDate(dash.range.end)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select value={prefs.range} onChange={(e) => updatePrefs({ range: e.target.value as RangeId })} className={selectCls} aria-label="Date range">
              {(Object.keys(RANGES) as RangeId[]).map((r) => <option key={r} value={r}>{RANGES[r]}</option>)}
            </select>
            <select value={prefs.currency} onChange={(e) => updatePrefs({ currency: e.target.value })} className={`${selectCls} hidden sm:block`} aria-label="Currency">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <SyncStatusButton sync={sync} />
            <CustomizeDialog prefs={prefs} onPrefs={updatePrefs} />
            <SettingsDialog
              apps={apps}
              settings={settings}
              onToggleVisibility={toggleApp}
              onSaved={() => {
                loadSettings()
                sync.refresh()
              }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <AppSelector apps={apps} selectedAppId={selectedAppId} onSelect={setSelectedAppId} onToggleVisibility={toggleApp} showHidden />

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

        <div className="grid gap-6 lg:grid-cols-2">
          {visible.map((id) => (
            <div key={id} className={spans.get(id) === 1 ? 'min-w-0' : 'min-w-0 lg:col-span-2'}>
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
  )
}
