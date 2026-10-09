"use client"

import * as React from "react"
import { Section, Segmented, EmptyState } from "./section"
import { fmtMoney, fmtNumber } from "@/lib/format"
import { BREAKDOWN_TABS, BreakdownTab } from "@/lib/prefs"

export interface BreakdownData {
  products: { id: string; title: string; category: string; product_type: string; units: number; proceeds: number }[]
  devices: { label: string; units: number }[]
  versions: { label: string; updates: number; installs: number }[]
  prices: { currency: string; price: number; units: number }[]
}

type Tab = BreakdownTab

interface Props {
  data: BreakdownData | null
  currency: string
  hidden: BreakdownTab[]
  onHide: () => void
}

export function Breakdowns({ data, currency, hidden, onHide }: Props) {
  const tabs = (Object.keys(BREAKDOWN_TABS) as Tab[]).filter((t) => !hidden.includes(t))
  const [picked, setTab] = React.useState<Tab>(tabs[0] ?? "devices")
  // If the open tab gets hidden in Settings → Customize, fall back to the first one still shown.
  const tab = tabs.includes(picked) ? picked : tabs[0]

  const rows: { label: string; sub?: string; value: number; display: string; extra?: string }[] = React.useMemo(() => {
    if (!data || !tab) return []
    switch (tab) {
      case "products":
        return data.products.map((p) => ({
          label: p.title || p.id,
          sub: p.category === "iap" ? `In-app purchase · ${p.product_type}` : p.category === "download" ? "App" : p.product_type,
          value: p.proceeds || p.units,
          display: fmtMoney(p.proceeds, currency),
          extra: `${fmtNumber(p.units)} units`,
        }))
      case "devices":
        return data.devices.map((d) => ({ label: d.label, value: d.units, display: fmtNumber(d.units) }))
      case "versions":
        return data.versions.map((v) => ({
          label: `v${v.label}`,
          value: v.updates + v.installs,
          display: fmtNumber(v.updates),
          extra: `${fmtNumber(v.installs)} installs`,
        }))
      case "prices":
        return data.prices.map((p) => ({ label: fmtMoney(p.price, p.currency), sub: p.currency, value: p.units, display: `${fmtNumber(p.units)} units` }))
    }
  }, [data, tab, currency])
  const max = Math.max(1, ...rows.map((r) => r.value))

  return (
    <Section
      // With a single breakdown left, it names the section and the tab switcher goes away.
      title={tabs.length === 1 ? BREAKDOWN_TABS[tabs[0]] : "Breakdowns"}
      onHide={onHide}
      actions={
        tabs.length > 1 && (
          <Segmented value={tab} onChange={setTab} options={tabs.map((t) => ({ value: t, label: BREAKDOWN_TABS[t] }))} />
        )
      }
    >
      {!tab ? (
        <EmptyState>Every breakdown is hidden. Turn them back on in Settings → Customize.</EmptyState>
      ) : !rows.length ? (
        <EmptyState>Nothing to break down in this range.</EmptyState>
      ) : (
        <div className="space-y-3">
          {tab === "versions" && <div className="text-xs text-muted-foreground">Updates per version (most recent first)</div>}
          {rows.map((r, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {r.label}
                  {r.sub && <span className="ml-2 text-xs text-muted-foreground">{r.sub}</span>}
                </span>
                <span className="shrink-0 tabular-nums">
                  {r.display}
                  {r.extra && <span className="ml-2 text-xs text-muted-foreground">{r.extra}</span>}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-[hsl(var(--chart-2))]" style={{ width: `${(r.value / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}
