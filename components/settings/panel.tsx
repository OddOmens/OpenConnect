"use client"

import * as React from "react"

/** A titled card on the Settings page. */
export function Panel({ title, description, children, footer }: { title: string; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="space-y-1 border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-5 px-5 py-5">{children}</div>
      {footer && <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3">{footer}</div>}
    </section>
  )
}

/** A label (and optional hint) with its control on the right. */
export function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
