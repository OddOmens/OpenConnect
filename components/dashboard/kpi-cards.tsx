"use client"

import * as React from "react"
import { Download, RefreshCw, ArrowUpCircle, ShoppingBag, DollarSign, Users, Star, MessageSquare, Globe, Trophy, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { KPIS, KpiId } from "@/lib/prefs"
import { fmtMoney, fmtNumber, fmtRating, pctChange } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface KpiData {
  totals: { first_time: number; redownloads: number; updates: number; iap: number; proceeds: number } | null
  previous: { first_time: number; redownloads: number; updates: number; iap: number; proceeds: number } | null
  activeSubs: number | null
  store: { rating: number | null; rating_count: number; storefronts: number; best_rank: number | null } | null
}

const ICONS: Record<KpiId, React.ElementType> = {
  downloads: Download,
  redownloads: RefreshCw,
  updates: ArrowUpCircle,
  iap: ShoppingBag,
  proceeds: DollarSign,
  activeSubs: Users,
  rating: Star,
  ratingCount: MessageSquare,
  countries: Globe,
  bestRank: Trophy,
}

interface KPICardsProps {
  data: KpiData
  currency: string
  hidden: KpiId[]
  onHide: (id: KpiId) => void
}

export function KPICards({ data, currency, hidden, onHide }: KPICardsProps) {
  const t = data.totals
  const p = data.previous
  const values: Record<KpiId, { value: string; change: number | null; hint?: string }> = {
    downloads: { value: fmtNumber(t?.first_time), change: t ? pctChange(t.first_time, p?.first_time) : null },
    redownloads: { value: fmtNumber(t?.redownloads), change: t ? pctChange(t.redownloads, p?.redownloads) : null },
    updates: { value: fmtNumber(t?.updates), change: t ? pctChange(t.updates, p?.updates) : null },
    iap: { value: fmtNumber(t?.iap), change: t ? pctChange(t.iap, p?.iap) : null },
    proceeds: { value: fmtMoney(t?.proceeds, currency), change: t ? pctChange(t.proceeds, p?.proceeds) : null },
    activeSubs: { value: data.activeSubs == null ? "—" : fmtNumber(data.activeSubs), change: null, hint: "Latest snapshot" },
    rating: { value: fmtRating(data.store?.rating), change: null, hint: "Weighted, all storefronts" },
    ratingCount: { value: fmtNumber(data.store?.rating_count), change: null, hint: "All storefronts" },
    countries: { value: data.store ? `${data.store.storefronts}` : "—", change: null, hint: "of 175" },
    bestRank: { value: data.store?.best_rank ? `#${data.store.best_rank}` : "—", change: null, hint: "Any chart, any country" },
  }

  const visible = (Object.keys(KPIS) as KpiId[]).filter((id) => !hidden.includes(id))
  if (!visible.length) return null

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
