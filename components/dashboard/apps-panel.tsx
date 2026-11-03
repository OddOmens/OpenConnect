"use client"

import * as React from "react"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Section, EmptyState } from "./section"
import { ColumnPicker, SortHead, sortRows, useSort } from "./table-tools"
import type { App } from "./app-selector"
import { APP_COLUMNS, AppColumn } from "@/lib/prefs"
import { fmtDate, fmtMoney, fmtNumber, pctChange } from "@/lib/format"
import { cn } from "@/lib/utils"

type Totals = { first_time: number; redownloads: number; updates: number; iap: number; proceeds: number; impressions: number; page_views: number }
type Metric = keyof Totals

export interface AppTotalsData {
  current: Record<string, Totals>
  previous: Record<string, Totals> | null
}

const ZERO: Totals = { first_time: 0, redownloads: 0, updates: 0, iap: 0, proceeds: 0, impressions: 0, page_views: 0 }
const METRICS: Metric[] = ["first_time", "redownloads", "updates", "iap", "proceeds", "impressions", "page_views"]

type SortKey = "name" | AppColumn

interface Props {
  data: AppTotalsData | null
  apps: App[]
  selectedAppId: string | null
  onSelectApp: (id: string | null) => void
  /** The day shown, when the range is a single day. */
  day: string | null
  currency: string
  hiddenColumns: AppColumn[]
  onColumns: (hidden: AppColumn[]) => void
  onHide: () => void
}

/** Every visible app's numbers side by side, for one day or the whole range. Click a row to open that app. */
export function AppsPanel({ data, apps, selectedAppId, onSelectApp, day, currency, hiddenColumns, onColumns, onHide }: Props) {
  const sort = useSort<SortKey>("first_time")
  const cols = (Object.keys(APP_COLUMNS) as AppColumn[]).filter((c) => !hiddenColumns.includes(c) && (c !== "change" || data?.previous))
  const visibleApps = apps.filter((a) => !a.hidden)
  const now = (id: string) => data?.current[id] ?? ZERO
  const before = (id: string) => data?.previous?.[id] ?? ZERO
  const change = (id: string) => (data?.previous ? pctChange(now(id).first_time, before(id).first_time) : null)

  const rows = sortRows(
    visibleApps,
    (a) => (sort.key === "name" ? a.name : sort.key === "change" ? change(a.apple_id) : now(a.apple_id)[sort.key]),
    sort.dir
  )
  const sum = (m: Metric, of: (id: string) => Totals) => visibleApps.reduce((n, a) => n + of(a.apple_id)[m], 0)
  const total = Object.fromEntries(METRICS.map((m) => [m, sum(m, now)])) as Totals
  const totalChange = data?.previous ? pctChange(total.first_time, sum("first_time", before)) : null

  const value = (t: Totals, c: Metric) => (c === "proceeds" ? fmtMoney(t[c], currency) : fmtNumber(t[c]))
  const Change = ({ pct, now, before }: { pct: number | null; now: number; before: number }) => {
    // A % change from 0 doesn't exist: show the increase itself instead.
    if (pct == null) return before === 0 && now > 0 ? <span className="text-emerald-600 dark:text-emerald-400">+{fmtNumber(now)}</span> : <span className="text-muted-foreground">—</span>
    return (
      <span className={pct > 0 ? "text-emerald-600 dark:text-emerald-400" : pct < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>
        {pct > 0 ? "▲" : pct < 0 ? "▼" : "•"} {Math.abs(pct).toFixed(0)}%
      </span>
    )
  }

  const description = day
    ? `Each app on ${fmtDate(day, { weekday: "long", month: "long", day: "numeric" })}${data?.previous ? ", vs prev. compares first-time downloads with the day before" : ""}.`
    : `Each app in this range${data?.previous ? ", vs prev. compares first-time downloads with the period before" : ""}.`

  return (
    <Section title="Apps" description={description} onHide={onHide} actions={<ColumnPicker columns={APP_COLUMNS} hidden={hiddenColumns} onChange={onColumns} />}>
      {!visibleApps.length ? (
        <EmptyState>No apps yet. Run a sync to pull them from App Store Connect.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead label="App" active={sort.key === "name"} dir={sort.dir} onClick={() => sort.toggle("name", "asc")} />
              {cols.map((c) => (
                <SortHead key={c} label={APP_COLUMNS[c]} className="text-right" active={sort.key === c} dir={sort.dir} onClick={() => sort.toggle(c)} />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => {
              const t = now(a.apple_id)
              const selected = a.apple_id === selectedAppId
              return (
                <TableRow
                  key={a.apple_id}
                  onClick={() => onSelectApp(selected ? null : a.apple_id)}
                  className={cn("cursor-pointer", selected && "bg-accent/60")}
                  title={selected ? "Back to All Apps" : `Open ${a.name}`}
                >
                  <TableCell className="max-w-[220px]">
                    <div className="flex items-center gap-2.5">
                      {a.icon_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.icon_url} alt="" loading="lazy" className="h-6 w-6 shrink-0 rounded-[7px] border border-border" />
                      ) : (
                        <div className="h-6 w-6 shrink-0 rounded-[7px] bg-muted" />
                      )}
                      <span className="truncate font-medium">{a.name}</span>
                    </div>
                  </TableCell>
                  {cols.map((c) => (
                    <TableCell key={c} className={cn("whitespace-nowrap text-right tabular-nums", c !== "change" && !t[c as Metric] && "text-muted-foreground")}>
                      {c === "change" ? <Change pct={change(a.apple_id)} now={t.first_time} before={before(a.apple_id).first_time} /> : value(t, c)}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
          {visibleApps.length > 1 && (
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">All apps</TableCell>
                {cols.map((c) => (
                  <TableCell key={c} className="whitespace-nowrap text-right font-medium tabular-nums">
                    {c === "change" ? <Change pct={totalChange} now={total.first_time} before={sum("first_time", before)} /> : value(total, c)}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      )}
    </Section>
  )
}
