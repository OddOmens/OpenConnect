"use client"

import * as React from "react"
import { CheckCircle2, Settings, XCircle } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { CHARTS, ChartId, SyncConfig } from "@/lib/prefs"
import type { App } from "./app-selector"

export interface ServerSettings {
  credentials: { key_id: string; issuer_id: string; private_key_path: string; vendor_number: string; has_private_key: boolean }
  sources: Record<"key_id" | "issuer_id" | "private_key_path" | "private_key" | "vendor_number", "env" | "settings" | "unset">
  sync: SyncConfig
}

interface Props {
  apps: App[]
  settings: ServerSettings | null
  onToggleVisibility: (id: string) => void
  onSaved: () => void
}

const inputCls =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"

export function SettingsDialog({ apps, settings, onToggleVisibility, onSaved }: Props) {
  const [open, setOpen] = React.useState(false)
  const [creds, setCreds] = React.useState({ key_id: "", issuer_id: "", private_key_path: "", vendor_number: "", private_key: "" })
  const [sync, setSync] = React.useState<SyncConfig | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [test, setTest] = React.useState<{ apps: boolean; sales: boolean; reviews: boolean; message: string } | "running" | null>(null)

  React.useEffect(() => {
    if (open && settings) {
      setCreds({ ...settings.credentials, private_key: "" })
      setSync(settings.sync)
      setError(null)
      setTest(null)
    }
  }, [open, settings])

  const fromEnv = (k: keyof ServerSettings["sources"]) => settings?.sources[k] === "env"

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const credentials: Record<string, string> = {}
      for (const k of ["key_id", "issuer_id", "private_key_path", "vendor_number"] as const) {
        if (!fromEnv(k)) credentials[k] = creds[k]
      }
      if (creds.private_key.trim()) credentials.private_key = creds.private_key
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials, sync }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || "Failed to save")
      onSaved()
      return true
    } catch (e: any) {
      setError(e.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  const runTest = async () => {
    if (!(await save())) return
    setTest("running")
    const res = await fetch("/api/test-connection", { method: "POST" })
    setTest(await res.json())
  }

  const field = (k: "vendor_number" | "key_id" | "issuer_id" | "private_key_path", label: string, placeholder: string, mono = false) => (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {label}
        {fromEnv(k) && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">from environment</Badge>}
      </label>
      <input
        value={creds[k]}
        disabled={fromEnv(k)}
        onChange={(e) => setCreds({ ...creds, [k]: e.target.value })}
        placeholder={placeholder}
        className={`${inputCls} ${mono ? "font-mono text-xs" : ""}`}
      />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Settings">
          <Settings className="h-5 w-5 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Stored in the dashboard database (the Docker data volume).</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <section className="space-y-3">
            <h4 className="text-sm font-semibold">App Store Connect API</h4>
            <p className="text-xs text-muted-foreground">
              Sales and subscription reports need a key with the <b>Sales</b> role (or Finance/Admin). Create one in App Store
              Connect → Users and Access → Integrations → Team Keys.
            </p>
            {field("vendor_number", "Vendor Number", "e.g. 80012345")}
            <div className="grid grid-cols-2 gap-3">
              {field("key_id", "Key ID", "e.g. ABC123DEFG")}
              {field("issuer_id", "Issuer ID", "e.g. 69a6de7e-…")}
            </div>
            {field("private_key_path", "Private key (.p8) path", "Optional if the .p8 is in the keys/ folder", true)}
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                …or paste the .p8 contents
                {settings?.credentials.has_private_key && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">key stored</Badge>}
              </label>
              <textarea
                value={creds.private_key}
                onChange={(e) => setCreds({ ...creds, private_key: e.target.value })}
                placeholder={"-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"}
                rows={3}
                className={`${inputCls} h-auto py-2 font-mono text-[11px]`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" onClick={runTest} disabled={saving || test === "running"}>
                {test === "running" ? "Testing…" : "Save & test connection"}
              </Button>
              {test && test !== "running" && (
                <div className="flex flex-wrap gap-3 text-xs">
                  <Check ok={test.apps} label="Apps" />
                  <Check ok={test.reviews} label="Reviews" />
                  <Check ok={test.sales} label="Sales reports" />
                </div>
              )}
            </div>
            {test && test !== "running" && test.message && <p className="text-xs text-amber-400">{test.message}</p>}
          </section>

          {sync && (
            <section className="space-y-3 border-t border-border pt-5">
              <h4 className="text-sm font-semibold">Sync</h4>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs text-muted-foreground">
                  Auto-sync sales
                  <select className={inputCls} value={sync.autoSyncHours} onChange={(e) => setSync({ ...sync, autoSyncHours: Number(e.target.value) })}>
                    {[0, 1, 3, 6, 12, 24].map((h) => <option key={h} value={h}>{h ? `Every ${h}h` : "Off"}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  Auto-check ratings & rankings
                  <select className={inputCls} value={sync.storeSyncHours} onChange={(e) => setSync({ ...sync, storeSyncHours: Number(e.target.value) })}>
                    {[0, 6, 12, 24, 48, 168].map((h) => <option key={h} value={h}>{h ? (h === 168 ? "Weekly" : `Every ${h}h`) : "Off"}</option>)}
                  </select>
                </label>
                <label className="col-span-2 space-y-1 text-xs text-muted-foreground">
                  History before the last 365 days (monthly reports)
                  <select className={inputCls} value={sync.backfillYears} onChange={(e) => setSync({ ...sync, backfillYears: Number(e.target.value) })}>
                    {[0, 1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y ? `${y} more year${y > 1 ? "s" : ""}` : "None"}</option>)}
                  </select>
                </label>
              </div>
              <Row label="Sync subscription reports">
                <Switch checked={sync.syncSubscriptions} onCheckedChange={(v) => setSync({ ...sync, syncSubscriptions: v })} />
              </Row>
              <Row label="Sync customer reviews">
                <Switch checked={sync.syncReviews} onCheckedChange={(v) => setSync({ ...sync, syncReviews: v })} />
              </Row>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Charts to check for rankings</div>
                <div className="flex flex-wrap gap-4">
                  {(Object.keys(CHARTS) as ChartId[]).map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={sync.rankCharts.includes(c)}
                        onCheckedChange={(on) =>
                          setSync({ ...sync, rankCharts: on ? [...sync.rankCharts, c] : sync.rankCharts.filter((x) => x !== c) })
                        }
                      />
                      {CHARTS[c]}
                    </label>
                  ))}
                </div>
              </div>
              <Row label="Also check overall (all-category) charts">
                <Switch checked={sync.rankOverall} onCheckedChange={(v) => setSync({ ...sync, rankOverall: v })} />
              </Row>
            </section>
          )}

          <section className="space-y-3 border-t border-border pt-5">
            <h4 className="text-sm font-semibold">Apps included in “All Apps”</h4>
            <div className="max-h-[220px] space-y-3 overflow-y-auto pr-2">
              {apps.map((app) => (
                <div key={app.apple_id} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {app.icon_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={app.icon_url} alt="" className="h-7 w-7 rounded-md" />
                    ) : (
                      <div className="h-7 w-7 rounded-md bg-muted" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{app.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{app.bundle_id}</div>
                    </div>
                  </div>
                  <Switch checked={!app.hidden} onCheckedChange={() => onToggleVisibility(app.apple_id)} />
                </div>
              ))}
              {!apps.length && <div className="text-xs text-muted-foreground">Apps appear after the first sync.</div>}
            </div>
          </section>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button onClick={async () => { if (await save()) setOpen(false) }} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      {label}
      {children}
    </label>
  )
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${ok ? "text-emerald-500" : "text-red-500"}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {label}
    </span>
  )
}
