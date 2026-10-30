'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

// How far to pull (after damping) before letting go reloads the page.
const PULL_TRIGGER = 64
const PULL_MAX = 96

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

/**
 * What the installed app needs that a browser tab gives for free: the offline screen, and pull
 * to refresh (a home screen app has no reload button). Rendered once in each root layout.
 */
export function AppShell() {
  const [pull, setPull] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [reloading, setReloading] = useState(false)
  const start = useRef<{ y: number; x: number } | null>(null)
  const pulled = useRef(0)

  useEffect(() => {
    // Only the offline screen is cached (public/sw.js); pages and data always come from the server.
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    // The studio's editor has its own gestures, and a browser tab already pulls to refresh.
    if (!standalone() || location.pathname.startsWith('/studio')) return
    const root = document.documentElement
    root.dataset.standalone = ''

    const pulling = (e: TouchEvent) => {
      const t = e.target as Element | null
      return (
        window.scrollY <= 0 &&
        e.touches.length === 1 &&
        !document.querySelector('[role="dialog"]') &&
        !t?.closest('input, textarea, select, [contenteditable], [data-no-pull]')
      )
    }
    const show = (px: number) => {
      pulled.current = px
      setPull(px)
    }
    const onStart = (e: TouchEvent) => {
      start.current = pulling(e) ? { y: e.touches[0].clientY, x: e.touches[0].clientX } : null
      setDragging(!!start.current)
    }
    const onMove = (e: TouchEvent) => {
      if (!start.current) return
      const dy = e.touches[0].clientY - start.current.y
      const dx = Math.abs(e.touches[0].clientX - start.current.x)
      // A sideways swipe (a chart, a scrolling table) or scrolling up isn't a pull.
      if (dy <= 0 || dx > dy || window.scrollY > 0) {
        start.current = null
        setDragging(false)
        show(0)
        return
      }
      show(Math.min(PULL_MAX, dy * 0.5))
    }
    const onEnd = () => {
      if (!start.current) return
      start.current = null
      setDragging(false)
      if (pulled.current >= PULL_TRIGGER) {
        show(PULL_TRIGGER)
        setReloading(true)
        location.reload()
      } else show(0)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      delete root.dataset.standalone
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  if (!pull && !reloading) return null
  const progress = Math.min(1, pull / PULL_TRIGGER)
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-50 flex justify-center"
      style={{ transform: `translateY(${pull}px)`, transition: dragging ? 'none' : 'transform 0.2s ease-out' }}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background shadow-md" style={{ opacity: Math.max(0.3, progress) }}>
        <RefreshCw
          className={cn('h-4 w-4', progress >= 1 ? 'text-tint' : 'text-muted-foreground', reloading && 'animate-spin')}
          style={reloading ? undefined : { transform: `rotate(${progress * 270}deg)` }}
        />
      </div>
    </div>
  )
}
