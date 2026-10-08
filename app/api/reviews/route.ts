import { NextResponse } from 'next/server';
import { reviews } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const app = q.get('app');
    return NextResponse.json(
      reviews({
        appId: app && app !== 'all' ? app : undefined,
        country: q.get('country') || undefined,
        rating: Number(q.get('rating')) || undefined,
        limit: Math.min(100, Number(q.get('limit')) || 20),
        offset: Number(q.get('offset')) || 0,
      })
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
