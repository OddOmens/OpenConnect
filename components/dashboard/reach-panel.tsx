"use client"

import * as React from "react"
import { ChevronDown, LayoutGrid } from "lucide-react"
import { Section, EmptyState } from "./section"
import { InteractiveMap, MapPoint } from "./world-map"
import type { App } from "./app-selector"
import { TERRITORIES, TERRITORY_BY_CODE, countryToFlag } from "@/lib/territories"
import type { ReachItem } from "@/lib/prefs"
import { cn } from "@/lib/utils"

export interface ReachEntry {
  countries: Record<string, string> // storefront → first download date
  count: number
  newInRange: number
}

export interface ReachData {
  total: number
  all: ReachEntry
  apps: Record<string, ReachEntry>
}

const REACHED = "#3b82f6"
const NEW = "#10b981"
const NOT_REACHED = "rgba(113, 113, 122, 0.45)"

/** "2025-03-14" → "Mar 2025"; yearly-only history (Jan 1) → just the year. */
function firstSeen(date: string) {
  if (date.endsWith("-01-01")) return date.slice(0, 4)
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", year: "numeric" })
}

interface Props {
  data: ReachData | null
  apps: App[]
  selectedAppId: string | null
  onSelectApp: (id: string | null) => void
  range: { start?: string; end?: string } // the dashboard's range; decides what counts as new
  hidden: ReachItem[]
  onHide: () => void
}

