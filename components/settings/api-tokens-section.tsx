"use client"

import * as React from "react"
import { Check, Copy, KeyRound, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import { inputCls } from "@/components/ui/field"
import { TOKEN_SCOPES, type TokenScope } from "@/lib/prefs"

interface Token { id: string; name: string; hint: string; scopes: TokenScope[]; created_at: string; last_used_at: string | null }

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "never"

/** Tokens for the studio's CLI and MCP server (Claude) and scripts: the studio, Marketing, or both. */
export function ApiTokensSection() {
  const [tokens, setTokens] = React.useState<Token[]>([])
  const [name, setName] = React.useState("")
  const [scopes, setScopes] = React.useState<TokenScope[]>(["studio", "marketing"])
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
    const res = await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, scopes }) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return setError(d.error || "Couldn't create a token.")
    setCreated(d.token)
    setCopied(false)
    setName("")
    load()
  }

  const revoke = async (t: Token) => {
    setError(null)
    const res = await fetch(`/api/tokens?id=${encodeURIComponent(t.id)}`, { method: "DELETE" }).catch(() => null)
    if (!res?.ok) {
      const d = await res?.json().catch(() => ({}))
      setError(d?.error || `Couldn't revoke "${t.name}".`)
    }
    load()
  }

  const copy = async () => {
    if (!created) return
    await navigator.clipboard.writeText(created).then(() => setCopied(true)).catch(() => {})
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Lets Claude and scripts use the screenshot studio and Marketing: the studio&apos;s <code>appshot</code> CLI and MCP
        server send the token with <code>OPENCONNECT_URL</code>. A token opens only what you tick below, never the dashboard,
        settings or other tokens. Marketing includes the figures its cards show (downloads, proceeds, ratings) and the projections.
      </p>
      <form onSubmit={create} className="flex gap-2">
        <input className={inputCls} placeholder="Name, e.g. Claude on my Mac" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <Button type="submit" size="sm" className="shrink-0 gap-1.5" disabled={!scopes.length}>
          <KeyRound className="h-3.5 w-3.5" /> Create token
        </Button>
      </form>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
        <legend className="sr-only">What the token can open</legend>
        {(Object.keys(TOKEN_SCOPES) as TokenScope[]).map((s) => (
          <label key={s} className="flex cursor-pointer items-start gap-2 text-sm" title={TOKEN_SCOPES[s].detail}>
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={scopes.includes(s)}
              onChange={(e) => setScopes((prev) => (e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)))}
            />
            <span>
              {TOKEN_SCOPES[s].label}
              <span className="block text-xs text-muted-foreground">{TOKEN_SCOPES[s].detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
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
                  …{t.hint} · {t.scopes.map((s) => TOKEN_SCOPES[s].label).join(" + ")} · created {when(t.created_at)} · last used {when(t.last_used_at)}
                </div>
              </div>
              <ConfirmButton
                size="sm"
                variant="ghost"
                className="shrink-0 gap-1.5 text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-400"
                question="Anything using it stops working."
                confirmLabel="Revoke"
                destructive
                onConfirm={() => revoke(t)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Revoke
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
