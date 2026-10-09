'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Loader2, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Segmented, Toggle } from '@/components/dashboard/section'
import { DEFAULT_PREFS, SHARE_HEROES, SHARE_STATS, ShareHeroId, ShareStatId, UiPrefs, monthRangeLabel } from '@/lib/prefs'
import type { App } from '@/components/dashboard/app-selector'
import { cn } from '@/lib/utils'

const RANGES = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '365d': 'Last 12 months',
  ytd: 'Year to date',
  all: 'All time',
} as const
type Range = UiPrefs['share']['range']
type Theme = 'dark' | 'light'
type Format = '4x5' | '9x16'

const selectCls =
  'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** One preview; shows a spinner until the server has rendered (or served from cache) the PNG. */
function Preview({ src, alt, format, onOpen }: { src: string; alt: string; format: Format; onOpen: () => void }) {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => setLoaded(false), [src])
  return (
    <button
      onClick={onOpen}
      className={cn(
        'group relative block w-full overflow-hidden rounded-lg border border-border bg-card',
        format === '4x5' ? 'aspect-[4/5]' : 'aspect-[9/16]'
      )}
      aria-label={`Enlarge ${alt}`}
    >
      {!loaded && (
        <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" onLoad={() => setLoaded(true)} className={cn('h-full w-full object-cover transition-opacity', loaded ? 'opacity-100' : 'opacity-0')} />
      <span className="absolute right-2 top-2 rounded-md bg-background/80 p-1.5 text-foreground opacity-0 transition-opacity group-hover:opacity-100">
        <Maximize2 className="h-4 w-4" />
      </span>
    </button>
  )
}

export function ShareStudio() {
  const [apps, setApps] = useState<App[]>([])
  const [months, setMonths] = useState<string[]>([])
  const [share, setShare] = useState<UiPrefs['share']>(DEFAULT_PREFS.share)
  const [loaded, setLoaded] = useState(false)
  const { format, range, theme } = share
  const [busy, setBusy] = useState<string | null>(null)
  // Browsers block file downloads on plain http:// pages (except localhost).
  const [secure, setSecure] = useState(true)
  useEffect(() => setSecure(window.isSecureContext), [])

  // Card settings live with the rest of the dashboard prefs, so they're kept between visits.
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => d.prefs?.share && setShare(d.prefs.share))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const update = (patch: Partial<UiPrefs['share']>) => {
    setShare((prev) => {
      const next = { ...prev, ...patch }
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefs: { share: next } }),
        }).catch(() => {})
      }, 400)
      return next
    })
  }
  const setFormat = (format: Format) => update({ format })
  const setTheme = (theme: Theme) => update({ theme })
  const setRange = (range: Range) => update({ range })
  const toggleStat = (id: ShareStatId) =>
    update({ stats: share.stats.includes(id) ? share.stats.filter((s) => s !== id) : [...share.stats, id] })
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    fetch('/api/apps')
      .then((r) => r.json())
      .then((d) => {
        setApps((d.apps || []).filter((a: App) => !a.hidden))
        setMonths(d.months || [])
      })
      .catch(() => {})
  }, [])

  const cards = [{ id: 'all', name: 'All Apps' }, ...apps.map((a) => ({ id: a.apple_id, name: a.name.split(':')[0] }))]
  const url = (id: string) =>
    `/api/share?app=${id}&range=${range}&format=${format}&theme=${theme}&hero=${share.hero}&stats=${share.stats.join(',')}&list=${share.showList ? 1 : 0}`
  const fileName = (name: string) => `${slug(name)}-${range.replace('m:', '')}-${format === '4x5' ? '1080x1350' : '1080x1920'}.png`

  // The previews already rendered these, so downloads come straight from the server's cache.
  const download = async (id: string, name: string) => {
    if (!secure) {
      // No download possible here: open the full-size PNG so it can be saved from the tab.
      window.open(url(id), '_blank', 'noopener')
      return
    }
    const res = await fetch(url(id))
    if (!res.ok) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(await res.blob())
    a.download = fileName(name)
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex min-h-16 max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Back to dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-lg font-semibold tracking-tight">Share cards</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={format}
              onChange={setFormat}
              options={[
                { value: '4x5', label: '4:5 · 1080×1350' },
                { value: '9x16', label: '9:16 · 1080×1920' },
              ]}
            />
            <Segmented
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
            <select value={range} onChange={(e) => setRange(e.target.value as Range)} className={selectCls} aria-label="Date range">
              {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((r) => <option key={r} value={r}>{RANGES[r]}</option>)}
              {months.length > 0 && (
                <optgroup label="Month">
                  {months.map((m) => <option key={m} value={`m:${m}`}>{monthRangeLabel(m)}</option>)}
                </optgroup>
              )}
            </select>
            <Button size="sm" onClick={() => run('all-cards', async () => { for (const c of cards) await download(c.id, c.name) })} disabled={!!busy || !secure} title={secure ? undefined : 'Needs https://'} className="gap-2">
              {busy === 'all-cards' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download all
            </Button>
          </div>
        </div>
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-2.5 sm:px-6 lg:px-8">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            Big number
            <select value={share.hero} onChange={(e) => update({ hero: e.target.value as ShareHeroId })} className={selectCls} aria-label="Big number">
              {(Object.keys(SHARE_HEROES) as ShareHeroId[]).map((h) => <option key={h} value={h}>{SHARE_HEROES[h]}</option>)}
            </select>
          </label>
          <span className="text-xs font-medium text-muted-foreground">Tiles</span>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(SHARE_STATS) as ShareStatId[]).map((id) => {
              const position = share.stats.indexOf(id)
              return (
                <Toggle key={id} active={position >= 0} onClick={() => toggleStat(id)}>
                  {position >= 0 && <span className="tabular-nums text-muted-foreground">{position + 1}</span>}
                  {SHARE_STATS[id]}
                </Toggle>
              )
            })}
          </div>
          <span className="text-xs font-medium text-muted-foreground">Sections</span>
          <Toggle active={share.showList} onClick={() => update({ showList: !share.showList })}>
            Top Markets / Top Apps
          </Toggle>
          <span className="text-[11px] text-muted-foreground">
            Tiles appear in the order you turn them on. 4:5 shows up to 4, 9:16 up to 6.
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
        {!secure && (
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            <div className="font-medium">Downloads need https://</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Your browser blocks downloads on http:// pages. Open OpenConnect at its Tailscale address
              (https://openconnect.&lt;your-tailnet&gt;.ts.net) to download. Until then, PNG opens the full-size card
              in a new tab: right-click it and choose Save image as.
            </div>
          </div>
        )}
        <div className={cn('grid gap-6', format === '4x5' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4')}>
          {loaded && cards.map((c) => (
            <figure key={c.id} className="space-y-2">
              <Preview src={url(c.id)} alt={`${c.name} share card`} format={format} onOpen={() => setOpen(c)} />
              <figcaption className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{c.name}</span>
                <Button variant="outline" size="sm" className="gap-1.5" disabled={!!busy} onClick={() => run(c.id, () => download(c.id, c.name))}>
                  {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  PNG
                </Button>
              </figcaption>
            </figure>
          ))}
        </div>
      </main>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="w-auto max-w-[95vw] gap-3 p-3 sm:max-w-[95vw]">
          <DialogTitle className="sr-only">{open?.name} share card</DialogTitle>
          {open && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url(open.id)}
                alt={`${open.name} share card`}
                className={cn('max-h-[82vh] w-auto rounded-md', format === '4x5' ? 'aspect-[4/5]' : 'aspect-[9/16]')}
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{open.name}</span>
                <Button size="sm" className="gap-1.5" disabled={!!busy} onClick={() => run(open.id, () => download(open.id, open.name))}>
                  {busy === open.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Download PNG
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
