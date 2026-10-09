'use client'

import { useState } from 'react'
import { Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'

const inputCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

interface Props {
  mode: 'setup' | 'login'
  minLength: number
  passwordFromEnv: boolean
}

export function LoginForm({ mode, minLength, passwordFromEnv }: Props) {
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const setup = mode === 'setup'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (setup && password !== confirm) return setError('The passwords don’t match.')
    setBusy(true)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setup ? { action: 'setup', code, password } : { action: 'login', password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong.')
      window.location.href = '/'
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-lg font-semibold tracking-tight">OpenConnect</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {setup
              ? 'Choose a password to protect your App Store data. You’ll use it to sign in from any browser.'
              : passwordFromEnv
                ? 'Sign in with the password set in OPENCONNECT_PASSWORD.'
                : 'Sign in to continue.'}
          </p>
        </div>

        {setup && (
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Setup code</span>
            <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH" autoComplete="off" autoFocus required />
            <span className="block text-xs text-muted-foreground">
              Shown in the server log: run <code className="rounded bg-muted px-1">docker logs openconnect</code>.
            </span>
          </label>
        )}

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">{setup ? 'New password' : 'Password'}</span>
          <input
            className={inputCls}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={setup ? 'new-password' : 'current-password'}
            minLength={setup ? minLength : undefined}
            autoFocus={!setup}
            required
          />
          {setup && <span className="block text-xs text-muted-foreground">At least {minLength} characters.</span>}
        </label>

        {setup && (
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Confirm password</span>
            <input className={inputCls} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </label>
        )}

        {error && <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {setup ? 'Set password and continue' : 'Sign in'}
        </Button>
      </form>
    </div>
  )
}
