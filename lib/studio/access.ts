// Sign-in and forwarding for the screenshot studio's routes under /studio.

import { guard } from '@/lib/auth';

const STUDIO = (process.env.OPENCONNECT_STUDIO_URL || '').replace(/\/+$/, '');

/**
 * The response to send when a studio request isn't allowed, else null. Browsers come in with their
 * session; the studio's CLI and MCP server (Claude) with an API token. A person opening a studio
 * page signed out goes to sign-in and comes back.
 */
export function studioGuard(request: Request): Response | null {
  const denied = guard(request, { apiToken: 'studio' });
  if (!denied) return null;
  if (denied.status === 401 && request.method === 'GET' && !request.headers.has('authorization') && (request.headers.get('accept') || '').includes('text/html')) {
    const url = new URL(request.url);
    // Relative, so it works whatever address the dashboard was opened by.
    return new Response(null, { status: 303, headers: { location: `/login?next=${encodeURIComponent(url.pathname + url.search)}` } });
  }
  return denied;
}

/** This studio as the client sees it, for links in API responses (editor URLs, asset URLs). */
export function studioPublicBase(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  return `${proto}://${host}/studio`;
}

// Hop-by-hop headers, and credentials meant for the dashboard, never go to the render container.
const DROP_REQUEST = ['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'cookie', 'authorization', 'content-length'];
// fetch() has already decoded the body, so its encoding and length no longer apply.
const DROP_RESPONSE = ['connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length', 'set-cookie'];

/**
 * Pass a request on to the studio's render container (rendering, previews, exports, emoji). Paths
 * go through unchanged: that server runs under /studio too. Call studioGuard first.
 */
export async function toRenderer(request: Request): Promise<Response> {
  if (!STUDIO) return Response.json({ error: 'The screenshot studio renderer is not set up (OPENCONNECT_STUDIO_URL).' }, { status: 503 });
  const url = new URL(request.url);
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!DROP_REQUEST.includes(key)) headers.set(key, value);
  });
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
      // @ts-expect-error Node needs this to stream a request body.
      duplex: 'half',
    });
  } catch (err: any) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json({ error: `The screenshot studio renderer is not reachable (${err?.cause?.code || err?.message || 'error'}).` }, { status: 502 });
  }
  const out = new Headers();
  res.headers.forEach((value, key) => {
    if (!DROP_RESPONSE.includes(key)) out.set(key, value);
  });
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}
