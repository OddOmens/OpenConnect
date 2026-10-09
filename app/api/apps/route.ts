import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { setAppHidden } from '@/lib/queries';
import { appsResponse } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    return NextResponse.json(appsResponse());
  } catch (error: any) {
    return NextResponse.json({ apps: [], error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    if (!body.apple_id) {
      return NextResponse.json({ error: 'Missing apple_id' }, { status: 400 });
    }
    setAppHidden(String(body.apple_id), typeof body.hidden === 'boolean' ? body.hidden : undefined);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
