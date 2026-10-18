import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/auth/login-form'
import { pageAuthState } from '@/lib/auth-page'
import { MIN_PASSWORD_LENGTH, passwordSource, setupCode } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Only a path on this server, never another site ("//evil.example" or "https://…"). */
const safeNext = (v: unknown) => (typeof v === 'string' && /^\/(?![/\\])/.test(v) ? v : '/')

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next)
  const state = await pageAuthState()
  if (state === 'ok') redirect(next)
  // Makes sure a setup code exists and has been printed to the server log.
  if (state === 'setup') setupCode()
  return <LoginForm mode={state} minLength={MIN_PASSWORD_LENGTH} passwordFromEnv={passwordSource() === 'env'} next={next} />
}
