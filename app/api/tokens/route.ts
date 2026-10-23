import { NextResponse } from 'next/server';
import { createApiToken, deleteApiToken, guard, listApiTokens, TOKEN_SCOPES, type TokenScope } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// API tokens (Settings → Security). Managing them needs a signed-in browser: a token can't
// list, create or revoke tokens.

export function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  return NextResponse.json({ tokens: listApiTokens() });
}

/** Body: { name, scopes }. The token is in the response once; only its hash is stored. */
export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const scopes = Array.isArray(body.scopes) ? body.scopes.filter((s: unknown): s is TokenScope => typeof s === 'string' && s in TOKEN_SCOPES) : ['studio'];
  if (!scopes.length) return NextResponse.json({ error: 'Pick at least one thing the token can open.' }, { status: 400 });
  const { token, info } = createApiToken(typeof body.name === 'string' ? body.name : '', scopes);
  return NextResponse.json({ token, info });
}

export function DELETE(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which token?' }, { status: 400 });
  deleteApiToken(id);
  return NextResponse.json({ ok: true });
}
