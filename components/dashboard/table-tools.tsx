"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, Columns3, Search } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { TableHead } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export function useSort<K extends string>(initial: K, initialDir: "asc" | "desc" = "desc") {
  const [key, setKey] = React.useState<K>(initial)
  const [dir, setDir] = React.useState<"asc" | "desc">(initialDir)
  const toggle = (k: K, defaultDir: "asc" | "desc" = "desc") => {
    if (k === key) setDir(dir === "asc" ? "desc" : "asc")
    else {
      setKey(k)
      setDir(defaultDir)
    }
  }
  return { key, dir, toggle }
}

/** Sort with nulls always last regardless of direction. */
export function sortRows<T>(rows: T[], get: (r: T) => number | string | null | undefined, dir: "asc" | "desc") {
  return [...rows].sort((a, b) => {
    const va = get(a)
    const vb = get(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    const c = typeof va === "string" ? va.localeCompare(String(vb)) : (va as number) - (vb as number)
    return dir === "asc" ? c : -c
  })
}

export function SortHead({
  label, active, dir, onClick, className,
}: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void; className?: string }) {
  return (
    <TableHead className={cn("whitespace-nowrap", className)}>
      <button onClick={onClick} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
        {label}
        {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TableHead>
  )
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Search"}
        className="h-8 w-36 rounded-md border border-input bg-background pl-7 pr-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-44"
      />
    </div>
  )
}

export function ColumnPicker<K extends string>({
  columns, hidden, onChange,
}: { columns: Record<K, string>; hidden: K[]; onChange: (hidden: K[]) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs">
          <Columns3 className="h-3.5 w-3.5" /> Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs">Show columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(Object.keys(columns) as K[]).map((k) => (
          <DropdownMenuCheckboxItem
            key={k}
            checked={!hidden.includes(k)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) => onChange(on ? hidden.filter((h) => h !== k) : [...hidden, k])}
          >
            {columns[k]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
