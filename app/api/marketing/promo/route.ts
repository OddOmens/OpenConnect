import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { promoInfo } from '@/lib/promo-screens';

export const dynamic = 'force-dynamic';

/**
 * What the Marketing page needs to edit one app's promo cards: the screenshots they can show
 * (studio screens, then App Store ones), each template's own wording (shown as placeholders), and
 * the reviews the Reviews card can quote.
 */
export async function GET(request: Request) {
  const denied = guard(request, { apiToken: 'marketing' });
  if (denied) return denied;
  const app = new URL(request.url).searchParams.get('app');
  if (!app || !/^\d+$/.test(app)) return NextResponse.json({ error: 'Which app?' }, { status: 400 });
  const info = await promoInfo(app);
  if (!info) return NextResponse.json({ error: 'Unknown app' }, { status: 404 });
  return NextResponse.json(info);
}
