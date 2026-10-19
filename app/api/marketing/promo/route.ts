import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { defaultCopy, promoData } from '@/lib/marketing';
import { PROMO_TEMPLATES, type PromoTemplateId } from '@/lib/prefs';
import { promoScreens } from '@/lib/promo-screens';

export const dynamic = 'force-dynamic';

/**
 * What the Marketing page needs to edit one app's promo cards: the screenshots they can show
 * (studio screens, then App Store ones), each template's own wording (shown as placeholders), and
 * the reviews the Reviews card can quote.
 */
export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const app = new URL(request.url).searchParams.get('app');
  if (!app || !/^\d+$/.test(app)) return NextResponse.json({ error: 'Which app?' }, { status: 400 });
  const [screens, data] = await Promise.all([promoScreens(app), promoData(app)]);
  if (!data) return NextResponse.json({ error: 'Unknown app' }, { status: 404 });
  const copy = Object.fromEntries((Object.keys(PROMO_TEMPLATES) as PromoTemplateId[]).map((t) => [t, defaultCopy(t, data)]));
  const quotes = data.quotes.map((q, index) => ({ index, body: q.body, reviewer: q.reviewer, rating: q.rating }));
  return NextResponse.json({ ...screens, copy, quotes });
}
