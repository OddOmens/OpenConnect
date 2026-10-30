'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/dashboard/section'
import {
  PROMO_ACCENTS, PROMO_FORMATS, PROMO_FRAMES, PROMO_STYLES, PROMO_TEMPLATES, REVIEW_COUNTS,
  type PromoCardSettings, type PromoFormatId, type PromoStyleId, type PromoTemplateId, type ReviewCount, type UiPrefs,
} from '@/lib/prefs'
import { PROMO_USES, type ResolvedPromo } from '@/lib/promo-settings'
import { cn } from '@/lib/utils'
import { ScreenThumb, type PromoScreens } from './screen-thumb'
import { inputCls, selectSmCls, textareaCls } from '@/components/ui/field'

type Marketing = UiPrefs['marketing']
type TextKey = 'headline' | 'tagline' | 'cta' | 'notes'

const TEXT_LABELS: Record<TextKey, string> = { headline: 'Headline', tagline: 'Tagline', cta: 'Button text', notes: 'Release notes' }

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-2.5 border-b border-border px-4 py-4 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

/** "All cards" (use the toolbar's), or this card's own on / off. */
function TriState({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
  return (
    <Segmented
      value={value === undefined ? 'all' : value ? 'on' : 'off'}
      onChange={(v) => onChange(v === 'all' ? undefined : v === 'on')}
      options={[
        { value: 'all', label: 'All cards' },
        { value: 'on', label: 'Show' },
        { value: 'off', label: 'Hide' },
      ]}
    />
  )
}

/** A text setting typed here, saved a moment after typing stops (each save re-renders the card). */
function TextField({ label, value, placeholder, multiline, maxLength, onCommit }: {
  label: string
  value: string
  placeholder: string
  multiline?: boolean
  maxLength: number
  onCommit: (v: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const change = (v: string) => {
    setDraft(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onCommit(v), 600)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea value={draft} onChange={(e) => change(e.target.value)} placeholder={placeholder} maxLength={maxLength} rows={label === 'Release notes' || label === 'Features' ? 5 : 3} className={cn(textareaCls, 'resize-y')} />
      ) : (
        <input value={draft} onChange={(e) => change(e.target.value)} placeholder={placeholder} maxLength={maxLength} className={inputCls} />
      )}
    </label>
  )
}

/**
 * The popup for one promo card: a large preview, and beside it everything that card uses. Each
 * setting starts as "all cards" (the toolbar's) until it's changed here; Reset clears them all.
 */
export function PromoCardEditor({ template, appId, mk, updateMk, info, toolbarShots, resolved, url, placeholder: firstImage, aspect, busy, onDownload }: {
  template: PromoTemplateId
  appId: string
  mk: Marketing
  updateMk: (patch: Partial<Marketing>) => void
  info: PromoScreens | null
  toolbarShots: string[]
  resolved: ResolvedPromo
  url: string
  placeholder?: string // shown until `url` has loaded (the grid's preview, already in the browser)
  aspect: string
  busy: boolean
  onDownload: () => void
}) {
  const uses = PROMO_USES[template]
  const own: PromoCardSettings = mk.cards[appId]?.[template] ?? {}
  const appCopy = mk.copy[appId] ?? {}
  const setOwn = (patch: PromoCardSettings) => {
    const next: PromoCardSettings = { ...own, ...patch }
    for (const k of Object.keys(next) as (keyof PromoCardSettings)[]) {
      const v = next[k]
      if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete next[k]
    }
    updateMk({ cards: { ...mk.cards, [appId]: { ...mk.cards[appId], [template]: next } } })
  }
  const reset = () => {
    const rest = { ...mk.cards[appId] }
    delete rest[template]
    updateMk({ cards: { ...mk.cards, [appId]: rest } })
  }
  const edited = Object.keys(own).length > 0

  // The preview keeps showing the last image until the next one has loaded (a hidden <img> loads it).
  const [shown, setShown] = useState(firstImage ?? url)
  const loading = url !== shown

  // Screenshots: this card's own picks, else the toolbar's.
  const ownShots = own.shots ?? []
  const cardShots = ownShots.length ? ownShots : toolbarShots
  const toggleShot = (id: string) => setOwn({ shots: cardShots.includes(id) ? cardShots.filter((x) => x !== id) : [...cardShots, id] })

  // Reviews: this card's picks, the first in front, else the best short ones.
  const reviewCount = resolved.reviewCount
  const ownQuotes = (own.quotes ?? []).slice(0, reviewCount)
  const toggleQuote = (i: number) =>
    setOwn({ quotes: ownQuotes.includes(i) ? ownQuotes.filter((x) => x !== i) : [...ownQuotes, i].slice(-reviewCount) })

  const placeholder = (k: TextKey) => {
    // The toolbar's notes are release notes, not a feature list.
    const fromAll = template === 'feature' && k === 'notes' ? undefined : appCopy[k]
    if (fromAll) return fromAll
    const own = info?.copy[template]?.[k]
    if (k === 'cta') return 'Download on the App Store'
    return own || (k === 'tagline' ? 'No tagline' : '')
  }

  return (
    <div className="flex max-h-[90vh] w-[min(95vw,1200px)] flex-col overflow-hidden md:flex-row">
      <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/30 p-4">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt={`${PROMO_TEMPLATES[template]} card`} className={cn('max-h-[50vh] w-auto max-w-full rounded-md shadow-xs md:max-h-[84vh]', aspect)} />
          {loading && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="hidden" onLoad={() => setShown(url)} onError={() => setShown(url)} />
              <span className="absolute right-2 top-2 rounded-md bg-background/80 p-1.5">
                <Loader2 className="h-4 w-4 animate-spin" />
              </span>
            </>
          )}
        </div>
      </div>

      <aside className="flex w-full shrink-0 flex-col border-t border-border md:w-[380px] md:border-l md:border-t-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{PROMO_TEMPLATES[template]}</div>
            <div className="text-xs text-muted-foreground">{edited ? 'This card has its own settings' : 'Same as all cards'}</div>
          </div>
          <Button variant="ghost" size="sm" className="gap-1.5" disabled={!edited} onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title="Look">
            <Row label="Size">
              <select
                value={own.format ?? ''}
                onChange={(e) => setOwn({ format: (e.target.value || undefined) as PromoFormatId | undefined })}
                className={selectSmCls}
                aria-label="Size"
              >
                <option value="">All cards ({PROMO_FORMATS[mk.format].split(' · ')[0]})</option>
                {(Object.keys(PROMO_FORMATS) as PromoFormatId[]).map((f) => <option key={f} value={f}>{PROMO_FORMATS[f]}</option>)}
              </select>
            </Row>
            <Row label="Style">
              <select
                value={own.style ?? ''}
                onChange={(e) => setOwn({ style: (e.target.value || undefined) as PromoStyleId | undefined })}
                className={selectSmCls}
                aria-label="Style"
              >
                <option value="">All cards ({PROMO_STYLES[mk.style]})</option>
                {(Object.keys(PROMO_STYLES) as PromoStyleId[]).map((st) => <option key={st} value={st}>{PROMO_STYLES[st]}</option>)}
              </select>
            </Row>
            <Row label="Accent">
              <button
                onClick={() => setOwn({ accent: undefined })}
                className={cn('h-6 rounded-full border px-2 text-[11px]', own.accent ? 'border-border text-muted-foreground' : 'border-foreground')}
                title="Same as all cards"
              >
                All
              </button>
              {PROMO_ACCENTS.map((c) => (
                <button
                  key={c}
                  onClick={() => setOwn({ accent: c })}
                  aria-label={`Accent ${c}`}
                  className={cn('h-6 w-6 rounded-full border-2', own.accent === c ? 'border-foreground' : 'border-transparent')}
                  style={{ background: c }}
                />
              ))}
              <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-border" title="Custom color" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
                <input type="color" value={resolved.accent} onChange={(e) => setOwn({ accent: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom accent color" />
              </label>
            </Row>
            {uses.shots > 0 && (
              <Row label="iPhone">
                <button
                  onClick={() => setOwn({ frameColor: undefined })}
                  className={cn('h-6 rounded-full border px-2 text-[11px]', own.frameColor ? 'border-border text-muted-foreground' : 'border-foreground')}
                  title="Same as all cards"
                >
                  All
                </button>
                {(Object.keys(PROMO_FRAMES) as (keyof typeof PROMO_FRAMES)[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setOwn({ frameColor: c })}
                    title={PROMO_FRAMES[c]}
                    aria-label={`${PROMO_FRAMES[c]} iPhone`}
                    className={cn('h-6 w-6 rounded-full border-2', own.frameColor === c ? 'border-foreground' : 'border-transparent')}
                    style={{ background: `linear-gradient(135deg, ${c}, ${c}cc)` }}
                  />
                ))}
              </Row>
            )}
            <Row label="App Store button">
              <TriState value={own.showBadge} onChange={(v) => setOwn({ showBadge: v })} />
            </Row>
            {uses.rating && (
              <Row label="Rating">
                <TriState value={own.showRating} onChange={(v) => setOwn({ showRating: v })} />
              </Row>
            )}
          </Section>

          <Section title="Text">
            {uses.text.map((k) => (
              <TextField
                key={`${template}-${k}`}
                label={k === 'notes' && template === 'feature' ? 'Features' : TEXT_LABELS[k]}
                value={own[k] ?? ''}
                placeholder={placeholder(k)}
                multiline={k === 'headline' || k === 'notes' || k === 'tagline'}
                maxLength={k === 'notes' ? 1200 : k === 'cta' ? 40 : k === 'headline' ? 120 : 240}
                onCommit={(v) => setOwn({ [k]: v })}
              />
            ))}
            <p className="text-[11px] text-muted-foreground">Empty uses the text for all cards, or the template&apos;s own (shown faded). Line breaks in a headline are kept.</p>
          </Section>

          {uses.shots > 0 && (
            <Section
              title="Screenshots"
              aside={ownShots.length > 0 && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOwn({ shots: undefined })} title="Use the toolbar's screenshots">Reset</Button>}
            >
              <p className="text-[11px] text-muted-foreground">
                {ownShots.length ? 'This card’s own, in order.' : 'Same as all cards. Click to give this card its own.'} It shows up to {uses.shots}
                {template === 'update' ? ' (on 16:9 only)' : ''}.
              </p>
              {!info ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : info.screens.length ? (
                <div className="flex flex-wrap gap-2.5 pt-1">
                  {info.screens.map((x) => (
                    <ScreenThumb key={x.id} shot={x} order={cardShots.indexOf(x.id) + 1} frame={resolved.frameColor} onClick={() => toggleShot(x.id)} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No screenshots for this app yet.</p>
              )}
            </Section>
          )}

          {uses.quotes && (
            <Section
              title="Reviews"
              aside={ownQuotes.length > 0 && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOwn({ quotes: undefined })} title="Use the best short reviews">Reset</Button>}
            >
              <Row label="Show">
                <Segmented
                  value={String(reviewCount)}
                  onChange={(v) => setOwn({ reviewCount: v === '1' ? 1 : undefined })}
                  options={([3, 1] as ReviewCount[]).map((n) => ({ value: String(n), label: REVIEW_COUNTS[n] }))}
                />
              </Row>
              <p className="text-[11px] text-muted-foreground">
                {reviewCount === 1
                  ? ownQuotes.length ? 'Picked.' : 'The best short 5★ review. Pick one to choose it yourself.'
                  : ownQuotes.length ? 'Picked, in order: the first in front, the others fanned out behind it.' : 'The best short 5★ reviews. Pick up to 3 to choose them yourself; the first goes in front.'}
              </p>
              {!info ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : info.quotes.length ? (
                <ul className="space-y-1.5">
                  {info.quotes.map((q) => {
                    const order = ownQuotes.indexOf(q.index) + 1
                    return (
                      <li key={q.index}>
                        <button
                          onClick={() => toggleQuote(q.index)}
                          aria-pressed={order > 0}
                          className={cn('flex w-full gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors', order > 0 ? 'border-foreground/40 bg-accent' : 'border-border hover:bg-accent/50')}
                        >
                          <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold', order > 0 ? 'bg-primary text-primary-foreground' : 'border border-border')}>{order || ''}</span>
                          <span className="min-w-0">
                            <span className="line-clamp-2">“{q.body}”</span>
                            <span className="text-muted-foreground">{q.reviewer}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No short 5★ written reviews yet.</p>
              )}
            </Section>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button size="sm" className="gap-1.5" disabled={busy} onClick={onDownload}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download PNG
          </Button>
        </div>
      </aside>
    </div>
  )
}
