"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, ListChecks, RefreshCw } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { fmtDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { SyncReport } from "@/lib/sync-report"
import { SyncReportDialog } from "./sync-report"

type JobId = "asc" | "store"

interface JobState {
  id: JobId
  running: boolean
  phase: string
  done: number
  total: number
  errors: string[]
  summary: string | null
}

interface Coverage {
  reportType: string
  granularity: "D" | "M" | "Y"
  expected: number
  ok: number
  empty: number
  error: number
  missing: number
  first: string | null
  last: string | null
  latestOk: string | null
  lastError: string | null
}

interface RunRecord {
  id: number
  trigger: string | null
  started_at: string
  finished_at: string
  status: string
  message: string
  report: SyncReport | null
}

interface SyncStatusData {
  jobs: Record<JobId, JobState>
  lastRuns: Record<JobId, RunRecord | null>
  coverage: { reports: Coverage[] }
  config: { autoSyncHours: number; storeSyncHours: number }
}

/**
 * Polls sync status; fast while a job runs, slow otherwise (to notice scheduled runs).
 * Runs started from this browser open a report of what changed when they finish.
 */
export function useSyncStatus(onJobFinished: (job: JobId) => void) {
  const [status, setStatus] = React.useState<SyncStatusData | null>(null)
  const [reports, setReports] = React.useState<SyncReport[]>([])
  const prevRunning = React.useRef<Record<JobId, boolean>>({ asc: false, store: false })
  // Jobs started here, with the id of the run that was latest when we asked (null = none yet).
  const awaiting = React.useRef<Partial<Record<JobId, number | null>>>({})
  const lastIds = React.useRef<Record<JobId, number | null>>({ asc: null, store: null })
  const finishedRef = React.useRef(onJobFinished)
  finishedRef.current = onJobFinished

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/sync")
      if (!res.ok) return
      const data: SyncStatusData = await res.json()
      const ready: SyncReport[] = []
      for (const id of ["asc", "store"] as JobId[]) {
        const last = data.lastRuns[id]
        lastIds.current[id] = last?.id ?? null
        // A run can finish between two polls, so compare run ids rather than watch "running".
        if (id in awaiting.current && !data.jobs[id].running && last && last.id !== awaiting.current[id]) {
          delete awaiting.current[id]
          if (last.report) ready.push(last.report)
          if (!prevRunning.current[id]) finishedRef.current(id)
        }
        if (prevRunning.current[id] && !data.jobs[id].running) finishedRef.current(id)
        prevRunning.current[id] = data.jobs[id].running
      }
      if (ready.length) setReports((r) => [...r, ...ready])
      setStatus(data)
    } catch {
      // server restarting; try again next tick
    }
  }, [])

  const anyRunning = !!status && (status.jobs.asc.running || status.jobs.store.running)
  React.useEffect(() => {
    refresh()
    const t = setInterval(refresh, anyRunning ? 1500 : 30000)
    return () => clearInterval(t)
  }, [refresh, anyRunning])

  const start = React.useCallback(
    async (job: JobId | "all", reset?: "errors" | "all") => {
      for (const id of ["asc", "store"] as JobId[]) {
        if (job === id || job === "all") awaiting.current[id] = lastIds.current[id]
      }
      await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job, reset }),
      })
      refresh()
    },
    [refresh]
  )

  const showReport = React.useCallback((report: SyncReport) => setReports([report]), [])
  const closeReports = React.useCallback(() => setReports([]), [])

  return { status, start, refresh, reports, showReport, closeReports }
}

const LABELS: Record<string, string> = {
  "SALES:D": "Daily sales",
  "SALES:M": "Monthly sales",
  "SALES:Y": "Yearly sales (history)",
  "SUBSCRIPTION_EVENT:D": "Subscription events",
  "SUBSCRIPTION:D": "Active subscriptions",
}

