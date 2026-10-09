"use client"

import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Segmented, Toggle } from "@/components/dashboard/section"
import type { App } from "@/components/dashboard/app-selector"
import { Panel } from "./panel"
import {
  BREAKDOWN_TABS, DEFAULT_PREFS, HISTORY_SERIES, KPIS, MAP_ITEMS, SECTIONS, STORE_COLUMNS, SUBSCRIPTION_ITEMS, TERRITORY_COLUMNS,
  BreakdownTab, HistorySeries, KpiId, MapItem, SectionId, SectionWidth, StoreColumn, SubscriptionItem, TerritoryColumn, UiPrefs,
} from "@/lib/prefs"

function toggleIn<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

interface Props {
  prefs: UiPrefs
  onPrefs: (p: Partial<UiPrefs>) => void
  apps: App[]
  onToggleApp: (id: string) => void
  footer?: React.ReactNode
}

const selectCls =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"

function moved<T>(list: T[], item: T, delta: number): T[] | null {
  const order = [...list]
  const i = order.indexOf(item)
  const j = i + delta
  if (i < 0 || j < 0 || j >= order.length) return null
  ;[order[i], order[j]] = [order[j], order[i]]
  return order
}

/**
 * Everything about what the dashboard shows and where: apps, layout, sections, metrics,
 * columns and the parts inside each section. Changes save as you make them.
 */
