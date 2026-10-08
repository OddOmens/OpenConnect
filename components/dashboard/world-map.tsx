"use client"

import * as React from "react"
import DottedMap from "dotted-map"
import { TERRITORY_BY_CODE, countryToFlag } from "@/lib/territories"
import { Section, Segmented } from "./section"
import { UiPrefs } from "@/lib/prefs"
import { fmtMoney, fmtNumber } from "@/lib/format"

export interface SalesTerritory {
  country_code: string
  first_time: number
  redownloads: number
  updates: number
  iap: number
  proceeds: number
}

export interface StoreCountry {
  country_code: string
  available: boolean
  rating: number | null
  rating_count: number
  current_rating: number | null
  current_rating_count: number
  ranks: Record<string, { rank: number; apple_id: string; genre_id: string }>
}

type Metric = UiPrefs["mapMetric"]

function ratingColor(r: number) {
  // 1★ red → 5★ green
  const hue = Math.max(0, Math.min(120, ((r - 1) / 4) * 120))
  return `hsl(${hue}, 70%, 50%)`
}

interface Props {
  sales: SalesTerritory[]
  store: StoreCountry[]
  metric: Metric
  currency: string
  onMetric: (m: Metric) => void
  onHide: () => void
}

export function WorldMap({ sales, store, metric, currency, onMetric, onHide }: Props) {
  const points = React.useMemo(() => {
    const out: { code: string; value: number; label: string; color: string; weight: number }[] = []
    if (metric === "downloads" || metric === "proceeds") {
      const vals = sales.map((t) => ({
        code: t.country_code,
        value: metric === "downloads" ? t.first_time + t.redownloads : t.proceeds,
      }))
      const max = Math.max(1, ...vals.map((v) => v.value))
      for (const v of vals) {
        if (v.value <= 0) continue
        out.push({
          code: v.code,
          value: v.value,
          label: metric === "downloads" ? fmtNumber(v.value) : fmtMoney(v.value, currency),
          color: metric === "downloads" ? "#3b82f6" : "#ec4899",
          weight: Math.log10(v.value + 1) / Math.log10(max + 1),
        })
      }
    } else if (metric === "rating") {
      for (const c of store) {
        if (c.rating == null || !c.rating_count) continue
        out.push({ code: c.country_code, value: c.rating, label: `${c.rating.toFixed(2)}★ (${fmtNumber(c.rating_count)})`, color: ratingColor(c.rating), weight: Math.min(1, 0.35 + Math.log10(c.rating_count + 1) / 3) })
      }
    } else {
      for (const c of store) {
        const best = Math.min(...Object.values(c.ranks).map((r) => r.rank))
        if (!Number.isFinite(best)) continue
        out.push({ code: c.country_code, value: best, label: `#${best}`, color: "#f59e0b", weight: 1 - (best - 1) / 100 })
      }
    }
    return out.sort((a, b) => (metric === "rank" ? a.value - b.value : b.value - a.value))
  }, [sales, store, metric, currency])

  const svg = React.useMemo(() => {
    const map = new DottedMap({ height: 60, grid: "diagonal" })
    for (const p of points) {
      const t = TERRITORY_BY_CODE[p.code]
      if (!t) continue
      map.addPin({ lat: t.lat, lng: t.lng, svgOptions: { color: p.color, radius: 0.35 + p.weight * 0.85 } })
    }
    return map.getSVG({ radius: 0.22, color: "hsl(240 5% 26%)", shape: "circle", backgroundColor: "transparent" })
  }, [points])

  return (
    <Section
      title="World Map"
      onHide={onHide}
      actions={
        <Segmented
          value={metric}
          onChange={onMetric}
          options={[
            { value: "downloads", label: "Downloads" },
            { value: "proceeds", label: "Proceeds" },
            { value: "rating", label: "Rating" },
            { value: "rank", label: "Rank" },
          ]}
        />
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
        <div
          className="aspect-[2/1] w-full [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="space-y-1.5 text-sm">
          <div className="text-xs font-medium text-muted-foreground">
            {metric === "rank" ? "Best chart positions" : "Top storefronts"}
          </div>
          {points.length === 0 && <div className="text-xs text-muted-foreground">No data yet</div>}
          {points.slice(0, 8).map((p) => (
            <div key={p.code} className="flex items-center justify-between gap-2">
              <span className="truncate">
                <span className="mr-1.5">{countryToFlag(p.code)}</span>
                {TERRITORY_BY_CODE[p.code]?.name ?? p.code}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{p.label}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}
