"use client"

import * as React from "react"
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, MessageSquareReply, Minus, Pencil, Plus } from "lucide-react"
import { formatDistanceStrict } from "date-fns"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { fmtMoney, fmtNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ReportItem, ReportMetric, SyncReport } from "@/lib/sync-report"

const JOB_TITLE = { asc: "App Store Connect", store: "Ratings & Rankings" } as const

const TAG_STYLE: Record<ReportItem["tag"], { icon: React.ElementType; cls: string; label: string }> = {
  new: { icon: Plus, cls: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10", label: "New" },
  revised: { icon: Pencil, cls: "text-sky-600 dark:text-sky-400 bg-sky-500/10", label: "Revised" },
  up: { icon: ArrowUpRight, cls: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10", label: "Up" },
  down: { icon: ArrowDownRight, cls: "text-red-600 dark:text-red-400 bg-red-500/10", label: "Down" },
  dropped: { icon: Minus, cls: "text-muted-foreground bg-muted", label: "Dropped" },
  reply: { icon: MessageSquareReply, cls: "text-sky-600 dark:text-sky-400 bg-sky-500/10", label: "Reply" },
}

function fmtMetric(m: ReportMetric, n: number, currency: string) {
  if (m.format === "money") return fmtMoney(n, currency)
  if (m.format === "rating") return n.toFixed(2)
  return fmtNumber(n)
}

function MetricRow({ m, currency }: { m: ReportMetric; currency: string }) {
  const delta = Math.round((m.after - m.before) * 100) / 100
  return (
    <tr className="border-t border-border first:border-t-0">
      <td className="py-1.5 pr-3">{m.label}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{fmtMetric(m, m.before, currency)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{fmtMetric(m, m.after, currency)}</td>
      <td
        className={cn(
          "py-1.5 text-right font-medium tabular-nums",
          delta > 0 ? "text-emerald-600 dark:text-emerald-400" : delta < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
        )}
      >
        {delta === 0 ? "—" : `${delta > 0 ? "+" : "−"}${fmtMetric(m, Math.abs(delta), currency)}`}
      </td>
    </tr>
  )
}

function ReportBody({ report }: { report: SyncReport }) {
  const took =
    report.startedAt && report.finishedAt ? formatDistanceStrict(new Date(report.finishedAt), new Date(report.startedAt)) : null
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="text-sm font-semibold text-foreground">{JOB_TITLE[report.job]}</span>
        {report.finishedAt && <span>· {new Date(report.finishedAt).toLocaleString()}</span>}
        {took && <span>· took {took}</span>}
        {report.trigger === "schedule" && <span>· automatic</span>}
      </div>

      {report.errors.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {report.errors.map((e, i) => (
            <div key={i} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{e}</span>
            </div>
          ))}
        </div>
      )}

      {!report.changed ? (
        <div className="flex items-center gap-2 rounded-md border border-border px-3 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          Everything is up to date. Nothing changed in your data.
        </div>
      ) : (
        report.sections.map((section, i) => (
          <section key={i} className="rounded-lg border border-border">
            <h3 className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </h3>
            <div className="space-y-3 px-3 py-2.5">
              {section.metrics && section.metrics.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="text-[11px] text-muted-foreground">
                    <tr>
                      <th className="pb-1 text-left font-medium" />
                      <th className="pb-1 pr-3 text-right font-medium">Before</th>
                      <th className="pb-1 pr-3 text-right font-medium">After</th>
                      <th className="pb-1 text-right font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.metrics.map((m) => (
                      <MetricRow key={m.label} m={m} currency={report.currency} />
                    ))}
                  </tbody>
                </table>
              )}
              {section.items && section.items.length > 0 && (
                <ul className="space-y-1.5">
                  {section.items.map((item, j) => {
                    const t = TAG_STYLE[item.tag]
                    const Icon = t.icon
                    return (
                      <li key={j} className="flex gap-2.5 text-sm">
                        <span className={cn("mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded", t.cls)} title={t.label}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{item.title}</div>
                          {item.detail && <div className="text-xs text-muted-foreground">{item.detail}</div>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              {!!section.more && <p className="text-xs text-muted-foreground">…and {fmtNumber(section.more)} more.</p>}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

/** "What changed" for one or more finished sync runs. */
export function SyncReportDialog({ reports, onClose }: { reports: SyncReport[]; onClose: () => void }) {
  const changed = reports.some((r) => r.changed)
  return (
    <Dialog open={reports.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sync report</DialogTitle>
          <DialogDescription>
            {changed ? "Exactly what this sync added or changed in your data." : "The sync finished without changing anything."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          {reports.map((r) => (
            <ReportBody key={`${r.job}-${r.finishedAt}`} report={r} />
          ))}
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
