import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { keywordDetail } from '@/lib/aso';
import { TERRITORY_BY_CODE } from '@/lib/territories';

export const dynamic = 'force-dynamic';

/** One keyword, searched live: GET /api/aso/keyword?term=focus%20timer&country=US. */
export async function GET(request: Request) {
  const denied = guard(request, { apiToken: ['marketing', 'aso'] });
  if (denied) return denied;
  const q = new URL(request.url).searchParams;
  const term = (q.get('term') || '').trim();
  const country = q.get('country') || 'US';
  if (!term || term.length > 100 || !(country in TERRITORY_BY_CODE)) return NextResponse.json({ error: 'Which keyword?' }, { status: 400 });
  try {
    return NextResponse.json(await keywordDetail(term, country));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
