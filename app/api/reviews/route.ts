import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { reviews } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    const q = new URL(request.url).searchParams;
    const app = q.get('app');
    return NextResponse.json(
      reviews({
        appId: app && app !== 'all' ? app : undefined,
        country: q.get('country') || undefined,
        rating: Number(q.get('rating')) || undefined,
        limit: Math.max(1, Math.min(100, Math.trunc(Number(q.get('limit'))) || 20)),
        offset: Math.max(0, Math.trunc(Number(q.get('offset'))) || 0),
      })
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
