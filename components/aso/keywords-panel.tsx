'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Loader2, Plus, RefreshCw, Sparkles, Star, X } from 'lucide-react'
import { Section, EmptyState } from '@/components/dashboard/section'
import { Button } from '@/components/ui/button'
import { inputCls } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { fmtCompact, fmtDate } from '@/lib/format'
import { countryToFlag, territoryName } from '@/lib/territories'
import { keywordCoverage, type Coverage } from '@/lib/aso-audit'
import type { AsoOverview, KeywordRow } from '@/lib/aso'
import type { SearchHit } from '@/lib/itunes-client'
import { asoAction, countryListing } from './aso-view'

type SortKey = 'keyword' | 'rank' | 'change' | 'popularity' | 'difficulty'

const COVERAGE: Record<Coverage, { label: string; cls: string; title: string }> = {
  name: { label: 'Name', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', title: 'Every word is in the app name: the strongest place for a keyword.' },
  subtitle: { label: 'Subtitle', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', title: 'Every word is in the name or subtitle.' },
  keywords: { label: 'Keywords', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', title: 'Every word is in the name, subtitle or keyword field.' },
  partial: { label: 'Partly', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', title: 'Some of its words are missing from the name, subtitle and keyword field.' },
  missing: { label: 'Missing', cls: 'bg-red-500/15 text-red-700 dark:text-red-300', title: 'None of its words are in the name, subtitle or keyword field: the app can’t rank well for it.' },
}

function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) return <span className="text-muted-foreground" title="Not in the top 200">200+</span>
  return (
    <span
      className={cn(
        'inline-flex min-w-[2.25rem] justify-center rounded-md px-1.5 py-0.5 text-sm font-semibold tabular-nums',
        rank <= 10 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : rank <= 50 ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300' : 'bg-muted text-foreground'
      )}
    >
      {rank}
    </span>
  )
}

/** Rank change since `then`: positive = better (moved up). */
function delta(now: number | null, then: number | null | undefined): number | null {
  if (then === undefined) return null
  return (then ?? 201) - (now ?? 201)
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>
  if (value === 0) return <span className="text-muted-foreground">0</span>
  const up = value > 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 tabular-nums', up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(value)}
    </span>
  )
}

/** Rank over time; up is better, unranked days sit on the floor. */
function Sparkline({ history }: { history: KeywordRow['history'] }) {
  if (history.length < 2) return <span className="text-xs text-muted-foreground">{history.length ? 'day 1' : '—'}</span>
  const w = 88
  const h = 24
  const y = (r: number | null) => (Math.log(Math.min(r ?? 201, 201)) / Math.log(201)) * (h - 2) + 1
  const pts = history.map((p, i) => `${((i / (history.length - 1)) * (w - 2) + 1).toFixed(1)},${y(p.rank).toFixed(1)}`)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
      <polyline points={pts.join(' ')} fill="none" stroke="hsl(var(--chart-1))" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function Meter({ value, tone, title }: { value: number | null; tone: 'pop' | 'diff'; title: string }) {
  if (value == null) return <span className="text-muted-foreground" title={title}>—</span>
  const color =
    tone === 'pop'
      ? 'bg-sky-500'
      : value >= 70 ? 'bg-red-500' : value >= 45 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <span className="inline-flex items-center gap-2" title={title}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <span className={cn('block h-full rounded-full', color)} style={{ width: `${Math.max(4, value)}%` }} />
      </span>
      <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">{value}</span>
    </span>
  )
}

function popularityTitle(k: KeywordRow, supported: boolean) {
  if (k.popularity == null) return supported ? 'Estimated on the next check.' : 'App Store suggestions aren’t available for this storefront.'
  if (!k.hintPrefix) return 'App Store search doesn’t suggest it even when typed in full: rarely searched.'
  const typed = [...k.hintPrefix].length
  const total = [...k.keyword].length
  return `Suggested after typing “${k.hintPrefix}” (${typed} of ${total} letters)${k.hintPosition ? `, as suggestion #${k.hintPosition + 1}` : ', as the first suggestion'}. The fewer letters, the more it’s searched.`
}

function difficultyTitle(k: KeywordRow) {
  if (k.difficulty == null) return 'Known after the first check.'
  const ten = k.top.slice(0, 10)
  const median = [...ten].map((h) => h.ratings).sort((a, b) => a - b)[Math.floor(ten.length / 2)] ?? 0
  return `The top 10 have a median of ${fmtCompact(median)} ratings. Higher means the top spots are harder to win.`
}

function AppIcon({ src, size = 28 }: { src: string | null; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" width={size} height={size} className="shrink-0 rounded-[22%] border border-border" />
  ) : (
    <span className="shrink-0 rounded-[22%] bg-muted" style={{ width: size, height: size }} />
  )
}

export function KeywordsPanel({
  overview: o,
  onChange,
  onCountry,
  onRefresh,
  refreshing,
}: {
  overview: AsoOverview
  onChange: () => Promise<void> | void
  onCountry: (country: string) => void
  onRefresh: () => void
  refreshing: boolean
}) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'rank', desc: false })
  const listing = countryListing(o)
  const supported = o.storefrontsWithSuggestions.includes(o.country)

  const add = async (keywords: string[]) => {
    const list = keywords.map((k) => k.trim()).filter(Boolean)
    if (!list.length) return
    setBusy(true)
    setError(null)
    try {
      const r = await asoAction({ action: 'add-keywords', app: o.app.apple_id, country: o.country, keywords: list })
      if (!r.added && list.length) setError(`Already tracked, or the limit of 60 keywords added by hand per app is reached.`)
      if (r.failed?.length) setError(`Couldn’t search ${r.failed.join(', ')} right now (Apple throttling); it’s checked again with the next Ratings & Rankings sync.`)
      setInput('')
      await onChange()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (keyword: string) => {
    setError(null)
    await asoAction({ action: 'remove-keyword', app: o.app.apple_id, country: o.country, keyword }).catch((err) => setError(err.message))
    await onChange()
  }

  const rows = useMemo(() => {
    const value = (k: KeywordRow): number | string => {
      switch (sort.key) {
        case 'keyword': return k.keyword
        case 'rank': return k.rank ?? 999
        case 'change': return delta(k.rank, k.rank7) ?? -999
        case 'popularity': return k.popularity ?? -1
        case 'difficulty': return k.difficulty ?? 999
      }
    }
    return [...o.keywords].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      const c = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number)
      return sort.desc ? -c : c
    })
  }, [o.keywords, sort])

  const th = (key: SortKey, label: string, cls = '') => (
    <th className={cn('px-3 py-2 font-medium', cls)}>
      <button
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key === 'popularity' || key === 'change' }))}
        className={cn('inline-flex items-center gap-1 hover:text-foreground', sort.key === key && 'text-foreground')}
      >
        {label}
        {sort.key === key && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </th>
  )

  const lastChecked = o.keywords.map((k) => k.checked).filter(Boolean).sort().pop()
  const fromField = o.keywords.filter((k) => k.source === 'listing').length
  const unranked = o.keywords.filter((k) => !k.checked).length
  const fieldTerms = listing?.keywords.split(/[,，、]/).filter((t) => t.trim()).length ?? 0

  return (
    <Section
      title={`Keyword ranks · ${countryToFlag(o.country)} ${territoryName(o.country)}`}
      description={
        <>
          Where {o.app.name.split(':')[0]} shows up in App Store search, checked daily with Ratings & Rankings{lastChecked ? `, last on ${fmtDate(lastChecked, { month: 'short', day: 'numeric' })}` : ''}.
          {listing ? ` Every term in the ${listing.locale_name} keyword field is tracked here automatically, and follows the field when you change it in App Store Connect.` : ''}
        </>
      }
    >
      {o.markets.length > 1 && (
        <div className="-mx-1 mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Listing language">
          {o.markets.map((m) => (
            <button
              key={m.country}
              role="tab"
              aria-selected={m.country === o.country}
              onClick={() => onCountry(m.country)}
              title={`${m.country_name}${m.locale_name ? `: searched against the ${m.locale_name} listing` : ''}. ${m.keywords} keywords tracked, ${m.top10} in the top 10.`}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                m.country === o.country ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <span>{countryToFlag(m.country)}</span>
              <span className="font-medium">{m.locale_name ?? m.country_name}</span>
              <span className="tabular-nums">{m.keywords ? `${m.top10}/${m.keywords}` : '—'}</span>
            </button>
          ))}
        </div>
      )}

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add(input.split(','))
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={fromField ? 'Track more, comma-separated: phrases people search, competitors’ words…' : 'Track keywords, comma-separated: focus timer, pomodoro, study app'}
          className={inputCls}
          aria-label="Keywords to track"
        />
        <Button type="submit" size="sm" disabled={busy || !input.trim()} className="shrink-0">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span className="ml-1.5">Track</span>
        </Button>
      </form>
      {error && <p className="mb-3 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {unranked > 0 && o.keywords.length > 0 && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {unranked} keyword{unranked === 1 ? ' hasn’t' : 's haven’t'} been ranked yet: that happens with the next Ratings & Rankings sync.
          <button onClick={onRefresh} disabled={refreshing} className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
            {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Rank now
          </button>
        </p>
      )}
      {!o.keywords.length ? (
        <EmptyState>
          {fieldTerms
            ? `The ${fieldTerms} terms in the ${listing!.locale_name} keyword field are tracked here once the listing is fetched again. Press Refresh.`
            : listing
              ? `The ${listing.locale_name} keyword field is empty, so nothing is tracked in ${territoryName(o.country)} automatically. Add the words people would type to find this app.`
              : `No keywords tracked in ${territoryName(o.country)} yet. Add the words people would type to find this app.`}
        </EmptyState>
      ) : (
        <div className="-mx-6 overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                {th('keyword', 'Keyword', 'pl-6')}
                {th('rank', 'Rank')}
                {th('change', '7 days')}
                <th className="px-3 py-2 font-medium">90 days</th>
                {th('popularity', 'Popularity')}
                {th('difficulty', 'Difficulty')}
                <th className="px-3 py-2 font-medium">In listing</th>
                <th className="px-3 py-2 font-medium">Top results</th>
                <th className="w-10 pr-6" />
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => {
                const coverage = keywordCoverage(k.keyword, listing)
                const opening = (k.popularity ?? 0) >= 35 && (k.difficulty ?? 100) <= 45 && (k.rank == null || k.rank > 10)
                const expanded = open === k.keyword
                return (
                  <Fragment key={k.keyword}>
                    <tr className={cn('border-b border-border/60 hover:bg-accent/30', expanded && 'bg-accent/30')}>
                      <td className="py-2 pl-6 pr-3">
                        <button onClick={() => setOpen(expanded ? null : k.keyword)} className="inline-flex items-center gap-1.5 text-left font-medium hover:underline" aria-expanded={expanded}>
                          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', !expanded && '-rotate-90')} />
                          {k.keyword}
                          {opening && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Opening: searched often and beatable" />}
                        </button>
                        <div className="pl-5 text-[11px] text-muted-foreground">
                          {k.source === 'listing' ? `${k.locale && k.locale !== listing?.locale ? `${k.locale} ` : ''}keyword field` : 'added by you'}
                        </div>
                      </td>
                      <td className="px-3 py-2" title={k.best ? `Best: ${k.best}` : undefined}><RankBadge rank={k.rank} /></td>
                      <td className="px-3 py-2"><Delta value={delta(k.rank, k.rank7)} /></td>
                      <td className="px-3 py-2"><Sparkline history={k.history} /></td>
                      <td className="px-3 py-2"><Meter value={k.popularity} tone="pop" title={popularityTitle(k, supported)} /></td>
                      <td className="px-3 py-2"><Meter value={k.difficulty} tone="diff" title={difficultyTitle(k)} /></td>
                      <td className="px-3 py-2">
                        <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', COVERAGE[coverage].cls)} title={COVERAGE[coverage].title}>{COVERAGE[coverage].label}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex -space-x-1.5">
                          {k.top.slice(0, 5).map((h) => (
                            <span key={h.id} title={`${h.name} · ${fmtCompact(h.ratings)} ratings`} className={cn(h.id === o.app.apple_id && 'ring-2 ring-primary rounded-[22%]')}>
                              <AppIcon src={h.icon} size={22} />
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="py-2 pr-6 text-right">
                        {k.source === 'manual' && (
                          <button onClick={() => remove(k.keyword)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Stop tracking" aria-label={`Stop tracking ${k.keyword}`}>
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-border/60 bg-accent/10">
                        <td colSpan={9} className="px-6 py-4">
                          <KeywordDetail row={k} overview={o} tracked={new Set(o.keywords.map((x) => x.keyword))} onTrack={(ks) => add(ks)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {o.ideas.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> Words your competitors rank with
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            From the names of the apps in the top 10 for your keywords, left out when they’re already in your listing. Click one to track it.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {o.ideas.map((idea) => (
              <button
                key={idea.word}
                onClick={() => add([idea.word])}
                disabled={busy}
                title={`In ${idea.apps.length} app names: ${idea.apps.join(' · ')}`}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-accent"
              >
                <Plus className="h-3 w-3 text-muted-foreground" />
                {idea.word}
                <span className="text-muted-foreground">{idea.apps.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Ranks come from Apple’s public search API, which follows App Store search closely but not exactly. Popularity is estimated from App Store search suggestions; difficulty from the ratings of the top 10 and whether the keyword is in their names. ★ marks openings: searched often, beatable, and you’re not in the top 10 yet.
      </p>
    </Section>
  )
}

interface Detail {
  total: number
  top: SearchHit[]
  suggestions: string[]
}

function KeywordDetail({ row, overview: o, tracked, onTrack }: { row: KeywordRow; overview: AsoOverview; tracked: Set<string>; onTrack: (k: string[]) => void }) {
  const [detail, setDetail] = useState<Detail | null | 'error'>(null)
  useEffect(() => {
    let live = true
    fetch(`/api/aso/keyword?term=${encodeURIComponent(row.keyword)}&country=${o.country}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setDetail(d), () => live && setDetail('error'))
    return () => {
      live = false
    }
  }, [row.keyword, o.country])
  const top = detail && detail !== 'error' ? detail.top : row.top
  const ours = top.findIndex((h) => h.id === o.app.apple_id)
  const suggestions = detail && detail !== 'error' ? detail.suggestions.filter((s) => !tracked.has(s)) : []
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div>
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          Top results now{detail && detail !== 'error' ? ` (${detail.total}${detail.total >= 200 ? '+' : ''} apps match)` : ''}
          {ours >= 0 && ` · you’re #${ours + 1}`}
        </div>
        <ol className="grid gap-1.5 sm:grid-cols-2">
          {top.slice(0, 10).map((h, i) => {
            const name = new Set(h.name.toLowerCase().split(/[^\p{L}\p{N}]+/u))
            const titled = row.keyword.split(' ').every((w) => name.has(w))
            return (
              <li key={h.id} className={cn('flex items-center gap-2.5 rounded-md px-2 py-1.5', h.id === o.app.apple_id ? 'bg-primary/10' : 'bg-background')}>
                <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <AppIcon src={h.icon} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{h.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {h.rating != null ? `★ ${h.rating.toFixed(1)} · ` : ''}{fmtCompact(h.ratings)} ratings{titled ? ' · keyword in name' : ''}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
        {detail === null && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Searching now…</p>}
      </div>
      <div>
        <div className="mb-2 text-xs font-medium text-muted-foreground">App Store suggests</div>
        {detail === null ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : !suggestions.length ? (
          <p className="text-xs text-muted-foreground">{o.storefrontsWithSuggestions.includes(o.country) ? 'Nothing new to suggest.' : 'Suggestions aren’t available for this storefront.'}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} onClick={() => onTrack([s])} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs hover:bg-accent">
                <Plus className="h-3 w-3 text-muted-foreground" /> {s}
              </button>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">What people type that starts with “{row.keyword}”, most searched first.</p>
      </div>
    </div>
  )
}