export function SyncStatusButton({ sync }: { sync: ReturnType<typeof useSyncStatus> }) {
  const { status, start, reports, showReport, closeReports } = sync
  const [open, setOpen] = React.useState(false)
  // The report replaces this dialog rather than stacking on top of it.
  const dialogOpen = open && reports.length === 0
  const closeReport = () => {
    setOpen(false)
    closeReports()
  }
  const asc = status?.jobs.asc
  const store = status?.jobs.store
  const running = asc?.running || store?.running
  const active = asc?.running ? asc : store?.running ? store : null
  const lastAsc = status?.lastRuns.asc
  const hasProblem = !!(lastAsc && lastAsc.status === "error") || status?.coverage.reports.some((r) => r.error > 0)

  const progressLabel = active
    ? active.total
      ? `${Math.round((active.done / active.total) * 100)}%`
      : "…"
    : null

  return (
    <>
    <SyncReportDialog reports={reports} onClose={closeReport} />
    <Dialog open={dialogOpen} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {running ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : hasProblem ? (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {running
              ? `Syncing ${progressLabel}`
              : lastAsc
                ? `Synced ${formatDistanceToNow(new Date(lastAsc.finished_at), { addSuffix: true })}`
                : "Sync"}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Data Sync</DialogTitle>
          <DialogDescription>
            Only report dates you don&apos;t already have, or that failed before, are downloaded.
            {status && status.config.autoSyncHours > 0 && ` Runs automatically every ${status.config.autoSyncHours}h.`}
          </DialogDescription>
        </DialogHeader>

        {!status ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-5">
            <JobCard
              title="App Store Connect"
              subtitle="Apps, sales, in-app purchases, subscriptions, reviews"
              job={status.jobs.asc}
              last={status.lastRuns.asc}
              onRun={() => start("asc")}
              onReport={showReport}
            />
            <JobCard
              title="Ratings & Rankings"
              subtitle="Ratings and top-100 chart positions in all 175 storefronts"
              job={status.jobs.store}
              last={status.lastRuns.store}
              onRun={() => start("store")}
              onReport={showReport}
            />

            <div>
              <div className="mb-2 text-sm font-semibold">Report coverage</div>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Report</th>
                      <th className="px-3 py-2 text-left font-medium">Range</th>
                      <th className="px-3 py-2 text-right font-medium">Synced</th>
                      <th className="px-3 py-2 text-right font-medium">No data</th>
                      <th className="px-3 py-2 text-right font-medium">To fetch</th>
                      <th className="px-3 py-2 text-right font-medium">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.coverage.reports.map((r) => (
                      <tr key={r.reportType + r.granularity} className="border-t border-border">
                        <td className="px-3 py-2 font-medium">{LABELS[`${r.reportType}:${r.granularity}`]}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {r.expected ? `${r.first} → ${r.last}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.ok}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.empty}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.missing - r.error}</td>
                        <td className={cn("px-3 py-2 text-right tabular-nums", r.error > 0 && "text-red-500")} title={r.lastError || undefined}>
                          {r.error}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {status.coverage.reports.find((r) => r.lastError)?.lastError && (
                <p className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                  {status.coverage.reports.find((r) => r.lastError)!.lastError}
                </p>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                The newest day or two usually show as “to fetch” until Apple publishes them.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button size="sm" variant="outline" onClick={() => start("asc", "errors")} disabled={status.jobs.asc.running}>
                Retry failed dates
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={status.jobs.asc.running}
                onClick={() => {
                  if (confirm("Re-download every report from App Store Connect? Existing data is replaced, not duplicated.")) start("asc", "all")
                }}
              >
                Full re-sync
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  )
}

function JobCard({
  title, subtitle, job, last, onRun, onReport,
}: {
  title: string
  subtitle: string
  job: JobState
  last: RunRecord | null
  onRun: () => void
  onReport: (report: SyncReport) => void
}) {
  const pct = job.total ? (job.done / job.total) * 100 : 0
  const lines = (job.running ? job.errors : last?.message?.split("\n") || []).filter(Boolean)
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
        <Button size="sm" onClick={onRun} disabled={job.running}>
          <RefreshCw className={cn("mr-2 h-3.5 w-3.5", job.running && "animate-spin")} />
          {job.running ? "Running" : "Run now"}
        </Button>
      </div>
      {job.running ? (
        <div className="mt-3 space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{job.phase}</span>
            {job.total > 0 && <span className="tabular-nums">{job.done} / {job.total}</span>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : last ? (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          {last.status === "ok" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
          Last run {formatDistanceToNow(new Date(last.finished_at), { addSuffix: true })} ({fmtDate(last.finished_at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })})
          {last.report && (
            <button
              type="button"
              onClick={() => onReport(last.report!)}
              className="ml-auto inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
            >
              <ListChecks className="h-3.5 w-3.5" />
              {last.report.changed ? "What changed" : "Report"}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 text-xs text-muted-foreground">Never run</div>
      )}
      {lines.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {lines.map((l, i) => (
            <li key={i} className={/^(Synced|Checked) /.test(l) ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}>
              {l}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
