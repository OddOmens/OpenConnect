'use client'

import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Section, Segmented, EmptyState } from '@/components/dashboard/section'
import { cn } from '@/lib/utils'
import { fmtCompact } from '@/lib/format'
import type { PortfolioApp } from '@/lib/aso'
import type { Days } from './aso-view'

const short = (name: string) => name.split(':')[0]

function Change({ now, then, digits = 0 }: { now: number | null; then: number | null; digits?: number }) {
  if (now == null || then == null || then === 0) return null
  const c = (now - then) / then
  if (Math.abs(c) < 0.01) return null
  return (
    <span className={cn('ml-1 text-xs tabular-nums', c > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
      {c > 0 ? '+' : ''}{(c * 100).toFixed(digits)}%
    </span>
  )
}

function Score({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>
  return (
    <span
      className={cn(
        'inline-flex min-w-9 justify-center rounded-md px-1.5 py-0.5 text-sm font-semibold tabular-nums',
        value >= 80 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : value >= 60 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-red-500/15 text-red-700 dark:text-red-300'
      )}
    >
      {value}
    </span>
  )
}

interface Step {
  tone: 'do' | 'good' | 'watch'
  app: PortfolioApp | null
  text: string
}

/** The most useful thing to do in each app, across the whole portfolio. */
function steps(apps: PortfolioApp[]): Step[] {
  const out: Step[] = []
  const unfetched = apps.filter((a) => a.score == null)
  if (unfetched.length) {
    out.push({ tone: 'do', app: null, text: `${unfetched.length} app${unfetched.length === 1 ? '’s listing hasn’t' : 's’ listings haven’t'} been fetched yet (${unfetched.slice(0, 3).map((a) => short(a.name)).join(', ')}${unfetched.length > 3 ? '…' : ''}). They come with the next Sales & analytics sync.` })
  }
  for (const a of [...apps].filter((x) => x.wasted >= 5).sort((x, y) => y.wasted - x.wasted).slice(0, 3)) {
    out.push({ tone: 'do', app: a, text: `${a.wasted} of the main keyword field’s 100 characters do nothing: repeats, spaces or words already in the name or subtitle.` })
  }
  for (const a of [...apps].filter((x) => x.gaps > 0).sort((x, y) => y.gaps - x.gaps).slice(0, 2)) {
    out.push({ tone: 'do', app: a, text: `${a.gaps} storefront${a.gaps === 1 ? ' finds' : 's find'} it in search without a listing in their language.` })
  }
  for (const a of apps) {
    if (a.searchImpressions < 200 || a.previousImpressions == null || a.previousGets == null) continue
    const now = a.searchGets / a.searchImpressions
    const then = a.previousGets / a.previousImpressions
    if (then > 0 && now < then * 0.75) out.push({ tone: 'watch', app: a, text: `Search conversion fell from ${(then * 100).toFixed(1)}% to ${(now * 100).toFixed(1)}%.` })
  }
  for (const a of apps) {
    const d = a.top10 - a.top10Before
    if (Math.abs(d) >= 2) out.push({ tone: d > 0 ? 'good' : 'watch', app: a, text: `${Math.abs(d)} ${d > 0 ? 'more' : 'fewer'} keywords in the top 10 than a week ago (${a.top10} now).` })
  }
  return out
}

export function PortfolioPanel({ apps, days, onDays, onSelect }: { apps: PortfolioApp[]; days: Days; onDays: (d: Days) => void; onSelect: (id: string) => void }) {
  const list = steps(apps)
  const icons = { do: ArrowRight, good: CheckCircle2, watch: AlertTriangle }
  const sorted = [...apps].sort((a, b) => b.searchImpressions - a.searchImpressions || a.name.localeCompare(b.name))
  return (
    <>
      {list.length > 0 && (
        <Section title="What to do next" description="The most useful change in each app, from its listing, keyword ranks and App Store analytics.">
          <ul className="space-y-2.5">
            {list.slice(0, 8).map((s, i) => {
              const Icon = icons[s.tone]
              return (
                <li key={i} className="flex gap-3 text-sm">
                  <Icon
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0',
                      s.tone === 'do' && 'text-primary',
                      s.tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
                      s.tone === 'watch' && 'text-amber-600 dark:text-amber-400'
                    )}
                  />
                  <span>
                    {s.app && (
                      <button onClick={() => onSelect(s.app!.apple_id)} className="mr-1 font-medium hover:underline">{short(s.app.name)}:</button>
                    )}
                    {s.text}
                  </span>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      <Section
        title="All apps"
        description="Each app’s main listing, keyword ranks across its listing languages, and App Store search. Pick an app for the details."
        actions={<Segmented value={String(days) as `${Days}`} onChange={(v) => onDays(Number(v) as Days)} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />}
      >
        {!apps.length ? (
          <EmptyState>No apps yet.</EmptyState>
        ) : (
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pl-6 pr-3 font-medium">App</th>
                  <th className="px-3 py-2 font-medium" title="The primary language's listing, scored on how well it uses the name, subtitle and keyword field">Listing</th>
                  <th className="px-3 py-2 font-medium" title="Keyword-field characters that do nothing, and ones left unused">Keyword field</th>
                  <th className="px-3 py-2 text-right font-medium">Languages</th>
                  <th className="px-3 py-2 text-right font-medium" title="Tracked keywords in the top 10, across every storefront">Top 10</th>
                  <th className="px-3 py-2 text-right font-medium">Search impressions</th>
                  <th className="px-3 py-2 text-right font-medium" title="Get taps per search impression">Search conversion</th>
                  <th className="py-2 pl-3 pr-6 text-right font-medium" title="Storefronts with search traffic and no listing in their language">To localize</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((a) => {
                  const conv = a.searchImpressions ? a.searchGets / a.searchImpressions : null
                  const prevConv = a.previousImpressions && a.previousGets != null ? a.previousGets / a.previousImpressions : null
                  const moved = a.top10 - a.top10Before
                  return (
                    <tr key={a.apple_id} onClick={() => onSelect(a.apple_id)} className="cursor-pointer border-b border-border/60 hover:bg-accent/30">
                      <td className="py-2 pl-6 pr-3">
                        <span className="flex items-center gap-2.5">
                          {a.icon_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.icon_url} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded-[8px] border border-border" />
                          ) : (
                            <span className="h-7 w-7 shrink-0 rounded-[8px] bg-muted" />
                          )}
                          <span className="truncate font-medium">{short(a.name)}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2"><Score value={a.score} /></td>
                      <td className="px-3 py-2 text-xs">
                        {a.score == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <>
                            <span className={cn(a.wasted >= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>{a.wasted} wasted</span>
                            <span className="text-muted-foreground"> · {a.unused} unused</span>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.locales || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {a.keywords ? (
                          <>
                            {a.top10}<span className="text-muted-foreground">/{a.keywords}</span>
                            {moved !== 0 && <span className={cn('ml-1 text-xs', moved > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{moved > 0 ? '+' : ''}{moved}</span>}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {a.searchImpressions ? fmtCompact(a.searchImpressions) : '—'}
                        <Change now={a.searchImpressions} then={a.previousImpressions} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {conv == null ? '—' : `${(conv * 100).toFixed(1)}%`}
                        <Change now={conv} then={prevConv} />
                      </td>
                      <td className="py-2 pl-3 pr-6 text-right tabular-nums">
                        {a.gaps ? <span className="text-amber-600 dark:text-amber-400">{a.gaps}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Search figures are for the last {days} days of App Store analytics, against the {days} before. Keyword-field terms are tracked automatically in each language’s storefront.
        </p>
      </Section>
    </>
  )
}
