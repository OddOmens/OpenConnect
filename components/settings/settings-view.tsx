"use client"

import * as React from "react"
import { Bell, CheckCircle2, Info, KeyRound, LayoutDashboard, Loader2, Monitor, Moon, Palette, RefreshCw, Shield, Sun, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { CHARTS, CURRENCIES, ChartId, NotifyConfig, RANGES, RangeId, SyncConfig, ThemeId, UiPrefs } from "@/lib/prefs"
import { applyTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { SecuritySection } from "./security-section"
import { AppNav } from "@/components/nav/app-nav"
import { ApiTokensSection } from "./api-tokens-section"
import { CustomizeSettings } from "./customize-settings"
import { Panel, Row } from "./panel"
import type { App } from "@/components/dashboard/app-selector"
import { inputCls } from "@/components/ui/field"

export interface ServerSettings {
  credentials: { key_id: string; issuer_id: string; private_key_path: string; vendor_number: string; has_private_key: boolean }
  sources: Record<"key_id" | "issuer_id" | "private_key_path" | "private_key" | "vendor_number", "env" | "settings" | "unset">
  sync: SyncConfig
  prefs: UiPrefs
  notify: NotifyConfig
}

const SECTIONS = {
  general: { label: "General", icon: Palette },
  customize: { label: "Customize", icon: LayoutDashboard },
  connect: { label: "App Store Connect", icon: KeyRound },
  sync: { label: "Sync", icon: RefreshCw },
  notifications: { label: "Notifications", icon: Bell },
  security: { label: "Security", icon: Shield },
  about: { label: "About", icon: Info },
} as const
type SectionKey = keyof typeof SECTIONS

export function SettingsView({ initial, apps: initialApps, version }: { initial: ServerSettings; apps: App[]; version: string }) {
  const [section, setSection] = React.useState<SectionKey>("general")
  const [apps, setApps] = React.useState(initialApps)

  // One copy of the display prefs for General and Customize. Only changed fields are sent,
  // so nothing saved elsewhere (another tab, the marketing page) gets overwritten.
  const [prefs, setPrefs] = React.useState(initial.prefs)
  const [saved, setSaved] = React.useState<"saving" | "saved" | null>(null)
  const pending = React.useRef<Partial<UiPrefs>>({})
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const updatePrefs = React.useCallback((patch: Partial<UiPrefs>) => {
    setPrefs((p) => ({ ...p, ...patch }))
    if (patch.theme) applyTheme(patch.theme)
    pending.current = { ...pending.current, ...patch }
    setSaved("saving")
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const body = pending.current
      pending.current = {}
      postSettings({ prefs: body })
        .then(() => setSaved("saved"))
        .catch(() => setSaved(null))
    }, 300)
  }, [])
  const savedNote = saved && <span className="text-xs text-muted-foreground">{saved === "saving" ? "Saving…" : "Saved"}</span>

  const toggleApp = async (appleId: string) => {
    await fetch("/api/apps", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apple_id: appleId }) })
    const res = await fetch("/api/apps").catch(() => null)
    if (res?.ok) setApps((await res.json()).apps || [])
  }

  // The open section lives in the URL hash, so links like /settings#security work.
  React.useEffect(() => {
    const fromHash = () => {
      const h = location.hash.slice(1)
      if (h in SECTIONS) setSection(h as SectionKey)
    }
    fromHash()
    window.addEventListener("hashchange", fromHash)
    return () => window.removeEventListener("hashchange", fromHash)
  }, [])
  const open = (key: SectionKey) => {
    setSection(key)
    history.replaceState(null, "", `#${key}`)
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav active="settings" />

      {/* Lined up with the top bar, like the other pages; the Saved note shows here, once. */}
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 pt-6 sm:px-6 lg:px-8">
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        {savedNote}
      </div>
      <div className="mx-auto max-w-screen-2xl gap-8 px-4 py-6 sm:px-6 md:grid md:grid-cols-[200px_minmax(0,48rem)] lg:px-8">
        <nav aria-label="Settings sections" className="mb-6 flex gap-1 overflow-x-auto md:mb-0 md:flex-col">
          {(Object.keys(SECTIONS) as SectionKey[]).map((key) => {
            const { label, icon: Icon } = SECTIONS[key]
            return (
              <button
                key={key}
                onClick={() => open(key)}
                aria-current={section === key ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  section === key ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            )
          })}
        </nav>

        <main className="min-w-0 space-y-6">
          {section === "general" && <GeneralSettings prefs={prefs} update={updatePrefs} />}
          {section === "customize" && <CustomizeSettings prefs={prefs} onPrefs={updatePrefs} apps={apps} onToggleApp={toggleApp} />}
          {section === "connect" && <ConnectSettings initial={initial} />}
          {section === "sync" && <SyncSettings initial={initial.sync} />}
          {section === "notifications" && <NotifySettings initial={initial.notify} />}
          {section === "security" && (
            <>
              <Panel title="Security" description="Who can open this dashboard.">
                <SecuritySection />
              </Panel>
              <Panel title="API tokens" description="For Claude and scripts that use the screenshot studio or Marketing.">
                <ApiTokensSection />
              </Panel>
            </>
          )}
          {section === "about" && <About version={version} />}
        </main>
      </div>
    </div>
  )
}

