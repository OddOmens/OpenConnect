import { studioGuard, toRenderer } from '@/lib/studio/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Files the studio's render container serves under /studio: emoji, previews and exports. The editor
// is a page of this app (app/(studio)/studio) and the data API is app/studio/api.

async function forward(request: Request): Promise<Response> {
  return studioGuard(request) ?? toRenderer(request);
}

export { forward as GET, forward as HEAD };
