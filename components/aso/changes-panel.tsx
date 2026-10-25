'use client'

import { useState } from 'react'
import { ChevronDown, Loader2, Plus, StickyNote, X } from 'lucide-react'
import { Section, EmptyState } from '@/components/dashboard/section'
import { Button } from '@/components/ui/button'
import { inputCls } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { fmtDate, fmtNumber } from '@/lib/format'
import { splitKeywords } from '@/lib/aso-audit'
import type { AsoOverview, ChangeEvent, ChangeItem, ImpactWindow } from '@/lib/aso'
import { asoAction } from './aso-view'

const FIELD_LABEL: Record<ChangeItem['field'], string> = {
  keywords: 'Keywords',
  description: 'Description',
  name: 'Name',
  subtitle: 'Subtitle',
  promotional_text: 'Promotional text',
  locale: 'New locale',
}

const IMPACT_DAYS = 14

function today() {
  return new Intl.DateTimeFormat('en-CA').format(new Date())
}

function summary(items: ChangeItem[]): string[] {
  const by = new Map<ChangeItem['field'], ChangeItem[]>()
  items.forEach((i) => by.set(i.field, [...(by.get(i.field) || []), i]))
  const out: string[] = []
  for (const field of ['name', 'subtitle', 'keywords', 'promotional_text', 'description', 'locale'] as const) {
    const list = by.get(field)
    if (!list) continue
    if (field === 'locale') out.push(`Added ${list.length === 1 ? list[0].locale_name : `${list.length} locales`}`)
    else out.push(`${FIELD_LABEL[field]} in ${list.length === 1 ? list[0].locale_name : `${list.length} locales`}`)
  }
  return out
}

