'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, Check, Copy, Globe, Info, Loader2, RefreshCw, RotateCcw, Upload, Wand2 } from 'lucide-react'
import { Section, Segmented, EmptyState } from '@/components/dashboard/section'
import { Button } from '@/components/ui/button'
import { selectSmCls, textareaCls } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { fmtCompact, fmtDate } from '@/lib/format'
import { countryToFlag } from '@/lib/territories'
import { LIMITS, auditListing, cleanKeywords, keywordCoverage, words, type AuditIssue, type KeywordTerm } from '@/lib/aso-audit'
import type { AsoOverview, ListingLocale } from '@/lib/aso'
import { asoAction } from './aso-view'

const SEVERITY = {
  error: { icon: AlertCircle, cls: 'text-red-600 dark:text-red-400' },
  warn: { icon: AlertTriangle, cls: 'text-amber-600 dark:text-amber-400' },
  info: { icon: Info, cls: 'text-muted-foreground' },
} as const

const WASTE: Record<NonNullable<KeywordTerm['waste']>, string> = {
  duplicate: 'Repeated',
  'in-name': 'Already in the name',
  'in-subtitle': 'Already in the subtitle',
  generic: 'Matched anyway',
  category: 'Your category’s name',
  plural: 'Plural of another keyword',
}

const STATE_LABEL: Record<string, string> = {
  PREPARE_FOR_SUBMISSION: 'being prepared',
  WAITING_FOR_REVIEW: 'waiting for review',
  IN_REVIEW: 'in review',
  PENDING_DEVELOPER_RELEASE: 'approved, waiting for you to release it',
  PENDING_APPLE_RELEASE: 'approved, about to be released',
  DEVELOPER_REJECTED: 'pulled from review',
  REJECTED: 'rejected',
  METADATA_REJECTED: 'rejected for its metadata',
}

const len = (s: string) => [...(s || '')].length

