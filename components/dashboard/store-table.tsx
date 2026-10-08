"use client"

import * as React from "react"
import { RefreshCw } from "lucide-react"
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Section, Segmented, Stars, EmptyState } from "./section"
import { ColumnPicker, SearchBox, SortHead, sortRows, useSort } from "./table-tools"
import type { StoreCountry } from "./world-map"
import type { App } from "./app-selector"
import { CHARTS, ChartId, STORE_COLUMNS, StoreColumn } from "@/lib/prefs"
import { TERRITORIES, countryToFlag } from "@/lib/territories"
import { fmtDate, fmtNumber, fmtRating } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface StoreData {
  summary: {
    rating: number | null
    rating_count: number
    storefronts: number
    rated_storefronts: number
    ranked_storefronts: number
    best_rank: number | null
    last_checked: string | null
    rankings_date: string | null
  }
  countries: StoreCountry[]
  ratingTrend: { date: string; count: number; avg: number | null }[]
}

type Filter = "all" | "available" | "rated" | "ranked"
type SortKey = "name" | "rating" | "rating_count" | "current_rating" | ChartId

interface Row {
  code: string
  name: string
  data: StoreCountry | null
}

function bestRank(c: StoreCountry | null, chart: ChartId) {
  if (!c) return null
  const cat = c.ranks[`${chart}:category`]?.rank
  const all = c.ranks[`${chart}:overall`]?.rank
  return cat ?? all ?? null
}

interface Props {
  data: StoreData | null
  apps: App[]
  selectedAppId: string | null
  hiddenColumns: StoreColumn[]
  onColumns: (hidden: StoreColumn[]) => void
  onHide: () => void
  onRefresh: () => void
  refreshing: boolean
}

