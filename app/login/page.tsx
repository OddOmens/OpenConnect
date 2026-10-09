import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/auth/login-form'
import { pageAuthState } from '@/lib/auth-page'
import { MIN_PASSWORD_LENGTH, passwordSource, setupCode } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const state = await pageAuthState()
  if (state === 'ok') redirect('/')
  // Makes sure a setup code exists and has been printed to the server log.
  if (state === 'setup') setupCode()
  return <LoginForm mode={state} minLength={MIN_PASSWORD_LENGTH} passwordFromEnv={passwordSource() === 'env'} />
}
