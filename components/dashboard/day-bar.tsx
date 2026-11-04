"use client"

import * as React from "react"
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { addDays, pacificToday } from "@/lib/dates"
import { fmtDate } from "@/lib/format"
import { selectCls } from "@/components/ui/field"
import { cn } from "@/lib/utils"

interface Props {
  day: string
  /** First and last day Apple has sent a daily report for. */
  daily: { first: string | null; last: string | null } | null
  onDay: (day: string) => void
}

/** The heading of the one-day view: step day by day, or jump to any day. Days are Apple's report days (Pacific time). */
export const DayBar = React.forwardRef<HTMLInputElement, Props>(function DayBar({ day, daily, onDay }, inputRef) {
  const today = pacificToday()
  const name = day === today ? "Today" : day === addDays(today, -1) ? "Yesterday" : fmtDate(day, { weekday: "long" })
  const first = daily?.first ?? undefined

  let note: React.ReactNode
  if (!daily?.last || day > daily.last) {
    note = (
      <>
        Apple hasn&apos;t published this day yet: daily reports arrive the morning after, Pacific time
        {daily?.last ? `. The latest is ${fmtDate(daily.last, { weekday: "short", month: "short", day: "numeric" })}.` : "."} Ratings, rankings and reviews always show the latest.
      </>
    )
  } else if (first && day < first) {
    note = "Apple only keeps daily reports for a year, so this day is part of a monthly or yearly total and has no numbers of its own."
  } else {
    note = "Compared with the day before. Days follow Apple’s reports, in Pacific time."
  }
  const pending = !daily?.last || day > daily.last

  return (
    <Card className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => onDay(addDays(day, -1))} disabled={!!first && day <= first} aria-label="Previous day" title="Previous day">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 px-1">
          <div className="text-lg font-semibold leading-tight tracking-tight">{name}</div>
          <div className="text-xs text-muted-foreground">{fmtDate(day, { month: "long", day: "numeric", year: "numeric" })}</div>
        </div>
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => onDay(addDays(day, 1))} disabled={day >= today} aria-label="Next day" title="Next day">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <label className="relative">
        <span className="sr-only">Go to a day</span>
        <CalendarDays className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="date"
          value={day}
          min={first}
          max={today}
          onChange={(e) => e.target.value && onDay(e.target.value > today ? today : e.target.value)}
          className={cn(selectCls, "pl-8")}
        />
      </label>

      <div className="flex gap-1">
        {[
          { label: "Today", d: today },
          { label: "Yesterday", d: addDays(today, -1) },
        ].map((b) => (
          <Button key={b.label} variant={b.d === day ? "secondary" : "ghost"} size="sm" className="h-8 px-2.5 text-xs" onClick={() => onDay(b.d)}>
            {b.label}
          </Button>
        ))}
      </div>

      <p className={cn("flex basis-full items-start gap-1.5 text-xs text-muted-foreground lg:ml-auto lg:basis-auto lg:max-w-md lg:text-right", pending && "text-amber-600 dark:text-amber-400")}>
        {pending && <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        <span>{note}</span>
      </p>
    </Card>
  )
})