// --- Building blocks -----------------------------------------------------------------

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {label}
    </span>
  )
}

async function postSettings(body: object) {
  const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) throw new Error(data.error || "Couldn’t save.")
  return data
}

// --- General: theme and display defaults (saved as you change them) ---------------------

const THEMES: { id: ThemeId; label: string; icon: React.ElementType }[] = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
]

/** A tiny dashboard drawn in the theme's colours. */
function ThemePreview({ id }: { id: ThemeId }) {
  const light = { bg: "#ffffff", card: "#f4f4f5", line: "#e4e4e7", text: "#09090b" }
  const dark = { bg: "#09090b", card: "#18181b", line: "#27272a", text: "#fafafa" }
  const half = (c: typeof light, side: "left" | "right" | "full") => (
    <div className="absolute inset-y-0 p-2" style={{ background: c.bg, left: side === "right" ? "50%" : 0, right: side === "left" ? "50%" : 0 }}>
      <div className="mb-1.5 h-1.5 w-8 rounded-full" style={{ background: c.text, opacity: 0.8 }} />
      <div className="grid grid-cols-3 gap-1">
        {[0, 1, 2].map((i) => <div key={i} className="h-4 rounded-sm border" style={{ background: c.card, borderColor: c.line }} />)}
      </div>
      <div className="mt-1 h-7 rounded-sm border" style={{ background: c.card, borderColor: c.line }}>
        <svg viewBox="0 0 60 20" className="h-full w-full" preserveAspectRatio="none">
          <path d="M0 16 L12 12 L24 14 L36 6 L48 9 L60 4" fill="none" stroke="#3b82f6" strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  )
  return (
    <div className="relative h-20 w-full overflow-hidden rounded-md border border-border">
      {id === "light" && half(light, "full")}
      {id === "dark" && half(dark, "full")}
      {id === "system" && (
        <>
          {half(light, "left")}
          {half(dark, "right")}
        </>
      )}
    </div>
  )
}

