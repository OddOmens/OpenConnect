"use client"

import * as React from "react"
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Flag, TrendingDown, TrendingUp } from "lucide-react"
import { Section, Segmented, EmptyState } from "./section"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { fmtCompact, fmtDate, fmtMoney, fmtNumber } from "@/lib/format"
import type { Forecast, ForecastMetric, MetricForecast } from "@/lib/forecast"
import type { UiPrefs } from "@/lib/prefs"

type Horizon = UiPrefs["forecast"]["horizon"]

const HORIZONS: { value: `${Horizon}`; label: string }[] = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "12 months" },
]

const METRICS: ForecastMetric[] = ["first_time", "impressions", "page_views", "proceeds"]

const COLORS: Record<ForecastMetric, string> = {
  first_time: "hsl(var(--chart-1))",
  impressions: "hsl(190 80% 50%)",
  page_views: "hsl(25 90% 55%)",
  proceeds: "hsl(var(--chart-5))",
}

const pct = (n: number | null | undefined, digits = 2) => (n == null ? "—" : `${(n * 100).toFixed(digits)}%`)

interface ChartPoint { date: string; actual?: number; projected?: number; band?: [number, number] }

/**
 * Daily points, or weekly sums for the 12-month view so the line reads as a trend, not noise. Weeks
 * end on the last actual day and start on the first projected one, so none straddles the two.
 */
function chartPoints(m: MetricForecast, weekly: boolean): ChartPoint[] {
  const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  let history = m.history.map((p) => ({ date: p.date, value: p.value }))
  let daily = m.daily.map((p) => ({ date: p.date, value: p.value, low: p.low, high: p.high }))
  if (weekly) {
    const weeks = <T,>(xs: T[], fromEnd: boolean) => {
      const out: T[][] = []
      const start = fromEnd ? xs.length % 7 : 0
      for (let i = start; i + 7 <= xs.length; i += 7) out.push(xs.slice(i, i + 7))
      return out
    }
    history = weeks(history, true).map((w) => ({ date: w[0].date, value: total(w.map((p) => p.value)) }))
    // Summing each day's range overstates the week's a little: better too wide than too sure.
    daily = weeks(daily, false).map((w) => ({ date: w[0].date, value: total(w.map((p) => p.value)), low: total(w.map((p) => p.low)), high: total(w.map((p) => p.high)) }))
  }
  const points: ChartPoint[] = [
    ...history.map((p) => ({ date: p.date, actual: p.value })),
    ...daily.map((p) => ({ date: p.date, projected: p.value, band: [p.low, p.high] as [number, number] })),
  ]
  // The projection starts where the history ends, so the two lines meet.
  const last = history[history.length - 1]
  if (last && daily.length) points[history.length - 1] = { ...points[history.length - 1], projected: last.value, band: [last.value, last.value] }
  return points
}

interface Props {
  appId: string | null
  currency: string
  prefs: UiPrefs["forecast"]
  onPrefs: (p: UiPrefs["forecast"]) => void
  refreshKey: number
  onHide: () => void
}

