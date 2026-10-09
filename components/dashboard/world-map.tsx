"use client"

import * as React from "react"
// The dot grid is precomputed (lib/world-dots.json, from dotted-map's getMapJSON with
// height 60, diagonal grid), so the browser doesn't download country outlines to build it.
import DottedMap from "dotted-map/without-countries"
import worldDots from "@/lib/world-dots.json"
import { TERRITORY_BY_CODE, countryToFlag } from "@/lib/territories"
import { Section, Segmented } from "./section"
import { MAP_ITEMS, MapItem, UiPrefs } from "@/lib/prefs"
import { fmtMoney, fmtNumber } from "@/lib/format"

export interface SalesTerritory {
  country_code: string
  first_time: number
  redownloads: number
  updates: number
  iap: number
  proceeds: number
}

export interface StoreCountry {
  country_code: string
  available: boolean
  rating: number | null
  rating_count: number
  current_rating: number | null
  current_rating_count: number
  ranks: Record<string, { rank: number; apple_id: string; genre_id: string }>
}

type Metric = UiPrefs["mapMetric"]

// The precomputed grid and every base dot, built once for all maps on the page.
const MAP = new DottedMap({ map: worldDots as any })
const { width: W, height: H } = MAP.image
const BASE_DOTS = MAP.getPoints()
const ZOOM = 1.8
const HOVER_RADIUS = 4 // in map units: how close the pointer must be to pick a country up

type MapPoint = { code: string; value: number; label: string; color: string; weight: number }

const EASE = 0.18 // share of the remaining distance covered per frame

/** The theme's border colour (what the base dots are drawn in), read from the CSS variables. */
function baseDotColor() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--border").trim()
  return v ? `hsl(${v})` : "#27272a"
}

/**
 * Dotted world map with a pin per country. Pointing at the map zooms in around the pointer
 * like a magnifier; the nearest country is focused and gets a tooltip.
 *
 * Smoothness: the dots and pins are drawn once into canvases at zoomed resolution, and only
 * that layer is moved and scaled (GPU-composited), eased in a requestAnimationFrame loop
 * that stops when idle. Zooming around the pointer keeps whatever is under it in place, so
 * moving between countries never makes the map jump.
 */