function GeneralSettings({ prefs, update }: { prefs: UiPrefs; update: (p: Partial<UiPrefs>) => void }) {
  return (
    <>
      <Panel title="Appearance" description="Light, dark, or whatever your device is set to.">
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
          {THEMES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="radio"
              aria-checked={prefs.theme === id}
              onClick={() => update({ theme: id })}
              className={cn(
                "space-y-2 rounded-lg border p-2 text-left transition-colors",
                prefs.theme === id ? "border-foreground/40 bg-accent" : "border-border hover:bg-accent/50"
              )}
            >
              <ThemePreview id={id} />
              <span className="flex items-center gap-1.5 px-1 text-sm font-medium">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Dashboard defaults" description="What the dashboard shows when it opens.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Date range</span>
            <select value={prefs.range in RANGES ? prefs.range : "30d"} onChange={(e) => update({ range: e.target.value as RangeId })} className={inputCls}>
              {(Object.keys(RANGES) as RangeId[]).map((r) => <option key={r} value={r}>{RANGES[r]}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Currency</span>
            <select value={prefs.currency} onChange={(e) => update({ currency: e.target.value })} className={inputCls}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <Row label="Compare with the previous period" hint="Shows ▲/▼ changes on key metrics.">
          <Switch checked={prefs.compareToPrevious} onCheckedChange={(compareToPrevious) => update({ compareToPrevious })} />
        </Row>
        <p className="text-xs text-muted-foreground">
          Which apps, sections, metrics and columns appear, and where, is under <b>Customize</b>.
        </p>
      </Panel>
    </>
  )
}

// --- App Store Connect credentials --------------------------------------------------------

type TestResult = { apps: boolean; sales: boolean; reviews: boolean; message: string }

function ConnectSettings({ initial }: { initial: ServerSettings }) {
  const [creds, setCreds] = React.useState({ ...initial.credentials, private_key: "" })
  const [hasKey, setHasKey] = React.useState(initial.credentials.has_private_key)
  const [busy, setBusy] = React.useState<"save" | "test" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [savedAt, setSavedAt] = React.useState(false)
  const [test, setTest] = React.useState<TestResult | null>(null)
  const fromEnv = (k: keyof ServerSettings["sources"]) => initial.sources[k] === "env"

  const save = async () => {
    setError(null)
    setSavedAt(false)
    const credentials: Record<string, string> = {}
    for (const k of ["key_id", "issuer_id", "private_key_path", "vendor_number"] as const) {
      if (!fromEnv(k)) credentials[k] = creds[k]
    }
    if (creds.private_key.trim()) credentials.private_key = creds.private_key
    await postSettings({ credentials })
    if (creds.private_key.trim()) {
      setHasKey(true)
      setCreds((c) => ({ ...c, private_key: "" }))
    }
    setSavedAt(true)
  }

  const run = async (what: "save" | "test") => {
    setBusy(what)
    setTest(null)
    try {
      await save()
      if (what === "test") {
        const res = await fetch("/api/test-connection", { method: "POST" })
        setTest(await res.json())
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const field = (k: "vendor_number" | "key_id" | "issuer_id" | "private_key_path", label: string, placeholder: string, mono = false) => (
    <label className="block space-y-1.5 text-sm">
      <span className="flex items-center gap-2 font-medium">
        {label}
        {fromEnv(k) && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">from environment</Badge>}
      </span>
      <input
        value={creds[k]}
        disabled={fromEnv(k)}
        onChange={(e) => setCreds({ ...creds, [k]: e.target.value })}
        placeholder={placeholder}
        className={cn(inputCls, mono && "font-mono text-xs")}
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  )

  return (
    <Panel
      title="App Store Connect"
      description={
        <>
          Sales, subscription and analytics reports need an API key with the <b>Sales and Reports</b> role (or Finance/Admin). Create one in App
          Store Connect → Users and Access → Integrations → Team Keys. Everything stays on this server.
        </>
      }
      footer={
        <>
          <Button size="sm" onClick={() => run("save")} disabled={!!busy}>
            {busy === "save" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={() => run("test")} disabled={!!busy}>
            {busy === "test" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save & test connection
          </Button>
          {savedAt && !test && !error && <span className="text-xs text-muted-foreground">Saved</span>}
          {test && (
            <span className="flex flex-wrap gap-3">
              <Status ok={test.apps} label="Apps" />
              <Status ok={test.reviews} label="Reviews" />
              <Status ok={test.sales} label="Sales reports" />
            </span>
          )}
        </>
      }
    >
      {field("vendor_number", "Vendor number", "e.g. 80012345")}
      <div className="grid gap-4 sm:grid-cols-2">
        {field("key_id", "Key ID", "e.g. ABC123DEFG")}
        {field("issuer_id", "Issuer ID", "e.g. 69a6de7e-…")}
      </div>
      {field("private_key_path", "Private key (.p8) path", "Optional when AuthKey_<KEY_ID>.p8 is in the keys/ folder", true)}
      <label className="block space-y-1.5 text-sm">
        <span className="flex items-center gap-2 font-medium">
          …or paste the .p8 contents
          {hasKey && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">key stored</Badge>}
        </span>
        <textarea
          value={creds.private_key}
          onChange={(e) => setCreds({ ...creds, private_key: e.target.value })}
          placeholder={"-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"}
          rows={4}
          className={cn(inputCls, "h-auto py-2 font-mono text-[11px]")}
          autoComplete="off"
          spellCheck={false}
        />
        <span className="block text-xs text-muted-foreground">The stored key is never sent back to the browser.</span>
      </label>
      {test?.message && <p className="text-xs text-amber-600 dark:text-amber-400">{test.message}</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </Panel>
  )
}

// --- Sync schedule and what gets synced ----------------------------------------------------

function SyncSettings({ initial }: { initial: SyncConfig }) {
  const [sync, setSync] = React.useState(initial)
  const [state, setState] = React.useState<"saving" | "saved" | "error" | null>(null)

  const save = async () => {
    setState("saving")
    try {
      await postSettings({ sync })
      setState("saved")
    } catch {
      setState("error")
    }
  }

  return (
    <Panel
      title="Sync"
      description="Everything is stored locally; each sync only asks Apple for what’s new. Progress and report coverage are in the Sync menu on the dashboard."
      footer={
        <>
          <Button size="sm" onClick={save} disabled={state === "saving"}>
            {state === "saving" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
          {state === "saved" && <span className="text-xs text-muted-foreground">Saved</span>}
          {state === "error" && <span className="text-xs text-red-600 dark:text-red-400">Couldn’t save.</span>}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Sales & analytics</span>
          <select className={inputCls} value={sync.autoSyncHours} onChange={(e) => setSync({ ...sync, autoSyncHours: Number(e.target.value) })}>
            {[0, 1, 3, 6, 12, 24].map((h) => <option key={h} value={h}>{h ? `Every ${h} hour${h > 1 ? "s" : ""}` : "Off (manual only)"}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Ratings & Rankings</span>
          <select className={inputCls} value={sync.storeSyncHours} onChange={(e) => setSync({ ...sync, storeSyncHours: Number(e.target.value) })}>
            {[0, 6, 12, 24, 48, 168].map((h) => <option key={h} value={h}>{h ? (h === 168 ? "Weekly" : `Every ${h} hours`) : "Off (manual only)"}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Apple keeps daily reports for 365 days and monthly reports for 12 months; older history is synced as yearly totals.
      </p>

      <div className="space-y-3 border-t border-border pt-4">
        <Row label="Subscription reports" hint="Active subscriptions and subscription events.">
          <Switch checked={sync.syncSubscriptions} onCheckedChange={(v) => setSync({ ...sync, syncSubscriptions: v })} />
        </Row>
        <Row label="Impressions & product page views" hint="App Store analytics reports.">
          <Switch checked={sync.syncAnalytics} onCheckedChange={(v) => setSync({ ...sync, syncAnalytics: v })} />
        </Row>
        <Row label="Customer reviews">
          <Switch checked={sync.syncReviews} onCheckedChange={(v) => setSync({ ...sync, syncReviews: v })} />
        </Row>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div>
          <div className="text-sm font-medium">Charts to check for rankings</div>
          <div className="text-xs text-muted-foreground">Fewer charts make the ratings & rankings check faster.</div>
        </div>
        <div className="flex flex-wrap gap-5">
          {(Object.keys(CHARTS) as ChartId[]).map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <Switch
                checked={sync.rankCharts.includes(c)}
                onCheckedChange={(on) => setSync({ ...sync, rankCharts: on ? [...sync.rankCharts, c] : sync.rankCharts.filter((x) => x !== c) })}
              />
              {CHARTS[c]}
            </label>
          ))}
        </div>
        <Row label="Also check overall (all-category) charts">
          <Switch checked={sync.rankOverall} onCheckedChange={(v) => setSync({ ...sync, rankOverall: v })} />
        </Row>
      </div>
    </Panel>
  )
}

// --- Notifications: chart entries and the daily recap, sent to Signal -----------------------

function NotifySettings({ initial }: { initial: NotifyConfig }) {
  // Never set up yet: start the recap in this browser's time zone.
  const [notify, setNotify] = React.useState<NotifyConfig>(() =>
    initial.signalUrl ? initial : { ...initial, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || initial.timezone }
  )
  const [busy, setBusy] = React.useState<"save" | "test" | "recap" | null>(null)
  const [done, setDone] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const set = (patch: Partial<NotifyConfig>) => setNotify((n) => ({ ...n, ...patch }))

  const run = async (what: "save" | "test" | "recap") => {
    setBusy(what)
    setDone(null)
    setError(null)
    try {
      await postSettings({ notify })
      if (what !== "save") {
        const res = await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: what }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || data.error) throw new Error(data.error || "Couldn’t send.")
      }
      setDone(what === "save" ? "Saved" : "Sent")
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }
  const ready = !!(notify.signalUrl && notify.signalNumber && notify.signalTo)
  const button = (what: "save" | "test" | "recap", label: string, variant?: "outline") => (
    <Button size="sm" variant={variant} onClick={() => run(what)} disabled={!!busy || (what !== "save" && !ready)}>
      {busy === what && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
      {label}
    </Button>
  )

  return (
    <Panel
      title="Notifications"
      description={
        <>
          Sent to Signal through a{" "}
          <a href="https://github.com/bbernhard/signal-cli-rest-api" target="_blank" rel="noreferrer" className="underline underline-offset-2">
            signal-cli-rest-api
          </a>{" "}
          server you run, with a Signal account linked to it. Nothing is sent anywhere else.
        </>
      }
      footer={
        <>
          {button("save", "Save")}
          {button("test", "Save & send a test", "outline")}
          {button("recap", "Send the recap now", "outline")}
          {done && !error && <span className="text-xs text-muted-foreground">{done}</span>}
          {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
        </>
      }
    >
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Signal API address</span>
        <input value={notify.signalUrl} onChange={(e) => set({ signalUrl: e.target.value })} placeholder="http://signal-api:8080" className={inputCls} autoComplete="off" spellCheck={false} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Send from</span>
          <input value={notify.signalNumber} onChange={(e) => set({ signalNumber: e.target.value })} placeholder="+15551234567" className={inputCls} autoComplete="off" spellCheck={false} />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Send to</span>
          <input value={notify.signalTo} onChange={(e) => set({ signalTo: e.target.value })} placeholder="A group’s name, or a phone number" className={inputCls} autoComplete="off" spellCheck={false} />
        </label>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <Row label="When an app enters a chart" hint="Right after each ratings & rankings check: every top 100 chart an app wasn’t in at the check before.">
          <Switch checked={notify.chartEntries} onCheckedChange={(chartEntries) => set({ chartEntries })} />
        </Row>
        <Row label="Daily recap" hint="Each app’s last reported day of downloads and proceeds, its ratings, new reviews and chart moves.">
          <Switch checked={notify.recap} onCheckedChange={(recap) => set({ recap })} />
        </Row>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Recap at</span>
            <input type="time" value={notify.recapTime} disabled={!notify.recap} onChange={(e) => set({ recapTime: e.target.value })} className={inputCls} />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Time zone</span>
            <input value={notify.timezone} disabled={!notify.recap} onChange={(e) => set({ timezone: e.target.value })} placeholder="America/Chicago" className={inputCls} autoComplete="off" spellCheck={false} />
          </label>
        </div>
      </div>
    </Panel>
  )
}

// --- About ------------------------------------------------------------------------------

function About({ version }: { version: string }) {
  return (
    <Panel title="About" description="Self-hosted App Store Connect analytics.">
      <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <dt className="text-muted-foreground">Version</dt>
        <dd>{version}</dd>
        <dt className="text-muted-foreground">Your data</dt>
        <dd>
          A SQLite database in the <code className="rounded bg-muted px-1 text-xs">data/</code> folder next to docker-compose.yml. Back it up by copying that
          folder.
        </dd>
        <dt className="text-muted-foreground">Leaves this server</dt>
        <dd>Only requests to Apple (App Store Connect, App Store ratings and charts), to an exchange-rate service and, if you set up notifications, to your Signal API server.</dd>
      </dl>
    </Panel>
  )
}
