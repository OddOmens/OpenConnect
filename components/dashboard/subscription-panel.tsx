"use client"

import * as React from "react"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts"
import { Section, EmptyState } from "./section"
import type { SubscriptionItem } from "@/lib/prefs"
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format"

export interface SubscriptionData {
  events: { event: string; count: number }[]
  active: {
    date: string
    standard: number
    trial: number
    intro: number
    promo: number
    billing_retry: number
    grace_period: number
    total: number
    proceeds: number
  } | null
  bySubscription: { name: string; active: number; trial: number }[]
  trend: { date: string; active: number; trial: number }[]
}

interface Props {
  data: SubscriptionData | null
  currency: string
  hidden: SubscriptionItem[]
  onHide: () => void
}

export function SubscriptionPanel({ data, currency, hidden, onHide }: Props) {
  const show = (item: SubscriptionItem) => !hidden.includes(item)
  const a = data?.active
  const hasData = !!a || !!data?.events.length
  const maxEvent = Math.max(1, ...(data?.events || []).map((e) => e.count))

  return (
    <Section
      title="Subscriptions"
      description={a ? `Active subscriptions as of ${fmtDate(a.date)}` : undefined}
      onHide={onHide}
    >
      {!hasData ? (
        <EmptyState>No subscription data. It appears once subscription reports sync (requires the Sales role on your API key).</EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {a && (
              <div className="grid grid-cols-3 gap-3">
                {show("active") && <Mini label="Active" value={fmtNumber(a.total)} />}
                {show("paying") && <Mini label="Paying" value={fmtNumber(a.standard)} />}
                {show("trials") && <Mini label="Free trials" value={fmtNumber(a.trial)} />}
                {show("intro") && <Mini label="Intro / promo" value={fmtNumber(a.intro + a.promo)} />}
                {show("billingRetry") && <Mini label="Billing retry" value={fmtNumber(a.billing_retry)} />}
                {show("proceeds") && <Mini label="Est. period proceeds" value={fmtMoney(a.proceeds, currency, true)} />}
              </div>
            )}
            {show("trend") && data!.trend.length > 1 && (
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data!.trend}>
                    <XAxis dataKey="date" hide />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      labelFormatter={(d) => fmtDate(String(d))}
                      formatter={(v: number, n: string) => [fmtNumber(v), n === "active" ? "Active" : "Trials"]}
                    />
                    <Area dataKey="active" type="monotone" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.2} isAnimationActive={false} />
                    <Area dataKey="trial" type="monotone" stroke="hsl(var(--chart-3))" fill="hsl(var(--chart-3))" fillOpacity={0.15} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            {show("bySubscription") && data!.bySubscription.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">By subscription</div>
                {data!.bySubscription.map((s) => (
                  <div key={s.name} className="flex justify-between text-sm">
                    <span className="truncate">{s.name}</span>
                    <span className="tabular-nums text-muted-foreground">{fmtNumber(s.active)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {show("events") && <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Events in this range</div>
            {!data!.events.length && <div className="text-sm text-muted-foreground">No events</div>}
            {data!.events.map((e) => (
              <div key={e.event} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="truncate">{e.event}</span>
                  <span className="tabular-nums">{fmtNumber(e.count)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={/cancel|refund|expire|billing/i.test(e.event) ? "h-full bg-red-500/70" : "h-full bg-[hsl(var(--chart-1))]"}
                    style={{ width: `${(e.count / maxEvent) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>}
        </div>
      )}
    </Section>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-base font-semibold tabular-nums">{value}</div>
    </div>
  )
}
