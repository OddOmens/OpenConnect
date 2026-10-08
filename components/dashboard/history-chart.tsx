"use client"

import * as React from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Section, Segmented, Toggle, EmptyState } from "./section"
import { Skeleton } from "@/components/ui/skeleton"
import { HISTORY_SERIES, HistorySeries, UiPrefs } from "@/lib/prefs"
import { fmtCompact, fmtDate, fmtMoney, fmtNumber } from "@/lib/format"

export interface HistoryPoint {
  date: string
  first_time: number
  redownloads: number
  updates: number
  iap: number
  proceeds: number
}

const COLORS: Record<HistorySeries, string> = {
  first_time: "hsl(var(--chart-1))",
  redownloads: "hsl(var(--chart-2))",
  updates: "hsl(var(--chart-3))",
  iap: "hsl(var(--chart-4))",
  proceeds: "hsl(var(--chart-5))",
}

interface Props {
  data: HistoryPoint[]
  isLoading: boolean
  hasMonthlyHistory: boolean
  prefs: UiPrefs
  onPrefs: (p: Partial<UiPrefs>) => void
  onHide: () => void
}

export function HistoryChart({ data, isLoading, hasMonthlyHistory, prefs, onPrefs, onHide }: Props) {
  const hidden = prefs.hiddenHistorySeries
  const series = (Object.keys(HISTORY_SERIES) as HistorySeries[]).filter((s) => !hidden.includes(s))
  const units = series.filter((s) => s !== "proceeds")
  const showProceeds = series.includes("proceeds")
  const toggle = (s: HistorySeries) =>
    onPrefs({ hiddenHistorySeries: hidden.includes(s) ? hidden.filter((x) => x !== s) : [...hidden, s] })

  const tickFormat = (d: string) =>
    fmtDate(d, prefs.granularity === "month" ? { month: "short", year: "2-digit" } : { month: "short", day: "numeric" })

  const Chart = prefs.chartType === "bar" ? BarChart : prefs.chartType === "line" ? LineChart : AreaChart
  const renderSeries = (key: HistorySeries, axis: string) => {
    const common = { key, dataKey: key, name: HISTORY_SERIES[key], yAxisId: axis, stroke: COLORS[key], isAnimationActive: false }
    const stack = axis === "units" ? "units" : undefined
    if (prefs.chartType === "bar") return <Bar {...common} fill={COLORS[key]} stackId={stack} radius={[2, 2, 0, 0]} />
    if (prefs.chartType === "line") return <Line {...common} type="monotone" dot={false} strokeWidth={2} />
    return <Area {...common} type="monotone" fill={COLORS[key]} fillOpacity={0.25} stackId={stack} strokeWidth={1.5} />
  }

  return (
    <Section
      title="History"
      description={
        hasMonthlyHistory && prefs.granularity !== "month"
          ? "Older history comes from monthly reports. Switch to Monthly to include it."
          : undefined
      }
      onHide={onHide}
      actions={
        <>
          <Segmented
            value={prefs.granularity}
            onChange={(granularity) => onPrefs({ granularity })}
            options={[
              { value: "day", label: "Daily" },
              { value: "week", label: "Weekly" },
              { value: "month", label: "Monthly" },
            ]}
          />
          <Segmented
            value={prefs.chartType}
            onChange={(chartType) => onPrefs({ chartType })}
            options={[
              { value: "area", label: "Area" },
              { value: "bar", label: "Bar" },
              { value: "line", label: "Line" },
            ]}
          />
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(HISTORY_SERIES) as HistorySeries[]).map((s) => (
          <Toggle key={s} active={!hidden.includes(s)} onClick={() => toggle(s)} color={COLORS[s]}>
            {HISTORY_SERIES[s]}
          </Toggle>
        ))}
      </div>
      {isLoading ? (
        <Skeleton className="h-[300px] w-full" />
      ) : !data.length ? (
        <EmptyState>No sales data in this range yet. Run a sync to pull reports from App Store Connect.</EmptyState>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <Chart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={tickFormat} minTickGap={24} />
              <YAxis yAxisId="units" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => fmtCompact(v)} width={40} hide={!units.length} />
              <YAxis yAxisId="money" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => fmtMoney(v, prefs.currency, true)} width={56} hide={!showProceeds} />
              <Tooltip
                cursor={{ fill: "hsl(var(--accent))", opacity: 0.4 }}
                contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))", marginBottom: 4 }}
                labelFormatter={(d) => fmtDate(String(d), prefs.granularity === "month" ? { month: "long", year: "numeric" } : undefined)}
                formatter={(v: number, name: string) => [name === HISTORY_SERIES.proceeds ? fmtMoney(v, prefs.currency) : fmtNumber(v), name]}
              />
              {units.map((s) => renderSeries(s, "units"))}
              {showProceeds && renderSeries("proceeds", "money")}
            </Chart>
          </ResponsiveContainer>
        </div>
      )}
    </Section>
  )
}
