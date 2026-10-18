import { handle } from '@studio-server/api';
import { studioGuard, studioPublicBase, toRenderer } from '@/lib/studio/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The screenshot studio's API at /studio/api. Apps, slides, screenshots, sets and translations are
// answered here, from the studio's files in the data folder (studio/server/api.ts, the same code
// the standalone studio runs). Rendering, previews, exports and emoji search need Chromium or the
// bundled emoji, so those go on to the render container.

const host = { publicBase: studioPublicBase };

async function studioApi(request: Request): Promise<Response> {
  const denied = studioGuard(request);
  if (denied) return denied;
  if (!process.env.APPSHOT_DATA) {
    return Response.json({ error: 'The screenshot studio has no data folder (APPSHOT_DATA).' }, { status: 503 });
  }
  const apiPath = new URL(request.url).pathname.replace(/^\/studio\/api/, '') || '/';
  return (await handle(request, apiPath, host)) ?? toRenderer(request);
}

export { studioApi as GET, studioApi as HEAD, studioApi as POST, studioApi as PUT, studioApi as PATCH, studioApi as DELETE };