/** How many of the App Store's storefronts each app has been downloaded in. */
export function ReachPanel({ data, apps, selectedAppId, onSelectApp, range, hidden, onHide }: Props) {
  // "All time" has no start, so nothing is "new" there.
  const showNew = !!range.start
  const isNew = (first: string | undefined) => !!first && !!range.start && first >= range.start && (!range.end || first <= range.end)
  const [focus, setFocus] = React.useState<string | null>(null)
  const visibleApps = apps.filter((a) => !a.hidden)
  const current = data ? (selectedAppId ? data.apps[selectedAppId] : data.all) : null
  const reached = current?.countries ?? {}
  const total = data?.total ?? TERRITORIES.length
  const count = current?.count ?? 0
  const pct = total ? (count / total) * 100 : 0
  const show = (item: ReachItem) => !hidden.includes(item)

  const points: MapPoint[] = React.useMemo(
    () =>
      TERRITORIES.map((t) => {
        const first = reached[t.code]
        return {
          code: t.code,
          value: first ? 1 : 0,
          label: "",
          color: !first ? NOT_REACHED : isNew(first) ? NEW : REACHED,
          weight: first ? 0.45 : 0.08,
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reached, range.start, range.end]
  )

  // Apps that reached each country, for the tooltip in the All Apps view.
  const appsIn = (code: string) => visibleApps.filter((a) => data?.apps[a.apple_id]?.countries[code])
  const missing = TERRITORIES.filter((t) => !reached[t.code]).sort((a, b) => a.name.localeCompare(b.name))
  const ranking = [...visibleApps].sort((a, b) => (data?.apps[b.apple_id]?.count ?? 0) - (data?.apps[a.apple_id]?.count ?? 0))

  return (
    <Section title="Global Reach" description="App Store storefronts with at least one download, all time." onHide={onHide}>
      {!data || !data.all.count ? (
        <EmptyState>No downloads yet. Reach appears once sales reports have synced.</EmptyState>
      ) : (
        <div className="space-y-5">
          {/* Headline for the selected app (or all apps together) */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-3xl font-semibold tabular-nums tracking-tight">{count}</span>
              <span className="text-sm text-muted-foreground">of {total} storefronts reached</span>
              <span className="text-sm font-medium tabular-nums">{pct.toFixed(0)}%</span>
              {showNew && current && current.newInRange > 0 && (
                <span className="text-sm text-emerald-600 dark:text-emerald-500">▲ {current.newInRange} new in this period</span>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-[hsl(var(--chart-1))] transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {(show("map") || show("apps")) && (
            <div className="flex flex-wrap gap-6">
              {show("map") && (
                <div className="min-w-0 flex-[3_1_360px] self-start">
                  <InteractiveMap
                    points={points}
                    focus={focus}
                    onFocus={setFocus}
                    renderTooltip={(code) => (
                      <ReachTooltip code={code} first={reached[code]} appsIn={selectedAppId ? null : appsIn(code)} appCount={visibleApps.length} />
                    )}
                  />
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <Legend color={REACHED} label="Reached" />
                    {showNew && <Legend color={NEW} label="New in this period" />}
                    <Legend color={NOT_REACHED} label="Not reached yet" />
                  </div>
                </div>
              )}

              {show("apps") && (
                <div className="min-w-0 flex-[1_1_260px] space-y-1">
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">By app</div>
                  <ReachRow
                    icon={<span className="flex h-6 w-6 items-center justify-center rounded-md border border-border"><LayoutGrid className="h-3.5 w-3.5" /></span>}
                    name="All Apps"
                    count={data.all.count}
                    total={total}
                    active={selectedAppId === null}
                    onClick={() => onSelectApp(null)}
                  />
                  {ranking.map((a) => (
                    <ReachRow
                      key={a.apple_id}
                      icon={
                        a.icon_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.icon_url} alt="" className="h-6 w-6 rounded-md border border-border" />
                        ) : (
                          <span className="h-6 w-6 rounded-md bg-muted" />
                        )
                      }
                      name={a.name.split(":")[0]}
                      count={data.apps[a.apple_id]?.count ?? 0}
                      total={total}
                      active={selectedAppId === a.apple_id}
                      onClick={() => onSelectApp(a.apple_id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {show("missing") && missing.length > 0 && (
            <details className="group rounded-md border border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  Not reached yet <span className="text-muted-foreground">({missing.length})</span>
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-sm">
                {missing.map((t) => (
                  <span
                    key={t.code}
                    className="flex min-w-0 cursor-default items-center gap-1.5 rounded px-1 hover:bg-accent"
                    onMouseEnter={() => setFocus(t.code)}
                    onMouseLeave={() => setFocus(null)}
                    title={t.name}
                  >
                    <span className="shrink-0">{countryToFlag(t.code)}</span>
                    <span className="truncate text-muted-foreground">{t.name}</span>
                  </span>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </Section>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function ReachRow({ icon, name, count, total, active, onClick }: { icon: React.ReactNode; name: string; count: number; total: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn("w-full space-y-1 rounded-md px-2 py-1.5 text-left transition-colors", active ? "bg-accent" : "hover:bg-accent/50")}
    >
      <div className="flex items-center gap-2 text-sm">
        {icon}
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="tabular-nums text-muted-foreground">
          <span className="font-medium text-foreground">{count}</span> / {total}
        </span>
      </div>
      <div className="ml-8 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-[hsl(var(--chart-1))]" style={{ width: `${(count / total) * 100}%` }} />
      </div>
    </button>
  )
}

function ReachTooltip({ code, first, appsIn, appCount }: { code: string; first?: string; appsIn: App[] | null; appCount: number }) {
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <span>{countryToFlag(code)}</span>
        {TERRITORY_BY_CODE[code]?.name ?? code}
      </div>
      {first ? (
        <div className="text-emerald-600 dark:text-emerald-500">Reached · first download {firstSeen(first)}</div>
      ) : (
        <div className="text-muted-foreground">Not reached yet</div>
      )}
      {appsIn && (
        <div className="space-y-1 border-t border-border pt-1.5">
          <div className="text-muted-foreground">
            {appsIn.length} of {appCount} apps
          </div>
          {appsIn.slice(0, 6).map((a) => (
            <div key={a.apple_id} className="flex items-center gap-1.5">
              {a.icon_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.icon_url} alt="" className="h-4 w-4 rounded" />
              )}
              <span className="truncate">{a.name.split(":")[0]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
