import { NextResponse } from 'next/server';
import { dashboard, dataBounds } from '@/lib/queries';
import { resolveRange } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const appId = q.get('app') && q.get('app') !== 'all' ? q.get('app')! : undefined;
    const { start, end } = resolveRange(q.get('range'), q.get('start'), q.get('end'));
    const granularity = (['day', 'week', 'month'].includes(q.get('granularity') || '') ? q.get('granularity') : 'day') as
      | 'day'
      | 'week'
      | 'month';
    const data = dashboard({ appId, start, end }, granularity, q.get('currency') || 'USD', q.get('compare') !== '0');
    return NextResponse.json({ range: { start, end }, bounds: dataBounds(appId), ...data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
