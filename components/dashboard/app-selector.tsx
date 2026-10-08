"use client"

import * as React from "react"
import { Eye, EyeOff, LayoutGrid } from "lucide-react"
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
  showHidden: boolean
}

export function AppSelector({ apps, selectedAppId, onSelect, onToggleVisibility, showHidden }: AppSelectorProps) {
  const list = showHidden ? apps : apps.filter((a) => !a.hidden || a.apple_id === selectedAppId)
  return (
    <div className="hide-scrollbar flex w-full items-center gap-2 overflow-x-auto pb-1">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "flex h-12 flex-shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
          selectedAppId === null ? "border-foreground/30 bg-accent text-foreground" : "border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        )}
      >
        <LayoutGrid className="h-4 w-4" />
        All Apps
      </button>

      {list.map((app) => (
        <div
          key={app.apple_id}
          className={cn(
            "group flex h-12 flex-shrink-0 items-center gap-2 rounded-lg border pl-1.5 pr-1 transition-colors",
            selectedAppId === app.apple_id ? "border-foreground/30 bg-accent text-foreground" : "border-border text-muted-foreground hover:bg-accent/50",
            app.hidden && "opacity-50"
          )}
        >
          <button onClick={() => onSelect(app.apple_id)} className="flex items-center gap-2 text-left">
            {app.icon_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={app.icon_url} alt="" className="h-8 w-8 rounded-[9px] border border-border" />
            ) : (
              <div className="h-8 w-8 rounded-[9px] bg-muted" />
            )}
            <span className="flex flex-col">
              <span className="max-w-[160px] truncate text-sm font-medium text-foreground">{app.name.split(":")[0]}</span>
              <span className="text-[11px] text-muted-foreground">{fmtCompact(app.total_downloads)} downloads</span>
            </span>
          </button>
          <button
            onClick={() => onToggleVisibility(app.apple_id)}
            title={app.hidden ? "Include in All Apps" : "Exclude from All Apps"}
            className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100"
          >
            {app.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
      ))}
    </div>
  )
}
