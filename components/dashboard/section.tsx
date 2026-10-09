"use client"

import * as React from "react"
import { EyeOff } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface SectionProps {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  onHide?: () => void
  className?: string
  contentClassName?: string
  children: React.ReactNode
}

/** Card wrapper used by every dashboard section; the eye button hides the section (restore it in Settings → Customize). */
export function Section({ title, description, actions, onHide, className, contentClassName, children }: SectionProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-4">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {onHide && (
            <button
              onClick={onHide}
              title="Hide this section"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <EyeOff className="h-4 w-4" />
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  className?: string
}

export function Segmented<T extends string>({ value, options, onChange, className }: SegmentedProps<T>) {
  return (
    <div className={cn("inline-flex rounded-md border border-border bg-background p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.value ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        active ? "border-border bg-accent text-foreground" : "border-transparent text-muted-foreground line-through opacity-60 hover:opacity-100"
      )}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </button>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[120px] items-center justify-center px-4 text-center text-sm text-muted-foreground">{children}</div>
}

export function Stars({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span className="relative inline-block text-[13px] leading-none tracking-[1px] text-muted-foreground/40">
        ★★★★★
        <span className="absolute inset-0 overflow-hidden text-amber-600 dark:text-amber-400" style={{ width: `${(value / 5) * 100}%` }}>
          ★★★★★
        </span>
      </span>
      <span>{value.toFixed(2)}</span>
    </span>
  )
}
