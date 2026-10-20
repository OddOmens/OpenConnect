"use client"

import * as React from "react"
import { LogOut, ShieldOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { inputCls } from "@/components/ui/field"

async function auth(body: object) {
  const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || "Something went wrong.")
}

/** Password and sign-out controls for the Settings page. */
export function SecuritySection() {
  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [fromEnv, setFromEnv] = React.useState(false)
  const [disabled, setDisabled] = React.useState(false)

  React.useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        setFromEnv(!!d.passwordFromEnv)
        setDisabled(!!d.authDisabled)
      })
      .catch(() => {})
  }, [])

  const change = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await auth({ action: "change", current, password: next })
      setCurrent("")
      setNext("")
      setMessage({ ok: true, text: "Password changed. Other browsers have been signed out." })
    } catch (err: any) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const signOut = async (everywhere: boolean) => {
    await auth({ action: everywhere ? "logout-all" : "logout" }).catch(() => {})
    location.href = "/login"
  }

  if (disabled) {
    return (
      <div className="flex gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
        <ShieldOff className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Password protection is off (<code>OPENCONNECT_PASSWORD_REQUIRED=false</code>). Anyone who can reach this
          address can see your data and change settings. Remove that line from <code>.env</code> and restart to turn
          the password back on.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {fromEnv ? (
        <p className="text-xs text-muted-foreground">The password is set by OPENCONNECT_PASSWORD; change it there and restart.</p>
      ) : (
        <form onSubmit={change} className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Current password</span>
            <input className={inputCls} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">New password</span>
            <input className={inputCls} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={10} required />
            <span className="block text-xs text-muted-foreground">At least 10 characters.</span>
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" disabled={busy}>Change password</Button>
          </div>
        </form>
      )}
      {message && <p className={message.ok ? "text-xs text-emerald-600 dark:text-emerald-400" : "text-xs text-red-600 dark:text-red-400"}>{message.text}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => signOut(false)}>
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </Button>
        <Button size="sm" variant="ghost" onClick={() => signOut(true)}>Sign out everywhere</Button>
      </div>
    </div>
  )
}