export function StoreTable({ data, apps, selectedAppId, hiddenColumns, onColumns, onHide, onRefresh, refreshing }: Props) {
  const [filter, setFilter] = React.useState<Filter>("available")
  const [query, setQuery] = React.useState("")
  const sort = useSort<SortKey>("rating_count")
  const cols = (Object.keys(STORE_COLUMNS) as StoreColumn[]).filter((c) => !hiddenColumns.includes(c))
  const appName = (id: string) => apps.find((a) => a.apple_id === id)?.name.split(":")[0] ?? id
  const genreName = (genreId: string) =>
    genreId === "0" ? "All apps" : apps.find((a) => a.primary_genre_id === genreId)?.primary_genre ?? `Genre ${genreId}`

  const byCode = new Map((data?.countries || []).map((c) => [c.country_code, c]))
  const rows: Row[] = TERRITORIES.map((t) => ({ code: t.code, name: t.name, data: byCode.get(t.code) ?? null }))
  const filtered = rows.filter((r) => {
    if (query && !r.name.toLowerCase().includes(query.toLowerCase()) && r.code.toLowerCase() !== query.toLowerCase()) return false
    if (filter === "available") return r.data?.available
    if (filter === "rated") return (r.data?.rating_count ?? 0) > 0
    if (filter === "ranked") return r.data && Object.keys(r.data.ranks).length > 0
    return true
  })
  const sorted = sortRows(
    filtered,
    (r) => {
      switch (sort.key) {
        case "name": return r.name
        case "rating": return r.data?.rating ?? null
        case "rating_count": return r.data?.rating_count ?? null
        case "current_rating": return r.data?.current_rating ?? null
        default: {
          const rank = bestRank(r.data, sort.key)
          return rank == null ? null : -rank // so "desc" = best rank first
        }
      }
    },
    sort.dir
  )

  const s = data?.summary
  const neverChecked = !s?.last_checked

  const rankCell = (c: StoreCountry | null, chart: ChartId) => {
    const cat = c?.ranks[`${chart}:category`]
    const all = c?.ranks[`${chart}:overall`]
    if (!cat && !all) return <span className="text-muted-foreground">—</span>
    return (
      <div className="flex flex-col items-end leading-tight">
        {cat && (
          <span className="tabular-nums">
            <span className={cn("font-semibold", cat.rank <= 10 && "text-amber-400")}>#{cat.rank}</span>
            <span className="ml-1 text-[11px] text-muted-foreground">{genreName(cat.genre_id)}</span>
          </span>
        )}
        {all && (
          <span className="tabular-nums text-[11px] text-muted-foreground">
            #{all.rank} overall
          </span>
        )}
        {!selectedAppId && <span className="text-[10px] text-muted-foreground">{appName((cat || all)!.apple_id)}</span>}
      </div>
    )
  }

  return (
    <Section
      title="Ratings & Rankings"
      description={
        neverChecked
          ? "Ratings and top-chart positions in all 175 App Store storefronts."
          : `Ratings checked ${fmtDate(s!.last_checked)}${s!.rankings_date ? `, top 100 charts checked ${fmtDate(s!.rankings_date)}` : ""}`
      }
      onHide={onHide}
      actions={
        <>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "available", label: `Available${s ? ` ${s.storefronts}` : ""}` },
              { value: "rated", label: `Rated${s ? ` ${s.rated_storefronts}` : ""}` },
              { value: "ranked", label: `Ranked${s ? ` ${s.ranked_storefronts}` : ""}` },
              { value: "all", label: "All 175" },
            ]}
          />
          <SearchBox value={query} onChange={setQuery} placeholder="Find country" />
          <ColumnPicker columns={STORE_COLUMNS} hidden={hiddenColumns} onChange={onColumns} />
          <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            {refreshing ? "Checking…" : "Check now"}
          </Button>
        </>
      }
    >
      {neverChecked ? (
        <EmptyState>
          {refreshing
            ? "Checking every storefront. This takes about a minute."
            : "Not checked yet. Click “Check now” to look up ratings and chart positions in every storefront."}
        </EmptyState>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,1.5fr)]">
            <Stat label="Average rating"><Stars value={s!.rating} /></Stat>
            <Stat label="Total ratings">{fmtNumber(s!.rating_count)}</Stat>
            <Stat label="Available in">{s!.storefronts} storefronts</Stat>
            <Stat label="Charting in">{s!.ranked_storefronts} storefronts</Stat>
            <Stat label="Best position">{s!.best_rank ? `#${s!.best_rank}` : "—"}</Stat>
            {data!.ratingTrend.length > 1 && (
              <div className="col-span-2 sm:col-span-3 lg:col-span-1">
                <div className="text-xs text-muted-foreground">Ratings over time</div>
                <div className="h-10">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data!.ratingTrend}>
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                        labelFormatter={(_, p) => fmtDate(p?.[0]?.payload?.date)}
                        formatter={(v: number) => [fmtNumber(v), "Ratings"]}
                      />
                      <Area dataKey="count" type="monotone" stroke="hsl(var(--chart-3))" fill="hsl(var(--chart-3))" fillOpacity={0.2} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          <Table containerClassName="max-h-[520px] rounded-md border border-border">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <SortHead label="Storefront" active={sort.key === "name"} dir={sort.dir} onClick={() => sort.toggle("name", "asc")} />
                  {cols.includes("rating") && <SortHead label="Rating" active={sort.key === "rating"} dir={sort.dir} onClick={() => sort.toggle("rating")} />}
                  {cols.includes("rating_count") && <SortHead label="Ratings" className="text-right" active={sort.key === "rating_count"} dir={sort.dir} onClick={() => sort.toggle("rating_count")} />}
                  {cols.includes("current_rating") && <SortHead label="Current Version" active={sort.key === "current_rating"} dir={sort.dir} onClick={() => sort.toggle("current_rating")} />}
                  {(Object.keys(CHARTS) as ChartId[]).filter((c) => cols.includes(c)).map((c) => (
                    <SortHead key={c} label={CHARTS[c]} className="text-right" active={sort.key === c} dir={sort.dir} onClick={() => sort.toggle(c)} />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => (
                  <TableRow key={r.code} className={cn(!r.data?.available && "opacity-50")}>
                    <TableCell className="whitespace-nowrap font-medium">
                      <span className="mr-2">{countryToFlag(r.code)}</span>
                      {r.name}
                      {!r.data?.available && <span className="ml-2 text-[11px] font-normal text-muted-foreground">not available</span>}
                    </TableCell>
                    {cols.includes("rating") && <TableCell><Stars value={r.data?.rating_count ? r.data.rating : null} /></TableCell>}
                    {cols.includes("rating_count") && <TableCell className="text-right tabular-nums">{r.data ? fmtNumber(r.data.rating_count) : "—"}</TableCell>}
                    {cols.includes("current_rating") && (
                      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                        {r.data?.current_rating_count ? `${fmtRating(r.data.current_rating)} (${fmtNumber(r.data.current_rating_count)})` : "—"}
                      </TableCell>
                    )}
                    {(Object.keys(CHARTS) as ChartId[]).filter((c) => cols.includes(c)).map((c) => (
                      <TableCell key={c} className="text-right">{rankCell(r.data, c)}</TableCell>
                    ))}
                  </TableRow>
                ))}
                {!sorted.length && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                      No storefronts match.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Rankings come from Apple&apos;s public top-100 charts for each storefront: each app&apos;s own category plus the overall chart. “—” means not in the top 100.
          </p>
        </>
      )}
    </Section>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold tabular-nums">{children}</div>
    </div>
  )
}
