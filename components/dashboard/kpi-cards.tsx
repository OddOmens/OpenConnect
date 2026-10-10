"use client"

import * as React from "react"
import { MapPinned, Download, RefreshCw, ArrowUpCircle, ShoppingBag, DollarSign, Eye, MousePointerClick, Users, Star, MessageSquare, Globe, Trophy, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { KPIS, KpiId } from "@/lib/prefs"
import { fmtMoney, fmtNumber, fmtRating, pctChange } from "@/lib/format"
import { cn } from "@/lib/utils"

type Totals = { first_time: number; redownloads: number; updates: number; iap: number; proceeds: number; impressions: number; page_views: number }

export interface KpiData {
  totals: Totals | null
  previous: Totals | null
  activeSubs: number | null
  engagementPending: boolean
  reach: { count: number; newInRange: number } | null
  reachTotal: number
  store: { rating: number | null; rating_count: number; storefronts: number; best_rank: number | null } | null
}

const ICONS: Record<KpiId, React.ElementType> = {
  downloads: Download,
  redownloads: RefreshCw,
  updates: ArrowUpCircle,
  iap: ShoppingBag,
  proceeds: DollarSign,
  impressions: Eye,
  pageViews: MousePointerClick,
  activeSubs: Users,
  rating: Star,
  ratingCount: MessageSquare,
  countries: Globe,
  reach: MapPinned,
  bestRank: Trophy,
}

interface KPICardsProps {
  data: KpiData
  currency: string
  hidden: KpiId[]
  order: KpiId[]
  columns: 3 | 4 | 5 | 6
  onHide: (id: KpiId) => void
}

// Literal class names so Tailwind keeps them.
export const KPI_COLUMNS = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" } as const

export function KPICards({ data, currency, hidden, order, columns, onHide }: KPICardsProps) {
  const t = data.totals
  const p = data.previous
  // A % change from 0 doesn't exist: show the increase itself instead ("+12 from 0").
  const vs = (now: number | undefined, before: number | undefined, fmt: (n: number) => string = fmtNumber) => {
    if (now == null) return { change: null }
    const change = pctChange(now, before)
    return change == null && before === 0 && now > 0 ? { change, delta: fmt(now) } : { change }
  }
  const values: Record<KpiId, { value: string; change: number | null; delta?: string; up?: string; hint?: string }> = {
    downloads: { value: fmtNumber(t?.first_time), ...vs(t?.first_time, p?.first_time) },
    redownloads: { value: fmtNumber(t?.redownloads), ...vs(t?.redownloads, p?.redownloads) },
    updates: { value: fmtNumber(t?.updates), ...vs(t?.updates, p?.updates) },
    iap: { value: fmtNumber(t?.iap), ...vs(t?.iap, p?.iap) },
    proceeds: { value: fmtMoney(t?.proceeds, currency), ...vs(t?.proceeds, p?.proceeds, (n) => fmtMoney(n, currency)) },
    impressions: data.engagementPending
      ? { value: "—", change: null, hint: "Apple is preparing (1–2 days)" }
      : { value: fmtNumber(t?.impressions), ...vs(t?.impressions, p?.impressions) },
    pageViews: data.engagementPending
      ? { value: "—", change: null, hint: "Apple is preparing (1–2 days)" }
      : { value: fmtNumber(t?.page_views), ...vs(t?.page_views, p?.page_views) },
    activeSubs: { value: data.activeSubs == null ? "—" : fmtNumber(data.activeSubs), change: null, hint: "Latest snapshot" },
    rating: { value: fmtRating(data.store?.rating), change: null, hint: "Weighted, all storefronts" },
    ratingCount: { value: fmtNumber(data.store?.rating_count), change: null, hint: "All storefronts" },
    countries: { value: data.store ? `${data.store.storefronts}` : "—", change: null, hint: "of 175" },
    reach: data.reach
      ? data.reach.newInRange > 0
        ? { value: `${data.reach.count} of ${data.reachTotal}`, change: null, up: `${data.reach.newInRange} new this period` }
        : { value: `${data.reach.count} of ${data.reachTotal}`, change: null, hint: "Storefronts with downloads" }
      : { value: "—", change: null },
    bestRank: { value: data.store?.best_rank ? `#${data.store.best_rank}` : "—", change: null, hint: "Any chart, any country" },
  }

  const visible = order.filter((id) => id in KPIS && !hidden.includes(id))
  if (!visible.length) return null

  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", KPI_COLUMNS[columns] ?? KPI_COLUMNS[4])}>
      {visible.map((id) => {
        const Icon = ICONS[id]
        const v = values[id]
        return (
          <Card key={id} className="group relative p-4">
            <button
              onClick={() => onHide(id)}
              title="Hide this metric"
              className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              <span className="truncate">{KPIS[id]}</span>
            </div>
            <div className="mt-2 truncate text-2xl font-semibold tabular-nums tracking-tight">{v.value}</div>
            <div className="mt-1 h-4 text-xs">
              {v.change != null ? (
                <span className={cn("tabular-nums", v.change > 0 ? "text-emerald-500" : v.change < 0 ? "text-red-500" : "text-muted-foreground")}>
                  {v.change > 0 ? "▲" : v.change < 0 ? "▼" : "•"} {Math.abs(v.change).toFixed(1)}%
                  <span className="ml-1 text-muted-foreground">vs prev.</span>
                </span>
              ) : v.up ? (
                <span className="text-emerald-600 dark:text-emerald-500">▲ {v.up}</span>
              ) : v.delta != null ? (
                <span className="tabular-nums text-emerald-500">
                  ▲ +{v.delta}
                  <span className="ml-1 text-muted-foreground">from 0</span>
                </span>
              ) : (
                v.hint && <span className="text-muted-foreground">{v.hint}</span>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
