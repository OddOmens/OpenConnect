import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { storeResponse } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    const app = new URL(request.url).searchParams.get('app');
    return NextResponse.json(storeResponse(app));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