function InteractiveMap({ points, focus, onFocus, renderTooltip }: {
  points: MapPoint[]
  focus: string | null
  onFocus: (code: string | null) => void
  renderTooltip: (code: string) => React.ReactNode
}) {
  const boxRef = React.useRef<HTMLDivElement>(null)
  const layerRef = React.useRef<HTMLDivElement>(null)
  const baseRef = React.useRef<HTMLCanvasElement>(null)
  const pinsRef = React.useRef<HTMLCanvasElement>(null)
  const tipRef = React.useRef<HTMLDivElement>(null)
  const [size, setSize] = React.useState({ w: 0, h: 0 })
  const [themeKey, setThemeKey] = React.useState(0)

  const pins = React.useMemo(
    () =>
      points.flatMap((p) => {
        const t = TERRITORY_BY_CODE[p.code]
        if (!t) return []
        const { x, y } = MAP.getPin({ lat: t.lat, lng: t.lng })
        return [{ ...p, x, y, r: 0.35 + p.weight * 0.85 }]
      }),
    [points]
  )
  const focused = pins.find((p) => p.code === focus) ?? null
  const focusedRef = React.useRef(focused)
  focusedRef.current = focused

  // Current and target view: zoom anchor (percent of the map box) and scale.
  const view = React.useRef({ ax: 50, ay: 50, s: 1 })
  const target = React.useRef({ ax: 50, ay: 50, s: 1 })
  const raf = React.useRef<number | null>(null)

  // Redraw on resize and theme change (the dot colour comes from the theme).
  React.useEffect(() => {
    const box = boxRef.current!
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(box)
    const mo = new MutationObserver(() => setThemeKey((k) => k + 1))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [])

  // Canvases are sized for the zoomed-in view so they stay sharp at full zoom.
  const prepare = (canvas: HTMLCanvasElement | null) => {
    if (!canvas || !size.w) return null
    const scale = (window.devicePixelRatio || 1) * ZOOM
    canvas.width = Math.round(size.w * scale)
    canvas.height = Math.round(size.h * scale)
    const ctx = canvas.getContext("2d")!
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0)
    return ctx
  }

  React.useEffect(() => {
    const ctx = prepare(baseRef.current)
    if (!ctx) return
    ctx.fillStyle = baseDotColor()
    ctx.beginPath()
    for (const d of BASE_DOTS) {
      ctx.moveTo(d.x + 0.22, d.y)
      ctx.arc(d.x, d.y, 0.22, 0, Math.PI * 2)
    }
    ctx.fill()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, themeKey])

  React.useEffect(() => {
    const ctx = prepare(pinsRef.current)
    if (!ctx) return
    for (const p of pins) {
      if (p.code === focus) continue
      ctx.globalAlpha = focus ? 0.3 : 1
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
    }
    const f = pins.find((p) => p.code === focus)
    if (f) {
      ctx.fillStyle = f.color
      ctx.globalAlpha = 0.22
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.r * 2.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.r * 1.25, 0, Math.PI * 2)
      ctx.fill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, focus, size, themeKey])

  // Ease the view towards its target; stops itself once it arrives.
  const frame = React.useCallback(() => {
    const v = view.current
    const t = target.current
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const k = reduce ? 1 : EASE
    v.ax += (t.ax - v.ax) * k
    v.ay += (t.ay - v.ay) * k
    v.s += (t.s - v.s) * k
    const done = Math.abs(t.ax - v.ax) < 0.01 && Math.abs(t.ay - v.ay) < 0.01 && Math.abs(t.s - v.s) < 0.001
    if (done) Object.assign(v, t)
    if (layerRef.current) {
      layerRef.current.style.transform = `translate(${v.ax * (1 - v.s)}%, ${v.ay * (1 - v.s)}%) scale(${v.s})`
    }
    placeTooltip()
    raf.current = done ? null : requestAnimationFrame(frame)
  }, [])
  const kick = () => {
    if (raf.current == null) raf.current = requestAnimationFrame(frame)
  }
  React.useEffect(() => () => {
    if (raf.current != null) cancelAnimationFrame(raf.current)
  }, [])

  // The tooltip follows the focused country's on-screen position as the view moves.
  const placeTooltip = () => {
    const tip = tipRef.current
    const f = focusedRef.current
    if (!tip || !f) return
    const v = view.current
    const x = v.ax + ((f.x / W) * 100 - v.ax) * v.s
    const y = v.ay + ((f.y / H) * 100 - v.ay) * v.s
    const onRight = x < 60
    tip.style.left = `${x}%`
    tip.style.top = `${Math.min(72, Math.max(28, y))}%`
    tip.style.transform = `translate(${onRight ? "22px" : "calc(-100% - 22px)"}, -50%)`
  }
  React.useLayoutEffect(placeTooltip)

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = boxRef.current!.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * 100
    const py = ((e.clientY - rect.top) / rect.height) * 100
    target.current = { ax: px, ay: py, s: ZOOM }
    kick()
    // What's under the pointer right now, undoing the current (possibly mid-animation) zoom.
    const v = view.current
    const x = ((v.ax + (px - v.ax) / v.s) / 100) * W
    const y = ((v.ay + (py - v.ay) / v.s) / 100) * H
    let best: string | null = null
    let bestDist = HOVER_RADIUS / Math.sqrt(v.s)
    for (const p of pins) {
      const d = Math.hypot(p.x - x, p.y - y)
      if (d < bestDist) {
        best = p.code
        bestDist = d
      }
    }
    if (best !== focus) onFocus(best)
  }

  const onLeave = () => {
    target.current = { ...target.current, s: 1 }
    kick()
    onFocus(null)
  }

  // Focusing from outside (the storefront list): zoom in around that country.
  React.useEffect(() => {
    if (!focused || target.current.s !== 1) return
    target.current = { ax: (focused.x / W) * 100, ay: (focused.y / H) * 100, s: ZOOM }
    kick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused])
  React.useEffect(() => {
    if (focus == null && target.current.s !== 1 && !boxRef.current?.matches(":hover")) {
      target.current = { ...target.current, s: 1 }
      kick()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])

  return (
    <div
      ref={boxRef}
      className="relative w-full touch-none select-none overflow-hidden"
      style={{ aspectRatio: `${W} / ${H}` }}
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerLeave={onLeave}
      role="img"
      aria-label="World map"
    >
      <div ref={layerRef} className="absolute inset-0 will-change-transform" style={{ transformOrigin: "0 0" }}>
        <canvas
          ref={baseRef}
          className="absolute inset-0 h-full w-full transition-opacity duration-200"
          style={{ opacity: focused ? 0.55 : 1 }}
        />
        <canvas ref={pinsRef} className="absolute inset-0 h-full w-full" />
      </div>
      {focused && (
        <div
          ref={tipRef}
          className="pointer-events-none absolute z-10 w-max max-w-[240px] rounded-md border border-border bg-popover px-3 py-2 text-popover-foreground shadow-lg"
          role="status"
        >
          {renderTooltip(focused.code)}
        </div>
      )}
    </div>
  )
}