export function ForecastPanel({ appId, currency, prefs, onPrefs, refreshKey, onHide }: Props) {
  // The response and the query it answers; while a new one loads, the last one stays up.
  const query = `app=${appId || "all"}&horizon=${prefs.horizon}&currency=${currency}`
  const [result, setResult] = React.useState<{ query: string; data: Forecast | null } | null>(null)
  // What-if: more impressions, and a different conversion rate (null = the recent one).
  // The dashboard remounts this panel for another app, which resets them.
  const [lift, setLift] = React.useState(0)
  const [conversion, setConversion] = React.useState<number | null>(null)

  React.useEffect(() => {
    let live = true
    fetch(`/api/forecast?${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((data) => live && setResult({ query, data }))
    return () => {
      live = false
    }
  }, [query, refreshKey])
  const data = result?.data ?? null

  const money = prefs.metric === "proceeds"
  const fmt = (n: number, compact = false) => (money ? fmtMoney(n, currency, compact) : compact ? fmtCompact(n) : fmtNumber(Math.round(n)))
  const selected = data?.metrics[prefs.metric]
  const last = data ? METRICS.map((k) => data.metrics[k].lastActual).filter(Boolean).sort().pop() : null

  return (
    <Section
      title="Projections"
      description={
        last
          ? `Where the last six months of daily reports point, through ${fmtDate(last)}. Ranges are rough 80% ranges.`
          : "Where your numbers are heading, from the daily reports."
      }
      onHide={onHide}
      actions={
        <Segmented
          value={String(prefs.horizon) as `${Horizon}`}
          onChange={(v) => onPrefs({ ...prefs, horizon: Number(v) as Horizon })}
          options={HORIZONS}
        />
      }
    >
      {!result ? (
        <Skeleton className="h-[420px] w-full" />
      ) : !data ? (
        <EmptyState>Projections aren&apos;t available right now.</EmptyState>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {METRICS.map((k) => (
              <MetricTile key={k} m={data.metrics[k]} active={prefs.metric === k} currency={currency} color={COLORS[k]} onClick={() => onPrefs({ ...prefs, metric: k })} />
            ))}
          </div>

          {selected && !selected.unavailable ? (
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartPoints(selected, prefs.horizon === 365)} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(d) => fmtDate(d, { month: "short", day: "numeric" })} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={money ? 56 : 40} tickFormatter={(v) => fmt(v, true)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "hsl(var(--foreground))", marginBottom: 4 }}
                    labelFormatter={(d) => (prefs.horizon === 365 ? `Week of ${fmtDate(String(d))}` : fmtDate(String(d)))}
                    formatter={(v: number | [number, number], name: string) => [Array.isArray(v) ? `${fmt(v[0])} – ${fmt(v[1])}` : fmt(v), name]}
                  />
                  <Area dataKey="band" name="Likely range" stroke="none" fill={COLORS[prefs.metric]} fillOpacity={0.15} isAnimationActive={false} />
                  <Line dataKey="actual" name="Actual" stroke={COLORS[prefs.metric]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line dataKey="projected" name="Projected" stroke={COLORS[prefs.metric]} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState>{selected?.unavailable}</EmptyState>
          )}

          {data.milestone?.date && (
            <p className="flex items-center gap-2 text-sm">
              <Flag className="h-4 w-4 shrink-0 text-amber-500" />
              <span>
                At this pace you pass <b>{fmtNumber(data.milestone.next)}</b> first-time downloads around{" "}
                <b>{fmtDate(data.milestone.date)}</b> ({data.milestone.days} days), from {fmtNumber(data.milestone.downloads)} now.
              </span>
            </p>
          )}

          <WhatIf data={data} currency={currency} lift={lift} setLift={setLift} conversion={conversion} setConversion={setConversion} />
        </div>
      )}
    </Section>
  )
}

function MetricTile({ m, active, currency, color, onClick }: { m: MetricForecast; active: boolean; currency: string; color: string; onClick: () => void }) {
  const money = m.metric === "proceeds"
  // One style for the total and its range: compact once the range reaches five figures.
  const compact = m.high >= 10000
  const fmt = (n: number) => (money ? fmtMoney(n, currency, compact) : compact ? fmtCompact(n) : fmtNumber(Math.round(n)))
  const change = !m.unavailable && m.recentDaily > 0 ? (m.projectedDaily / m.recentDaily - 1) * 100 : null
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors",
        active ? "border-foreground/30 bg-accent" : "border-border hover:bg-accent/50"
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {m.label}
      </div>
      {m.unavailable ? (
        <div className="mt-2 text-xs text-muted-foreground">{m.unavailable}</div>
      ) : (
        <>
          <div className="mt-1 text-xl font-semibold tabular-nums">{fmt(m.total)}</div>
          <div className="text-xs tabular-nums text-muted-foreground">{fmt(m.low)} – {fmt(m.high)}</div>
          {change != null && (
            <div className={cn("mt-1 flex items-center gap-1 text-xs tabular-nums", Math.abs(change) < 1 ? "text-muted-foreground" : change > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
              {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {change >= 0 ? "+" : ""}{change.toFixed(0)}% vs the last 28 days&apos; pace
            </div>
          )}
        </>
      )}
    </button>
  )
}

interface WhatIfProps {
  data: Forecast
  currency: string
  lift: number
  setLift: (n: number) => void
  conversion: number | null
  setConversion: (n: number | null) => void
}

/** Impressions → page views → downloads now, and what more impressions or a better conversion would add. */
function WhatIf({ data, currency, lift, setLift, conversion, setConversion }: WhatIfProps) {
  const f = data.funnel
  const impressions = data.metrics.impressions
  const downloads = data.metrics.first_time
  if (!f?.conversion || impressions.unavailable || downloads.unavailable) {
    return data.notes.length ? <p className="text-xs text-muted-foreground">{data.notes.join(" ")}</p> : null
  }
  const conv = conversion ?? f.conversion
  const maxConv = Math.max(f.conversion * 2, (f.bestConversion ?? 0) * 1.25)
  const extra = impressions.total * ((1 + lift / 100) * conv - f.conversion)
  const total = downloads.total + extra
  const proceeds = f.proceedsPerDownload == null ? null : extra * f.proceedsPerDownload

  return (
    <div className="grid gap-4 rounded-lg border border-border p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-2">
        <div className="text-sm font-medium">Funnel, {fmtDate(f.from, { month: "short", day: "numeric" })} – {fmtDate(f.to, { month: "short", day: "numeric" })}</div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Impressions", fmtCompact(f.impressions), ""],
            ["Page views", fmtCompact(f.pageViews), `${pct(f.pageViewRate, 1)} of impressions`],
            ["Downloads", fmtCompact(f.downloads), `${pct(f.downloadsPerView, 1)} of page views`],
          ].map(([label, value, hint]) => (
            <div key={label} className="rounded-md bg-muted/50 px-2 py-2">
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="text-base font-semibold tabular-nums">{value}</dd>
              {hint && <dd className="text-[11px] text-muted-foreground">{hint}</dd>}
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          Conversion: <b className="text-foreground">{pct(f.conversion)}</b> of impressions became a first-time download
          {f.bestConversion && f.bestConversionPeriod ? (
            <>
              ; your best 28 days were <b className="text-foreground">{pct(f.bestConversion)}</b> ({fmtDate(f.bestConversionPeriod.from, { month: "short", day: "numeric" })} – {fmtDate(f.bestConversionPeriod.to, { month: "short", day: "numeric", year: "numeric" })})
            </>
          ) : null}
          .
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-medium">What could you get in the {data.horizonLabel.toLowerCase()}?</div>
        <label className="block text-xs">
          <span className="flex justify-between text-muted-foreground">
            <span>More impressions (ads, featuring, better keywords)</span>
            <span className="tabular-nums text-foreground">+{lift}%</span>
          </span>
          <input type="range" min={0} max={200} step={5} value={lift} onChange={(e) => setLift(Number(e.target.value))} className="w-full accent-primary" />
        </label>
        <label className="block text-xs">
          <span className="flex justify-between text-muted-foreground">
            <span>Conversion (screenshots, product page, ratings)</span>
            <span className="tabular-nums text-foreground">{pct(conv)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={maxConv}
            step={maxConv / 200}
            value={conv}
            onChange={(e) => setConversion(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {data.scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                const m = s.id.match(/impressions_(\d+)/)
                setLift(m ? Number(m[1]) : 0)
                setConversion(s.id.includes("best_conversion") ? f.bestConversion : null)
              }}
              className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {s.label}
            </button>
          ))}
          {(lift !== 0 || conversion != null) && (
            <button onClick={() => { setLift(0); setConversion(null) }} className="rounded-full px-2.5 py-0.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
              Reset
            </button>
          )}
        </div>
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <div className="text-xl font-semibold tabular-nums">
            ≈ {fmtNumber(Math.round(Math.max(0, total)))} <span className="text-sm font-normal text-muted-foreground">first-time downloads</span>
          </div>
          <div className="text-xs tabular-nums text-muted-foreground">
            {Math.round(extra) === 0 ? (
              "The projection as it stands. Move a slider or pick a scenario."
            ) : (
              <>
                {extra >= 0 ? "+" : "−"}{fmtNumber(Math.abs(Math.round(extra)))} vs the projection
                {proceeds != null && <> · {extra >= 0 ? "+" : "−"}{fmtMoney(Math.abs(proceeds), currency)} at your recent {fmtMoney(f.proceedsPerDownload!, currency)} per download</>}
              </>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Assumes the extra impressions convert like today&apos;s. Downloads that don&apos;t come from an App Store impression (links, the web) are in the projection but don&apos;t grow with it.
        </p>
      </div>
    </div>
  )
}