function Meter({ used, max }: { used: number; max: number }) {
  const over = used > max
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span className={cn('block h-full rounded-full', over ? 'bg-red-500' : used / max >= 0.85 ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${Math.min(100, (used / max) * 100)}%` }} />
      </span>
      <span className={cn('text-xs tabular-nums', over ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>{used}/{max}</span>
    </span>
  )
}

function Field({ label, value, max, hint }: { label: string; value: string; max: number; hint?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground" title={hint}>{label}</span>
        <Meter used={len(value)} max={max} />
      </div>
      <div className={cn('rounded-md border border-border bg-background px-3 py-2 text-sm', !value && 'text-muted-foreground')}>{value || 'Empty'}</div>
    </div>
  )
}

function Issues({ issues }: { issues: AuditIssue[] }) {
  if (!issues.length) return <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4" /> Nothing to fix.</p>
  return (
    <ul className="space-y-2.5">
      {issues.map((issue, i) => {
        const { icon: Icon, cls } = SEVERITY[issue.severity]
        return (
          <li key={i} className="flex gap-2.5 text-sm">
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', cls)} />
            <span>
              <span className="font-medium">{issue.title}</span>
              {issue.wasted ? <span className="ml-1.5 text-xs text-muted-foreground">−{issue.wasted} chars</span> : null}
              {issue.detail && <span className="block text-xs text-muted-foreground">{issue.detail}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function ListingPanel({ overview: o, onRefresh, refreshing, onSaved }: { overview: AsoOverview; onRefresh: () => void; refreshing: boolean; onSaved: () => Promise<void> | void }) {
  const [kind, setKind] = useState<'live' | 'draft'>(o.listing.live.length ? 'live' : 'draft')
  const rows = (kind === 'draft' && o.listing.draft.length) || !o.listing.live.length ? o.listing.draft : o.listing.live
  const [locale, setLocale] = useState<string | null>(o.countryLocale)
  const current = rows.find((l) => l.locale === locale) ?? rows[0] ?? null
  const category = o.app.primary_genre

  if (!o.listing.live.length && !o.listing.draft.length) {
    return (
      <Section title="Listing" description="Name, subtitle and keywords as App Store Connect holds them.">
        <EmptyState>
          <span>
            Not fetched yet. It comes with the next Sales & analytics sync, or{' '}
            <button onClick={onRefresh} disabled={refreshing} className="underline underline-offset-2 hover:text-foreground">fetch it now</button>.
            Reading listings needs an API key with the App Manager, Developer or Marketing role, or Admin.
          </span>
        </EmptyState>
      </Section>
    )
  }

  const draft = o.listing.draftVersion
  return (
    <Section
      title="Listing"
      description={<>{o.listing.live.length ? '' : 'Not on the store yet. '}Version {rows === o.listing.draft && draft ? draft.version : o.listing.liveVersion} in {rows.length} locale{rows.length === 1 ? '' : 's'}{o.listing.updatedAt ? `, fetched ${fmtDate(o.listing.updatedAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}.</>}
      actions={
        <>
          {o.listing.live.length > 0 && o.listing.draft.length > 0 && (
            <Segmented value={kind} onChange={setKind} options={[{ value: 'live', label: 'On the store' }, { value: 'draft', label: `Next version${draft?.version ? ` (${draft.version})` : ''}` }]} />
          )}
          <select value={current?.locale ?? ''} onChange={(e) => setLocale(e.target.value)} className={selectSmCls} aria-label="Locale">
            {rows.map((l) => <option key={l.locale} value={l.locale}>{l.locale_name}</option>)}
          </select>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onRefresh} disabled={refreshing} title="Fetch the listing again">
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 text-muted-foreground" />}
          </Button>
        </>
      }
    >
      {draft && (
        <div className={cn('mb-4 rounded-md border px-3 py-2 text-xs', draft.editable ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-border bg-muted/40')}>
          Version {draft.version} is {STATE_LABEL[draft.state || ''] || draft.state?.toLowerCase().replace(/_/g, ' ')}.{' '}
          {draft.editable ? 'Its keywords, subtitle and description can be changed now: here, from Claude, or in App Store Connect.' : 'Keywords can change again with the version after it.'}
        </div>
      )}

      {current && (
        <LocaleDetail
          key={`${kind}:${current.locale}`}
          listing={current}
          overview={o}
          category={category}
          saveTo={draft?.editable && o.listing.draft.some((l) => l.locale === current.locale) ? draft.version : null}
          onSaved={onSaved}
        />
      )}

      <LocaleTable rows={rows} category={category} selected={current?.locale ?? null} onSelect={setLocale} />
      <LocaleGaps overview={o} />
    </Section>
  )
}

function LocaleDetail({
  listing,
  overview: o,
  category,
  saveTo,
  onSaved,
}: {
  listing: ListingLocale
  overview: AsoOverview
  category: string | null
  /** The version being prepared, when its keywords can be changed; null otherwise. */
  saveTo: string | null
  onSaved: () => Promise<void> | void
}) {
  const [draft, setDraft] = useState(listing.keywords)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<{ ok: boolean; text: string } | null>(null)
  const edited = { ...listing, keywords: draft }
  const audit = useMemo(() => auditListing(edited, { category }), [draft, listing, category]) // eslint-disable-line react-hooks/exhaustive-deps
  const original = useMemo(() => auditListing(listing, { category }), [listing, category])
  const changed = draft !== listing.keywords

  // Tracked keywords for this locale's storefront whose words aren't in the listing yet.
  const isCountryLocale = listing.locale === o.countryLocale
  const missingWords = useMemo(() => {
    if (!isCountryLocale) return []
    const have = new Set(audit.indexedWords)
    const out = new Map<string, number>()
    for (const k of o.keywords) {
      if (keywordCoverage(k.keyword, edited) === 'name' || keywordCoverage(k.keyword, edited) === 'subtitle' || keywordCoverage(k.keyword, edited) === 'keywords') continue
      for (const w of words(k.keyword)) if (!have.has(w)) out.set(w, Math.max(out.get(w) || 0, k.popularity ?? 0))
    }
    return [...out.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w)
  }, [audit, o.keywords, isCountryLocale]) // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked
    }
  }

  const save = async () => {
    if (!saveTo || !window.confirm(`Change the ${listing.locale_name} keywords of version ${saveTo} in App Store Connect to:\n\n${draft}`)) return
    setSaving(true)
    setSaved(null)
    try {
      const plan = await asoAction({ action: 'update-listing', app: o.app.apple_id, locale: listing.locale, changes: { keywords: draft }, apply: true })
      if (plan.blocked?.length) setSaved({ ok: false, text: plan.blocked.map((b: { reason: string }) => b.reason).join(' ') })
      else {
        setSaved({ ok: true, text: plan.applied ? `Saved to version ${saveTo}. It goes live when that version is released.` : 'Already the same in App Store Connect.' })
        await onSaved()
      }
    } catch (err: any) {
      setSaved({ ok: false, text: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Field label="App name" value={listing.name} max={LIMITS.name} hint="Indexed for search, with the most weight." />
        <Field label="Subtitle" value={listing.subtitle} max={LIMITS.subtitle} hint="Indexed for search." />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-muted-foreground">Keywords {changed && <span className="text-primary">· edited</span>}</span>
            <Meter used={len(draft)} max={LIMITS.keywords} />
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            spellCheck={false}
            className={cn(textareaCls, 'font-mono text-[13px]')}
            aria-label="Keyword field"
          />
          <div className="flex flex-wrap gap-1">
            {audit.terms.map((t, i) => (
              <span
                key={`${t.term}-${i}`}
                title={t.waste ? WASTE[t.waste] : undefined}
                className={cn('rounded px-1.5 py-0.5 text-xs', t.waste ? 'bg-red-500/10 text-red-700 line-through decoration-red-500/60 dark:text-red-300' : 'bg-muted')}
              >
                {t.term}
              </span>
            ))}
          </div>
          {missingWords.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pt-1">
              <span className="mr-1 text-xs text-muted-foreground">Missing from tracked keywords:</span>
              {missingWords.slice(0, 12).map((w) => (
                <button key={w} onClick={() => setDraft((d) => (d.trim() ? `${d.replace(/[,\s]+$/, '')},${w}` : w))} className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs hover:bg-accent">
                  + {w}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" variant="outline" className="h-8" onClick={() => setDraft(cleanKeywords(edited, { category }))} title="Remove spaces, repeats, generic words and words already in the name or subtitle">
              <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Clean up
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={copy}>
              {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
            </Button>
            {changed && saveTo && (
              <Button size="sm" className="h-8" onClick={save} disabled={saving || len(draft) > LIMITS.keywords} title={`Write these keywords to version ${saveTo} in App Store Connect`}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />} Save to {saveTo}
              </Button>
            )}
            {changed && (
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setDraft(listing.keywords)}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {changed ? (
                <>Score {original.score} → <b className="text-foreground">{audit.score}</b>. {saveTo ? 'Nothing is sent to Apple until you save.' : 'Paste it into App Store Connect with your next version.'}</>
              ) : saveTo ? 'Edit to try changes; Save writes them to the version being prepared.' : 'Edit here to try changes; nothing is sent to Apple.'}
            </span>
          </div>
          {saved && <p className={cn('text-xs', saved.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{saved.text}</p>}
        </div>

        <Field label="Promotional text" value={listing.promotional_text} max={LIMITS.promotional_text} hint="Not indexed. Can be changed any time without a new version." />
        <div className="text-xs text-muted-foreground">
          Description: {fmtCompact(len(listing.description))} of 4,000 characters (not indexed for search on iOS).
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <span className={cn('text-4xl font-semibold tabular-nums', audit.score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : audit.score >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
            {audit.score}
          </span>
          <span className="text-sm text-muted-foreground">listing score for {listing.locale_name}</span>
        </div>
        <Issues issues={audit.issues} />
      </div>
    </div>
  )
}

function LocaleTable({ rows, category, selected, onSelect }: { rows: ListingLocale[]; category: string | null; selected: string | null; onSelect: (l: string) => void }) {
  if (rows.length < 2) return null
  const audited = rows.map((l) => ({ l, a: auditListing(l, { category }) }))
  return (
    <div className="mt-6 border-t border-border pt-4">
      <div className="mb-2 text-sm font-medium">All locales</div>
      <div className="-mx-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pl-6 pr-3 font-medium">Locale</th>
              <th className="px-3 py-2 font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Subtitle</th>
              <th className="px-3 py-2 font-medium">Keywords</th>
              <th className="px-3 py-2 font-medium">Wasted</th>
              <th className="py-2 pl-3 pr-6 font-medium">To fix</th>
            </tr>
          </thead>
          <tbody>
            {audited.map(({ l, a }) => (
              <tr key={l.locale} onClick={() => onSelect(l.locale)} className={cn('cursor-pointer border-b border-border/60 hover:bg-accent/30', selected === l.locale && 'bg-accent/40')}>
                <td className="py-1.5 pl-6 pr-3">{l.locale_name}</td>
                <td className={cn('px-3 py-1.5 font-medium tabular-nums', a.score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : a.score >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>{a.score}</td>
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{len(l.name)}/30</td>
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{len(l.subtitle)}/30</td>
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{len(l.keywords)}/100</td>
                <td className={cn('px-3 py-1.5 tabular-nums', a.wastedChars ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>{a.wastedChars}</td>
                <td className="py-1.5 pl-3 pr-6 text-xs text-muted-foreground">{a.issues.filter((i) => i.severity !== 'info').length || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LocaleGaps({ overview: o }: { overview: AsoOverview }) {
  if (!o.localeGaps.length) return null
  return (
    <div className="mt-6 border-t border-border pt-4">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-medium"><Globe className="h-4 w-4 text-primary" /> Locales worth adding</div>
      <p className="mb-3 text-xs text-muted-foreground">Storefronts where people already find you in search (last 90 days) without a listing in their language.</p>
      <ul className="space-y-1.5">
        {o.localeGaps.map((g) => (
          <li key={`${g.country}:${g.locale}`} className="flex items-center gap-2 text-sm">
            <span>{countryToFlag(g.country)}</span>
            <span className="font-medium">{g.locale_name}</span>
            <span className="text-muted-foreground">
              {g.reason === 'secondary'
                ? `· the U.S. store indexes it too: another name, subtitle and keyword field for ${fmtCompact(g.impressions)} U.S. search impressions`
                : `· ${fmtCompact(g.impressions)} search impressions in ${g.country_name}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
