'use client'

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Section, Segmented, EmptyState } from '@/components/dashboard/section'
import { cn } from '@/lib/utils'
import { fmtCompact, fmtDate, fmtNumber } from '@/lib/format'
import { countryToFlag } from '@/lib/territories'
import type { AsoOverview, FunnelCounts } from '@/lib/aso'
import { pct, type Days } from './aso-view'

const SOURCE_LABEL: Record<string, string> = {
  'App Store search': 'Search',
  'App Store browse': 'Browse (Today, charts, categories)',
  'App referrer': 'Other apps',
  'Web referrer': 'Websites',
  Unavailable: 'Unknown',
}

function Change({ now, then }: { now: number | null; then: number | null }) {
  if (now == null || then == null || then === 0) return <span className="text-muted-foreground">—</span>
  const c = (now - then) / then
  if (Math.abs(c) < 0.005) return <span className="text-muted-foreground">0%</span>
  return <span className={cn('tabular-nums', c > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{c > 0 ? '+' : ''}{(c * 100).toFixed(0)}%</span>
}

const rate = (c: FunnelCounts | null | undefined) => (c && c.impressions ? c.gets / c.impressions : null)

export function FunnelPanel({ overview: o, days, onDays }: { overview: AsoOverview; days: Days; onDays: (d: Days) => void }) {
  const f = o.funnel
  const weekly = f.weekly.map((w) => ({
    ...w,
    conversion: w.search_impressions ? (w.search_gets / w.search_impressions) * 100 : null,
  }))
  return (
    <Section
      title="Search funnel"
      description={f.end ? <>From App Store analytics, {fmtDate(f.start, { month: 'short', day: 'numeric' })} – {fmtDate(f.end, { month: 'short', day: 'numeric' })}. Impressions → product page views → Get taps, by where people came from.</> : 'From App Store analytics reports.'}
      actions={<Segmented value={String(days) as `${Days}`} onChange={(v) => onDays(Number(v) as Days)} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />}
    >
      {!f.sources.length ? (
        <EmptyState>No analytics reports for this app yet. They come with the Sales & analytics sync once Apple has generated them.</EmptyState>
      ) : (
        <div className="space-y-6">
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pl-6 pr-3 font-medium">Source</th>
                  <th className="px-3 py-2 text-right font-medium">Impressions</th>
                  <th className="px-3 py-2 text-right font-medium">Page views</th>
                  <th className="px-3 py-2 text-right font-medium">Get taps</th>
                  <th className="px-3 py-2 text-right font-medium" title="Product page views per impression">Tap-through</th>
                  <th className="px-3 py-2 text-right font-medium" title="Get taps per impression">Conversion</th>
                  <th className="py-2 pl-3 pr-6 text-right font-medium" title="Conversion vs the period before">vs before</th>
                </tr>
              </thead>
              <tbody>
                {f.sources.map((s) => (
                  <tr key={s.source} className={cn('border-b border-border/60', s.source === 'App Store search' && 'bg-primary/5 font-medium')}>
                    <td className="py-2 pl-6 pr-3">{SOURCE_LABEL[s.source] || s.source}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(s.impressions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(s.page_views)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(s.gets)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.impressions ? pct(s.page_views, s.impressions) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.impressions ? pct(s.gets, s.impressions) : '—'}</td>
                    <td className="py-2 pl-3 pr-6 text-right"><Change now={rate(s)} then={rate(s.previous)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="-mt-3 text-xs text-muted-foreground">
            Get taps count first downloads started from search results or the product page. Page views from other apps and websites have no impressions: those people arrive by link.
          </p>

          {weekly.length > 1 && (
            <div>
              <div className="mb-2 text-sm font-medium">Search by week</div>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={weekly} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(d) => fmtDate(d, { month: 'short', day: 'numeric' })} />
                    <YAxis yAxisId="n" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => fmtCompact(v)} />
                    <YAxis yAxisId="p" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: 'hsl(var(--foreground))', marginBottom: 4 }}
                      labelFormatter={(d) => `Week of ${fmtDate(String(d))}`}
                      formatter={(v: number, name: string) => [name === 'Search conversion' ? `${v?.toFixed(2)}%` : fmtNumber(v), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="n" dataKey="search_impressions" name="Search impressions" fill="hsl(var(--chart-1))" fillOpacity={0.8} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Bar yAxisId="n" dataKey="search_gets" name="Get taps from search" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Line yAxisId="p" dataKey="conversion" name="Search conversion" stroke="hsl(25 90% 55%)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {f.territories.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-medium">Search by storefront</div>
              <div className="-mx-6 overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pl-6 pr-3 font-medium">Storefront</th>
                      <th className="px-3 py-2 text-right font-medium">Search impressions</th>
                      <th className="px-3 py-2 text-right font-medium">Page views</th>
                      <th className="px-3 py-2 text-right font-medium">Get taps</th>
                      <th className="px-3 py-2 text-right font-medium">Conversion</th>
                      <th className="py-2 pl-3 pr-6 font-medium">Listing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.territories.slice(0, 12).map((t) => (
                      <tr key={t.country} className="border-b border-border/60">
                        <td className="py-1.5 pl-6 pr-3">{countryToFlag(t.country)} {t.country_name}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNumber(t.impressions)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNumber(t.page_views)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNumber(t.gets)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{pct(t.gets, t.impressions)}</td>
                        <td className="py-1.5 pl-3 pr-6 text-xs">
                          {t.localized == null ? <span className="text-muted-foreground">—</span> : t.localized ? <span className="text-muted-foreground">In its language</span> : <span className="text-amber-600 dark:text-amber-400">Not in its language</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}
