'use client'

import type { PromoTemplateId } from '@/lib/prefs'
import { cn } from '@/lib/utils'

/** What the Marketing page knows about one app's promo cards (from /api/marketing/promo). */
export interface PromoScreens {
  studio: { id: string; name: string } | null
  screens: { id: string; source: 'studio' | 'store'; label: string; thumb: string; ratio: number }[]
  defaults: string[]
  copy: Record<PromoTemplateId, { headline: string; tagline: string; cta: string; notes: string }>
  quotes: { index: number; body: string; reviewer: string; rating: number }[]
}

/** A screenshot as a small iPhone, numbered when the cards use it. */
export function ScreenThumb({ shot, order, frame, onClick }: { shot: PromoScreens['screens'][number]; order: number; frame: string; onClick: () => void }) {
  const on = order > 0
  const w = 44
  return (
    <button
      onClick={onClick}
      title={`${shot.label}${on ? ` (${order})` : ''}`}
      aria-pressed={on}
      className={cn('relative shrink-0 rounded-[10px] p-[2px] transition', on ? 'opacity-100' : 'opacity-40 hover:opacity-80')}
      style={{ background: frame }}
    >
      <span className="block overflow-hidden rounded-[8px] bg-black p-[1.5px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot.thumb} alt={shot.label} loading="lazy" className="block rounded-[7px] object-cover" style={{ width: w, height: Math.round(w * shot.ratio) }} />
      </span>
      <span className="absolute left-1/2 top-[5px] h-[3px] w-[13px] -translate-x-1/2 rounded-full bg-black" />
      {on && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
          {order}
        </span>
      )}
    </button>
  )
}

