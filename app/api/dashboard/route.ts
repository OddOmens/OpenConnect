import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { dashboardResponse } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    const q = new URL(request.url).searchParams;
    return NextResponse.json(
      dashboardResponse({
        app: q.get('app'),
        range: q.get('range'),
        start: q.get('start'),
        end: q.get('end'),
        granularity: q.get('granularity'),
        currency: q.get('currency'),
        compare: q.get('compare') !== '0',
      })
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
