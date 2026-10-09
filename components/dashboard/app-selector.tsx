"use client"

import * as React from "react"
import { ChevronDown, EyeOff, LayoutGrid } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtCompact } from "@/lib/format"

export type App = {
  apple_id: string
  name: string
  bundle_id: string
  hidden: boolean
  icon_url: string | null
  primary_genre_id: string | null
  primary_genre: string | null
  store_url: string | null
  total_downloads: number
  first_time_downloads: number
}

interface AppSelectorProps {
  apps: App[]
  selectedAppId: string | null
  onSelect: (id: string | null) => void
  onToggleVisibility: (id: string) => void
}

function AppIcon({ app }: { app: App }) {
  return app.icon_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={app.icon_url} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-[9px] border border-border" />
  ) : (
    <div className="h-8 w-8 shrink-0 rounded-[9px] bg-muted" />
  )
}

const rowCls = (selected: boolean) =>
  cn(
    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
    selected ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
  )

/**
 * Vertical app list: a sticky sidebar on wide screens, a collapsible list on narrow ones.
 * Hidden apps are left out entirely; they come back from Settings → Customize.
 */
export function AppSelector({ apps, selectedAppId, onSelect, onToggleVisibility }: AppSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const included = apps.filter((a) => !a.hidden)
  const selected = apps.find((a) => a.apple_id === selectedAppId) || null
  const allDownloads = included.reduce((n, a) => n + a.first_time_downloads, 0)

  const select = (id: string | null) => {
    onSelect(id)
    setOpen(false)
  }

  const renderApp = (app: App) => (
    <li key={app.apple_id} className="group relative">
      <button onClick={() => select(app.apple_id)} className={cn(rowCls(selectedAppId === app.apple_id), "pr-9")}>
        <AppIcon app={app} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{app.name.split(":")[0]}</span>
          <span className="text-[11px] text-muted-foreground">{fmtCompact(app.first_time_downloads)} downloads</span>
        </span>
      </button>
      <button
        onClick={() => onToggleVisibility(app.apple_id)}
        title="Hide app (show it again in Settings → Customize)"
        aria-label={`Hide ${app.name}`}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-opacity hover:bg-background hover:text-foreground focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
      >
        <EyeOff className="h-3.5 w-3.5" />
      </button>
    </li>
  )

  return (
    <nav aria-label="Apps" className="rounded-lg border border-border bg-card">
      {/* Narrow screens: show the current selection; the list folds out below it. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left lg:hidden"
      >
        {selected ? <AppIcon app={selected} /> : <LayoutGrid className="h-5 w-5 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{selected ? selected.name.split(":")[0] : "All Apps"}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <div className={cn("border-t border-border p-1.5 lg:block lg:border-t-0", !open && "hidden")}>
        <div className="hidden px-2 pb-1.5 pt-1 text-xs font-medium text-muted-foreground lg:block">Apps</div>
        <ul className="space-y-0.5">
          <li>
            <button onClick={() => select(null)} className={rowCls(selectedAppId === null)}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-border bg-background">
                <LayoutGrid className="h-4 w-4" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium text-foreground">All Apps</span>
                <span className="text-[11px] text-muted-foreground">{fmtCompact(allDownloads)} downloads</span>
              </span>
            </button>
          </li>
          {included.map(renderApp)}
        </ul>
      </div>
    </nav>
  )
}