function KeywordDiff({ item }: { item: ChangeItem }) {
  const before = new Set(splitKeywords(item.old || '').map((k) => k.toLowerCase()))
  const after = new Set(splitKeywords(item.new || '').map((k) => k.toLowerCase()))
  const added = [...after].filter((k) => !before.has(k))
  const removed = [...before].filter((k) => !after.has(k))
  return (
    <span className="flex flex-wrap gap-1">
      {added.map((k) => <span key={`+${k}`} className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">+ {k}</span>)}
      {removed.map((k) => <span key={`-${k}`} className="rounded bg-red-500/10 px-1.5 py-0.5 text-xs text-red-700 line-through dark:text-red-300">{k}</span>)}
      {!added.length && !removed.length && <span className="text-xs text-muted-foreground">Same keywords, new order or spacing</span>}
    </span>
  )
}

function ItemDetail({ item }: { item: ChangeItem }) {
  if (item.field === 'keywords') return <KeywordDiff item={item} />
  if (item.field === 'locale') return <span className="text-xs text-muted-foreground">{item.new && item.new !== item.locale ? `Name: ${item.new}` : 'New listing'}</span>
  if (item.field === 'description') {
    const d = [...(item.new || '')].length - [...(item.old || '')].length
    return <span className="text-xs text-muted-foreground">Rewritten ({d >= 0 ? '+' : ''}{d} characters)</span>
  }
  return (
    <span className="text-xs">
      <span className="text-muted-foreground line-through">{item.old || 'empty'}</span> → <span>{item.new || 'empty'}</span>
    </span>
  )
}

/** Per-day figures for the window, so windows of different lengths compare fairly. */
function perDay(w: ImpactWindow, key: 'search_impressions' | 'downloads' | 'impressions') {
  return w[key] / Math.max(1, w.days)
}

function Metric({ label, before, after, format, early }: { label: string; before: number | null; after: number | null; format: (n: number) => string; early: boolean }) {
  // Under a week of "after" is noise: show the figures, not a verdict.
  const change = !early && before != null && after != null && before > 0 ? (after - before) / before : null
  return (
    <div className="min-w-[8.5rem] rounded-md border border-border bg-background px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5 text-sm tabular-nums">
        <span className="text-muted-foreground">{before == null ? '—' : format(before)}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-medium">{after == null ? '—' : format(after)}</span>
        {change != null && Math.abs(change) >= 0.01 && (
          <span className={cn('text-xs', change > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            {change > 0 ? '+' : ''}{(change * 100).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  )
}

function Impact({ e }: { e: ChangeEvent }) {
  const b = e.before
  const a = e.after
  if (!b && !a) return <p className="text-xs text-muted-foreground">No analytics reports around this date.</p>
  const conv = (w: ImpactWindow | null) => (w && w.search_impressions ? (w.search_gets / w.search_impressions) * 100 : null)
  const ctr = (w: ImpactWindow | null) => (w && w.search_impressions ? (w.search_page_views / w.search_impressions) * 100 : null)
  const one = (n: number) => (n >= 100 ? fmtNumber(Math.round(n)) : n.toFixed(1))
  const early = !a || a.days < 7
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Metric label="Search impressions / day" before={b ? perDay(b, 'search_impressions') : null} after={a ? perDay(a, 'search_impressions') : null} format={one} early={early} />
        <Metric label="Search tap-through" before={ctr(b)} after={ctr(a)} format={(n) => `${n.toFixed(1)}%`} early={early} />
        <Metric label="Search conversion" before={conv(b)} after={conv(a)} format={(n) => `${n.toFixed(1)}%`} early={early} />
        <Metric label="First downloads / day" before={b ? perDay(b, 'downloads') : null} after={a ? perDay(a, 'downloads') : null} format={one} early={early} />
        {e.ranks && (
          <div className="min-w-[8.5rem] rounded-md border border-border bg-background px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Keyword ranks</div>
            <div className="mt-0.5 text-sm">
              <span className="text-emerald-600 dark:text-emerald-400">{e.ranks.better} up</span> · <span className="text-red-600 dark:text-red-400">{e.ranks.worse} down</span>
              <span className="text-xs text-muted-foreground"> of {e.ranks.compared}</span>
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {a ? `${IMPACT_DAYS} days before vs ${a.days} day${a.days === 1 ? '' : 's'} after.` : 'No analytics reports after it yet; Apple publishes them a day or two late.'}
        {a && a.days < 7 && ' Too early to judge: wait for at least a week of reports.'}
        {e.overlaps.length > 0 && ` Another change followed on ${e.overlaps.map((d) => fmtDate(d, { month: 'short', day: 'numeric' })).join(', ')}, so the “after” mixes both.`}
      </p>
    </div>
  )
}

function Event({ e, onRemoveNote }: { e: ChangeEvent; onRemoveNote: (id: number) => void }) {
  const [open, setOpen] = useState(false)
  const lines = summary(e.items)
  const shown = open ? e.items : e.items.filter((i) => i.field !== 'locale').slice(0, 3)
  return (
    <li className="relative pl-6">
      <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary bg-background" />
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-medium">{fmtDate(e.date)}</span>
        {e.version && <span className="rounded bg-muted px-1.5 py-0.5 text-xs">v{e.version}</span>}
        {lines.length > 0 && <span className="text-sm text-muted-foreground">{lines.join(' · ')}</span>}
      </div>
      {e.notes.map((n) => (
        <div key={n.id} className="mt-1 flex items-center gap-1.5 text-sm">
          <StickyNote className="h-3.5 w-3.5 text-amber-500" /> {n.note}
          <button onClick={() => onRemoveNote(n.id)} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Remove note"><X className="h-3 w-3" /></button>
        </div>
      ))}
      {shown.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {shown.map((i, k) => (
            <li key={k} className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="w-40 shrink-0 text-xs text-muted-foreground">{FIELD_LABEL[i.field]} · {i.locale_name}</span>
              <span className="min-w-0 flex-1"><ItemDetail item={i} /></span>
            </li>
          ))}
        </ul>
      )}
      {e.items.length > shown.length && (
        <button onClick={() => setOpen(true)} className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronDown className="h-3 w-3" /> All {e.items.length} changes
        </button>
      )}
      <div className="mt-3"><Impact e={e} /></div>
    </li>
  )
}

export function ChangesPanel({ overview: o, onChange }: { overview: AsoOverview; onChange: () => Promise<void> | void }) {
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!note.trim()) return
    setBusy(true)
    try {
      await asoAction({ action: 'add-note', app: o.app.apple_id, date, note })
      setNote('')
      await onChange()
    } finally {
      setBusy(false)
    }
  }
  const removeNote = async (id: number) => {
    await asoAction({ action: 'remove-note', id }).catch(() => {})
    await onChange()
  }

  return (
    <Section
      title="Changes & impact"
      description="Every listing change, with search and downloads in the two weeks before and after it. Keyword and description changes come from version history; name, subtitle and promotional text changes are recorded from now on."
    >
      <form
        className="mb-6 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className={cn(inputCls, 'w-auto')} aria-label="Date" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note: new screenshots, new icon, started Search Ads…" className={cn(inputCls, 'min-w-[14rem] flex-1')} aria-label="Note" />
        <Button type="submit" size="sm" variant="outline" disabled={busy || !note.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span className="ml-1.5">Add note</span>
        </Button>
      </form>

      {!o.changes.length ? (
        <EmptyState>No changes recorded yet. They appear here after the listing is fetched and a version with new keywords is released, or when you add a note.</EmptyState>
      ) : (
        <ol className="space-y-8 border-l border-border pl-0 [&>li]:-ml-[5px]">
          {o.changes.map((e) => <Event key={e.date} e={e} onRemoveNote={removeNote} />)}
        </ol>
      )}
    </Section>
  )
}
