import { NextResponse } from 'next/server';
import {
  authEnabled,
  checkPassword,
  checkSetupCode,
  createSession,
  crossSite,
  deleteAllSessions,
  deleteSession,
  guard,
  loginBlockedFor,
  passwordSource,
  recordLoginResult,
  sessionCookie,
  sessionValid,
  setPassword,
  tokenFromRequest,
  validateNewPassword,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  if (!authEnabled()) return NextResponse.json({ state: 'ok', passwordFromEnv: false, authDisabled: true });
  const source = passwordSource();
  const state = !source ? 'setup' : sessionValid(tokenFromRequest(request)) ? 'ok' : 'login';
  return NextResponse.json({ state, passwordFromEnv: source === 'env' });
}

function signedIn(request: Request) {
  const res = NextResponse.json({ ok: true });
  res.headers.append('Set-Cookie', sessionCookie(request, createSession(request.headers.get('user-agent'))));
  return res;
}

/** Body: { action: 'login' | 'setup' | 'logout' | 'logout-all' | 'change', ... } */
export async function POST(request: Request) {
  if (crossSite(request)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!authEnabled()) {
    return NextResponse.json({ error: 'Password protection is turned off (OPENCONNECT_PASSWORD_REQUIRED=false).' }, { status: 409 });
  }

  switch (body.action) {
    case 'setup': {
      if (passwordSource()) return NextResponse.json({ error: 'A password is already set.' }, { status: 409 });
      const wait = loginBlockedFor(request);
      if (wait) return NextResponse.json({ error: `Too many attempts. Try again in ${wait}s.` }, { status: 429 });
      const okCode = checkSetupCode(body.code);
      recordLoginResult(request, okCode);
      if (!okCode) return NextResponse.json({ error: 'That setup code is not right. Find it with: docker logs openconnect' }, { status: 403 });
      const invalid = validateNewPassword(body.password);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
      setPassword(body.password);
      return signedIn(request);
    }

    case 'login': {
      if (!passwordSource()) return NextResponse.json({ error: 'No password set yet.' }, { status: 409 });
      const wait = loginBlockedFor(request);
      if (wait) return NextResponse.json({ error: `Too many attempts. Try again in ${wait}s.` }, { status: 429 });
      const ok = typeof body.password === 'string' && checkPassword(body.password);
      recordLoginResult(request, ok);
      if (!ok) return NextResponse.json({ error: 'Wrong password.' }, { status: 401 });
      return signedIn(request);
    }

    case 'logout': {
      deleteSession(tokenFromRequest(request));
      const res = NextResponse.json({ ok: true });
      res.headers.append('Set-Cookie', sessionCookie(request, null));
      return res;
    }

    case 'logout-all': {
      const denied = guard(request);
      if (denied) return denied;
      deleteAllSessions();
      const res = NextResponse.json({ ok: true });
      res.headers.append('Set-Cookie', sessionCookie(request, null));
      return res;
    }

    case 'change': {
      const denied = guard(request);
      if (denied) return denied;
      if (passwordSource() === 'env') return NextResponse.json({ error: 'The password is set by OPENCONNECT_PASSWORD; change it there.' }, { status: 409 });
      const wait = loginBlockedFor(request);
      if (wait) return NextResponse.json({ error: `Too many attempts. Try again in ${wait}s.` }, { status: 429 });
      const ok = typeof body.current === 'string' && checkPassword(body.current);
      recordLoginResult(request, ok);
      if (!ok) return NextResponse.json({ error: 'Current password is wrong.' }, { status: 401 });
      const invalid = validateNewPassword(body.password);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
      setPassword(body.password, tokenFromRequest(request) || undefined);
      return NextResponse.json({ ok: true });
    }
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
