import { guard } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The screenshot studio's server (studio/, its own container with headless Chromium) behind the
// dashboard's sign-in: its API (/studio/api/…), emoji, previews and exports. The editor itself is
// a page of this app (app/(studio)/studio). Browsers come in with their session; the studio's CLI
// and MCP server (Claude) with an API token. Paths pass through unchanged: the studio server runs
// under /studio (BASE_PATH), so its API, live updates and uploads all just work.

const STUDIO = (process.env.OPENCONNECT_STUDIO_URL || '').replace(/\/+$/, '');

// Hop-by-hop headers, and credentials meant for the dashboard, never go to the studio.
const DROP_REQUEST = ['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'cookie', 'authorization', 'content-length'];
// fetch() has already decoded the body, so its encoding and length no longer apply.
const DROP_RESPONSE = ['connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length', 'set-cookie'];

async function proxy(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const denied = guard(request, { apiToken: true });
  if (denied) {
    // A person opening the studio signed out goes to sign-in and comes back.
    if (denied.status === 401 && request.method === 'GET' && !request.headers.has('authorization') && (request.headers.get('accept') || '').includes('text/html')) {
      // Relative, so it works whatever address the dashboard was opened by.
      return new Response(null, { status: 303, headers: { location: `/login?next=${encodeURIComponent(url.pathname + url.search)}` } });
    }
    return denied;
  }
  if (!STUDIO) return Response.json({ error: 'The screenshot studio is not set up (OPENCONNECT_STUDIO_URL).' }, { status: 503 });

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!DROP_REQUEST.includes(key)) headers.set(key, value);
  });
  // So the studio's links (editor URLs, screenshot URLs) point at this server, not at itself.
  headers.set('x-forwarded-host', request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host);
  headers.set('x-forwarded-proto', request.headers.get('x-forwarded-proto') || url.protocol.replace(':', ''));

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  let res: Response;
  try {
    res = await fetch(`${STUDIO}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: 'manual',
      signal: request.signal,
      cache: 'no-store',
      // @ts-expect-error Node needs this to stream a request body (uploads).
      duplex: 'half',
    });
  } catch (err: any) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json({ error: `The screenshot studio is not reachable (${err?.cause?.code || err?.message || 'error'}).` }, { status: 502 });
  }

  const out = new Headers();
  res.headers.forEach((value, key) => {
    if (!DROP_RESPONSE.includes(key)) out.set(key, value);
  });
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as HEAD };
