import { guard } from '@/lib/auth';
import { studioThumb } from '@/lib/promo-screens';

export const dynamic = 'force-dynamic';

/**
 * A studio screen at the size the Marketing page's screenshot picker shows it (the full asset is
 * often megabytes): GET /api/marketing/thumb?app=<apple id>&asset=<studio asset id>.
 */
export async function GET(request: Request) {
  const denied = guard(request, { apiToken: 'marketing' });
  if (denied) return denied;
  const q = new URL(request.url).searchParams;
  const app = q.get('app');
  const asset = q.get('asset');
  if (!app || !/^\d+$/.test(app) || !asset || !/^[\w.-]{1,80}$/.test(asset)) return new Response('Which screenshot?', { status: 400 });
  const png = await studioThumb(app, asset);
  if (!png) return new Response('Not found', { status: 404 });
  // Asset ids are content-unique, so the thumbnail never changes.
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=31536000, immutable' } });
}
