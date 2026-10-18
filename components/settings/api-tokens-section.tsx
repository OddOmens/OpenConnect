"use client"

import * as React from "react"
import { Check, Copy, KeyRound, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

const inputCls =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"

interface Token { id: string; name: string; hint: string; created_at: string; last_used_at: string | null }

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "never"

/** Tokens for the screenshot studio's CLI and MCP server (Claude). */
export function ApiTokensSection() {
  const [tokens, setTokens] = React.useState<Token[]>([])
  const [name, setName] = React.useState("")
  const [created, setCreated] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    fetch("/api/tokens").then((r) => r.json()).then((d) => setTokens(d.tokens || [])).catch(() => {})
  }, [])
  React.useEffect(load, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const res = await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return setError(d.error || "Couldn't create a token.")
    setCreated(d.token)
    setCopied(false)
    setName("")
    load()
  }

  const revoke = async (t: Token) => {
    if (!confirm(`Revoke "${t.name}"? Anything using it stops working.`)) return
    await fetch(`/api/tokens?id=${encodeURIComponent(t.id)}`, { method: "DELETE" })
    load()
  }

  const copy = async () => {
    if (!created) return
    await navigator.clipboard.writeText(created).then(() => setCopied(true)).catch(() => {})
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Lets Claude and scripts use the screenshot studio: its <code>appshot</code> CLI and MCP server send the token
        with <code>OPENCONNECT_URL</code>. A token only opens the studio, never your sales data or settings.
      </p>
      <form onSubmit={create} className="flex gap-2">
        <input className={inputCls} placeholder="Name, e.g. Claude on my Mac" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <Button type="submit" size="sm" variant="outline" className="h-9 shrink-0 gap-1.5">
          <KeyRound className="h-3.5 w-3.5" /> Create token
        </Button>
      </form>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {created && (
        <div className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-xs font-medium">Copy this token now. It won&apos;t be shown again.</p>
          <div className="flex gap-2">
            <code className="flex-1 break-all rounded bg-background px-2 py-1.5 text-xs">{created}</code>
            <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={copy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}
      {tokens.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{t.name}</div>
                <div className="text-xs text-muted-foreground">
                  …{t.hint} · created {when(t.created_at)} · last used {when(t.last_used_at)}
                </div>
              </div>
              <Button size="sm" variant="ghost" className="shrink-0 gap-1.5 text-red-500 hover:text-red-500" onClick={() => revoke(t)}>
                <Trash2 className="h-3.5 w-3.5" /> Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