export function CustomizeSettings({ prefs, onPrefs, apps, onToggleApp, footer }: Props) {
  const move = (id: SectionId, delta: number) => {
    const order = moved(prefs.sectionOrder, id, delta)
    if (order) onPrefs({ sectionOrder: order })
  }
  const moveKpi = (id: KpiId, delta: number) => {
    const order = moved(prefs.kpiOrder, id, delta)
    if (order) onPrefs({ kpiOrder: order })
  }
  const width = (id: SectionId): SectionWidth => prefs.sectionWidths[id] ?? "full"
  const arrows = (label: string, i: number, count: number, onMove: (delta: number) => void) => (
    <>
      <button onClick={() => onMove(-1)} disabled={i === 0} className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label={`Move ${label} up`}>
        <ChevronUp className="h-4 w-4" />
      </button>
      <button onClick={() => onMove(1)} disabled={i === count - 1} className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label={`Move ${label} down`}>
        <ChevronDown className="h-4 w-4" />
      </button>
    </>
  )

  return (
    <>
      <Panel title="Apps" description="Hidden apps are left out of the app list and of All Apps totals." footer={footer}>
        <div className="divide-y divide-border rounded-md border border-border">
          {apps.map((app) => (
            <label key={app.apple_id} className="flex cursor-pointer items-center gap-3 px-3 py-2">
              <Switch checked={!app.hidden} onCheckedChange={() => onToggleApp(app.apple_id)} />
              {app.icon_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={app.icon_url} alt="" className="h-6 w-6 shrink-0 rounded-md" />
              ) : (
                <div className="h-6 w-6 shrink-0 rounded-md bg-muted" />
              )}
              <span className={`min-w-0 flex-1 truncate text-sm ${app.hidden ? "text-muted-foreground" : ""}`}>{app.name}</span>
            </label>
          ))}
          {!apps.length && <div className="px-3 py-2 text-xs text-muted-foreground">Apps appear after the first sync.</div>}
        </div>
      </Panel>

      <Panel title="Layout" description="Where things sit on the dashboard." footer={footer}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">App list</span>
            <select value={prefs.sidebar} onChange={(e) => onPrefs({ sidebar: e.target.value as UiPrefs["sidebar"] })} className={selectCls}>
              <option value="left">Left side</option>
              <option value="right">Right side</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Key metrics per row</span>
            <select value={prefs.kpiColumns} onChange={(e) => onPrefs({ kpiColumns: Number(e.target.value) as UiPrefs["kpiColumns"] })} className={selectCls}>
              {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <div className="space-y-2">
          <div>
            <div className="text-sm font-medium">Sections</div>
            <div className="text-xs text-muted-foreground">Show, order and size each section. Two half-width sections next to each other share a row on wide screens.</div>
          </div>
          <div className="divide-y divide-border rounded-md border border-border">
            {prefs.sectionOrder.map((id, i) => (
              <div key={id} className="flex items-center gap-3 px-3 py-2">
                <Switch checked={!prefs.hiddenSections.includes(id)} onCheckedChange={() => onPrefs({ hiddenSections: toggleIn(prefs.hiddenSections, id) })} />
                <span className="flex-1 text-sm">{SECTIONS[id]}</span>
                {id !== "kpis" && (
                  <Segmented
                    value={width(id)}
                    onChange={(w) => onPrefs({ sectionWidths: { ...prefs.sectionWidths, [id]: w } })}
                    options={[
                      { value: "full", label: "Full" },
                      { value: "half", label: "Half" },
                    ]}
                  />
                )}
                {arrows(SECTIONS[id], i, prefs.sectionOrder.length, (d) => move(id, d))}
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Key metrics" description="The cards across the top of the dashboard, in this order." footer={footer}>
        <div className="divide-y divide-border rounded-md border border-border">
          {prefs.kpiOrder.map((id, i) => (
            <div key={id} className="flex items-center gap-3 px-3 py-1.5">
              <Switch checked={!prefs.hiddenKpis.includes(id)} onCheckedChange={() => onPrefs({ hiddenKpis: toggleIn(prefs.hiddenKpis, id) })} />
              <span className="flex-1 text-sm">{KPIS[id]}</span>
              {arrows(KPIS[id], i, prefs.kpiOrder.length, (d) => moveKpi(id, d))}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Inside each section" description="Switch off any series, column or part you don’t want to see." footer={footer}>
        <Detail title="History chart series">
          <Chips<HistorySeries> all={HISTORY_SERIES} hidden={prefs.hiddenHistorySeries} onChange={(hiddenHistorySeries) => onPrefs({ hiddenHistorySeries })} />
        </Detail>
        <Detail title="World Map">
          <Chips<MapItem> all={MAP_ITEMS} hidden={prefs.hiddenMapItems} onChange={(hiddenMapItems) => onPrefs({ hiddenMapItems })} />
        </Detail>
        <Detail title="Breakdowns">
          <Chips<BreakdownTab> all={BREAKDOWN_TABS} hidden={prefs.hiddenBreakdowns} onChange={(hiddenBreakdowns) => onPrefs({ hiddenBreakdowns })} />
        </Detail>
        <Detail title="Ratings & Rankings columns">
          <Chips<StoreColumn> all={STORE_COLUMNS} hidden={prefs.hiddenStoreColumns} onChange={(hiddenStoreColumns) => onPrefs({ hiddenStoreColumns })} />
        </Detail>
        <Detail title="Territory columns">
          <Chips<TerritoryColumn> all={TERRITORY_COLUMNS} hidden={prefs.hiddenTerritoryColumns} onChange={(hiddenTerritoryColumns) => onPrefs({ hiddenTerritoryColumns })} />
        </Detail>
        <Detail title="Subscriptions">
          <Chips<SubscriptionItem> all={SUBSCRIPTION_ITEMS} hidden={prefs.hiddenSubscriptionItems} onChange={(hiddenSubscriptionItems) => onPrefs({ hiddenSubscriptionItems })} />
        </Detail>
      </Panel>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            // Only what this section controls; theme, defaults and share choices stay.
            onPrefs({ ...DEFAULT_PREFS, share: prefs.share, theme: prefs.theme, currency: prefs.currency, range: prefs.range, compareToPrevious: prefs.compareToPrevious })
          }
        >
          Reset layout to defaults
        </Button>
      </div>
    </>
  )
}

function Detail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{title}</div>
      {children}
    </div>
  )
}

function Chips<K extends string>({ all, hidden, onChange }: { all: Record<K, string>; hidden: K[]; onChange: (h: K[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(all) as K[]).map((k) => (
        <Toggle key={k} active={!hidden.includes(k)} onClick={() => onChange(toggleIn(hidden, k))}>
          {all[k]}
        </Toggle>
      ))}
    </div>
  )
}
