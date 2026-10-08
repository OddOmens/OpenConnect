"use client"

import * as React from "react"
import { Section, Segmented, Stars, EmptyState } from "./section"
import { Button } from "@/components/ui/button"
import { countryToFlag, territoryName } from "@/lib/territories"
import { fmtDate, fmtNumber } from "@/lib/format"
import type { App } from "./app-selector"

interface Review {
  id: string
  apple_id: string
  country_code: string
  rating: number
  title: string
  body: string
  reviewer: string
  created_date: string
  response_body: string | null
}

interface ReviewsResponse {
  items: Review[]
  total: number
  distribution: { rating: number; n: number }[]
  countries: { country_code: string; n: number }[]
}

export function ReviewsPanel({ appId, apps, refreshKey, onHide }: { appId: string | null; apps: App[]; refreshKey: number; onHide: () => void }) {
  const [rating, setRating] = React.useState("0")
  const [country, setCountry] = React.useState("")
  const [data, setData] = React.useState<ReviewsResponse | null>(null)
  const [limit, setLimit] = React.useState(10)

  React.useEffect(() => {
    const q = new URLSearchParams({ app: appId || "all", limit: String(limit) })
    if (rating !== "0") q.set("rating", rating)
    if (country) q.set("country", country)
    fetch(`/api/reviews?${q}`).then((r) => r.json()).then(setData).catch(() => setData(null))
  }, [appId, rating, country, limit, refreshKey])

  const dist = new Map((data?.distribution || []).map((d) => [d.rating, d.n]))
  const totalAll = [...dist.values()].reduce((a, b) => a + b, 0)

  return (
    <Section
      title="Customer Reviews"
      description={totalAll ? `${fmtNumber(totalAll)} written reviews` : undefined}
      onHide={onHide}
      actions={
        <>
          <Segmented
            value={rating}
            onChange={(v) => { setRating(v); setLimit(10) }}
            options={[{ value: "0", label: "All" }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n}★` }))]}
          />
          <select
            value={country}
            onChange={(e) => { setCountry(e.target.value); setLimit(10) }}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">All countries</option>
            {(data?.countries || []).map((c) => (
              <option key={c.country_code} value={c.country_code}>
                {countryToFlag(c.country_code)} {territoryName(c.country_code)} ({c.n})
              </option>
            ))}
          </select>
        </>
      }
    >
      {!data?.items.length ? (
        <EmptyState>{totalAll ? "No reviews match these filters." : "No reviews synced yet."}</EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[180px_1fr]">
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((n) => (
              <div key={n} className="flex items-center gap-2 text-xs">
                <span className="w-5 text-muted-foreground">{n}★</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-amber-400" style={{ width: `${totalAll ? ((dist.get(n) || 0) / totalAll) * 100 : 0}%` }} />
                </div>
                <span className="w-8 text-right tabular-nums text-muted-foreground">{dist.get(n) || 0}</span>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            {data.items.map((r) => (
              <div key={r.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <Stars value={r.rating} />
                  <span>{countryToFlag(r.country_code)} {territoryName(r.country_code)}</span>
                  <span>{fmtDate(r.created_date)}</span>
                  {!appId && <span>{apps.find((a) => a.apple_id === r.apple_id)?.name}</span>}
                  <span>by {r.reviewer}</span>
                </div>
                {r.title && <div className="mt-1.5 text-sm font-medium">{r.title}</div>}
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{r.body}</p>
                {r.response_body && (
                  <div className="mt-2 rounded-md border-l-2 border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Your response: </span>
                    {r.response_body}
                  </div>
                )}
              </div>
            ))}
            {data.total > data.items.length && (
              <Button variant="ghost" size="sm" onClick={() => setLimit(limit + 20)}>
                Show more ({fmtNumber(data.total - data.items.length)} remaining)
              </Button>
            )}
          </div>
        </div>
      )}
    </Section>
  )
}
