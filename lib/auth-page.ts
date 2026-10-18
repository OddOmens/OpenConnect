// Sign-in checks for server-rendered pages (API routes use guard() from ./auth instead).

import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { authEnabled, passwordSource, sessionValid, trustedHost, SESSION_COOKIE } from './auth';

export async function pageAuthState(): Promise<'setup' | 'login' | 'ok'> {
  if (!authEnabled()) {
    // Password off: still refuse pages served under a foreign hostname (DNS rebinding).
    if (!trustedHost((await headers()).get('host'))) notFound();
    return 'ok';
  }
  if (!passwordSource()) return 'setup';
  return sessionValid((await cookies()).get(SESSION_COOKIE)?.value) ? 'ok' : 'login';
}

/** Sends anyone who isn't signed in to /login, and back to `next` (a path here) afterwards. */
export async function requireSignIn(next?: string) {
  if ((await pageAuthState()) !== 'ok') redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
}
