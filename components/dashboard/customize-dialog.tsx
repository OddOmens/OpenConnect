"use client"

import * as React from "react"
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Toggle } from "./section"
import {
  CURRENCIES, DEFAULT_PREFS, HISTORY_SERIES, KPIS, RANGES, SECTIONS, STORE_COLUMNS, TERRITORY_COLUMNS,
  HistorySeries, KpiId, RangeId, SectionId, StoreColumn, TerritoryColumn, UiPrefs,
} from "@/lib/prefs"

function toggleIn<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

export function CustomizeDialog({ prefs, onPrefs }: { prefs: UiPrefs; onPrefs: (p: Partial<UiPrefs>) => void }) {
  const move = (id: SectionId, delta: number) => {
    const order = [...prefs.sectionOrder]
    const i = order.indexOf(id)
    const j = i + delta
    if (j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    onPrefs({ sectionOrder: order })
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Customize</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Customize Dashboard</DialogTitle>
          <DialogDescription>Choose what to show and in what order. Changes save automatically.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Group title="Sections">
            <div className="divide-y divide-border rounded-md border border-border">
              {prefs.sectionOrder.map((id, i) => (
                <div key={id} className="flex items-center gap-3 px-3 py-2">
                  <Switch
                    checked={!prefs.hiddenSections.includes(id)}
                    onCheckedChange={() => onPrefs({ hiddenSections: toggleIn(prefs.hiddenSections, id) })}
                  />
                  <span className="flex-1 text-sm">{SECTIONS[id]}</span>
                  <button onClick={() => move(id, -1)} disabled={i === 0} className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button onClick={() => move(id, 1)} disabled={i === prefs.sectionOrder.length - 1} className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </Group>

          <Group title="Key metrics">
            <Chips<KpiId> all={KPIS} hidden={prefs.hiddenKpis} onChange={(hiddenKpis) => onPrefs({ hiddenKpis })} />
          </Group>

          <Group title="History chart series">
            <Chips<HistorySeries> all={HISTORY_SERIES} hidden={prefs.hiddenHistorySeries} onChange={(hiddenHistorySeries) => onPrefs({ hiddenHistorySeries })} />
          </Group>

          <Group title="Territory columns">
            <Chips<TerritoryColumn> all={TERRITORY_COLUMNS} hidden={prefs.hiddenTerritoryColumns} onChange={(hiddenTerritoryColumns) => onPrefs({ hiddenTerritoryColumns })} />
          </Group>

          <Group title="Ratings & Rankings columns">
            <Chips<StoreColumn> all={STORE_COLUMNS} hidden={prefs.hiddenStoreColumns} onChange={(hiddenStoreColumns) => onPrefs({ hiddenStoreColumns })} />
          </Group>

          <Group title="Defaults">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs text-muted-foreground">
                Date range
                <select
                  value={prefs.range}
                  onChange={(e) => onPrefs({ range: e.target.value as RangeId })}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                >
                  {(Object.keys(RANGES) as RangeId[]).map((r) => <option key={r} value={r}>{RANGES[r]}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                Currency
                <select
                  value={prefs.currency}
                  onChange={(e) => onPrefs({ currency: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <label className="mt-3 flex items-center justify-between text-sm">
              Compare with previous period
              <Switch checked={prefs.compareToPrevious} onCheckedChange={(compareToPrevious) => onPrefs({ compareToPrevious })} />
            </label>
          </Group>

          <div className="border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={() => onPrefs(DEFAULT_PREFS)}>
              Reset to defaults
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{title}</h4>
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