function CountryTooltip({ code, metric, currency, sales, store, totalDownloads }: {
  code: string
  metric: Metric
  currency: string
  sales?: SalesTerritory
  store?: StoreCountry
  totalDownloads: number
}) {
  const downloads = sales ? sales.first_time + sales.redownloads : 0
  const ranks = Object.entries(store?.ranks || {}).sort((a, b) => a[1].rank - b[1].rank)
  const chartName = (key: string) => {
    const [chart, scope] = key.split(":")
    const name = chart === "topfree" ? "Top Free" : chart === "toppaid" ? "Top Paid" : "Top Grossing"
    return `${name}${scope === "overall" ? " (all apps)" : ""}`
  }
  const rows: { label: string; value: string; on?: boolean }[] = []
  if (sales) {
    rows.push({ label: "Downloads", value: fmtNumber(downloads), on: metric === "downloads" })
    rows.push({ label: "First-time", value: fmtNumber(sales.first_time) })
    if (totalDownloads) rows.push({ label: "Share of downloads", value: `${((downloads / totalDownloads) * 100).toFixed(1)}%` })
    if (sales.proceeds > 0 || metric === "proceeds") rows.push({ label: "Proceeds", value: fmtMoney(sales.proceeds, currency), on: metric === "proceeds" })
    if (sales.iap > 0) rows.push({ label: "In-app purchases", value: fmtNumber(sales.iap) })
  }
  if (store?.rating != null && store.rating_count) {
    rows.push({ label: "Rating", value: `${store.rating.toFixed(2)}★ · ${fmtNumber(store.rating_count)}`, on: metric === "rating" })
  }
  for (const [key, r] of ranks.slice(0, 2)) rows.push({ label: chartName(key), value: `#${r.rank}`, on: metric === "rank" })

  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <span>{countryToFlag(code)}</span>
        {TERRITORY_BY_CODE[code]?.name ?? code}
      </div>
      {rows.length === 0 && <div className="text-muted-foreground">No data in this range</div>}
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-4">
          <span className="text-muted-foreground">{r.label}</span>
          <span className={`tabular-nums ${r.on ? "font-semibold text-foreground" : ""}`}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

function ratingColor(r: number) {
  // 1★ red → 5★ green
  const hue = Math.max(0, Math.min(120, ((r - 1) / 4) * 120))
  return `hsl(${hue}, 70%, 50%)`
}

interface Props {
  sales: SalesTerritory[]
  store: StoreCountry[]
  metric: Metric
  currency: string
  onMetric: (m: Metric) => void
  hidden: MapItem[]
  onHide: () => void
}

const METRICS: Metric[] = ["downloads", "proceeds", "rating", "rank"]

export function WorldMap({ sales, store, metric: picked, currency, onMetric, hidden, onHide }: Props) {
  const metrics = METRICS.filter((m) => !hidden.includes(m))
  // A hidden view can still be the saved choice: show the first one that isn't hidden.
  const metric = metrics.includes(picked) ? picked : metrics[0] ?? "downloads"
  const showList = !hidden.includes("topList")
  const points = React.useMemo(() => {
    const out: { code: string; value: number; label: string; color: string; weight: number }[] = []
    if (metric === "downloads" || metric === "proceeds") {
      const vals = sales.map((t) => ({
        code: t.country_code,
        value: metric === "downloads" ? t.first_time + t.redownloads : t.proceeds,
      }))
      const max = Math.max(1, ...vals.map((v) => v.value))
      for (const v of vals) {
        if (v.value <= 0) continue
        out.push({
          code: v.code,
          value: v.value,
          label: metric === "downloads" ? fmtNumber(v.value) : fmtMoney(v.value, currency),
          color: metric === "downloads" ? "#3b82f6" : "#ec4899",
          weight: Math.log10(v.value + 1) / Math.log10(max + 1),
        })
      }
    } else if (metric === "rating") {
      for (const c of store) {
        if (c.rating == null || !c.rating_count) continue
        out.push({ code: c.country_code, value: c.rating, label: `${c.rating.toFixed(2)}★ (${fmtNumber(c.rating_count)})`, color: ratingColor(c.rating), weight: Math.min(1, 0.35 + Math.log10(c.rating_count + 1) / 3) })
      }
    } else {
      for (const c of store) {
        const best = Math.min(...Object.values(c.ranks).map((r) => r.rank))
        if (!Number.isFinite(best)) continue
        out.push({ code: c.country_code, value: best, label: `#${best}`, color: "#f59e0b", weight: 1 - (best - 1) / 100 })
      }
    }
    return out.sort((a, b) => (metric === "rank" ? a.value - b.value : b.value - a.value))
  }, [sales, store, metric, currency])

  const salesByCode = React.useMemo(() => new Map(sales.map((t) => [t.country_code, t])), [sales])
  const storeByCode = React.useMemo(() => new Map(store.map((c) => [c.country_code, c])), [store])
  const totalDownloads = React.useMemo(() => sales.reduce((n, t) => n + t.first_time + t.redownloads, 0), [sales])
  const [focus, setFocus] = React.useState<string | null>(null)

  return (
    <Section
      title={metrics.length === 1 ? `World Map · ${MAP_ITEMS[metric].replace(" view", "")}` : "World Map"}
      onHide={onHide}
      actions={
        metrics.length > 1 && <Segmented
          value={metric}
          onChange={onMetric}
          options={metrics.map((m) => ({ value: m, label: MAP_ITEMS[m].replace(" view", "") }))}
        />
      }
    >
      {/* The list sits beside the map when the card is wide enough and wraps below it otherwise
          (e.g. when the map shares a row), instead of being pushed past the card's edge. */}
      <div className="flex flex-wrap gap-4">
        <div className="min-w-0 flex-[3_1_320px] self-start">
          <InteractiveMap
            points={points}
            focus={focus}
            onFocus={setFocus}
            renderTooltip={(code) => (
              <CountryTooltip
                code={code}
                metric={metric}
                currency={currency}
                sales={salesByCode.get(code)}
                store={storeByCode.get(code)}
                totalDownloads={totalDownloads}
              />
            )}
          />
        </div>
        {showList && <div className="min-w-0 flex-[1_1_200px] text-sm">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            {metric === "rank" ? "Best chart positions" : "Top storefronts"}
          </div>
          {points.length === 0 && <div className="text-xs text-muted-foreground">No data yet</div>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-6 gap-y-1.5">
            {points.slice(0, 8).map((p) => {
              const name = TERRITORY_BY_CODE[p.code]?.name ?? p.code
              return (
                <div
                  key={p.code}
                  onMouseEnter={() => setFocus(p.code)}
                  onMouseLeave={() => setFocus(null)}
                  className={`-mx-1.5 flex min-w-0 cursor-default items-center justify-between gap-2 rounded px-1.5 transition-colors ${focus === p.code ? "bg-accent" : ""}`}
                >
                  <span className="flex min-w-0 items-center gap-1.5" title={name}>
                    <span className="shrink-0">{countryToFlag(p.code)}</span>
                    <span className="truncate">{name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{p.label}</span>
                </div>
              )
            })}
          </div>
        </div>}
      </div>
    </Section>
  )
}
