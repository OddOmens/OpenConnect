// Sign-in checks for server-rendered pages (API routes use guard() from ./auth instead).

import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { authEnabled, passwordSource, sessionValid, trustedHost, SESSION_COOKIE } from './auth';

export function pageAuthState(): 'setup' | 'login' | 'ok' {
  if (!authEnabled()) {
    // Password off: still refuse pages served under a foreign hostname (DNS rebinding).
    if (!trustedHost(headers().get('host'))) notFound();
    return 'ok';
  }
  if (!passwordSource()) return 'setup';
  return sessionValid(cookies().get(SESSION_COOKIE)?.value) ? 'ok' : 'login';
}

/** Sends anyone who isn't signed in to /login. */
export function requireSignIn() {
  if (pageAuthState() !== 'ok') redirect('/login');
}
