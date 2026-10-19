import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { promoScreens } from '@/lib/promo-screens';

export const dynamic = 'force-dynamic';

/** Screenshots a promo card can show for one app: its studio screens, then its App Store ones. */
export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const app = new URL(request.url).searchParams.get('app');
  if (!app || !/^\d+$/.test(app)) return NextResponse.json({ error: 'Which app?' }, { status: 400 });
  return NextResponse.json(await promoScreens(app));
}
