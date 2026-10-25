import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { buildRecap, sendSignal } from '@/lib/notify';

export const dynamic = 'force-dynamic';

/** The daily recap as it would be sent now: GET /api/notify. Also open to API tokens with the Marketing scope. */
export function GET(request: Request) {
  const denied = guard(request, { apiToken: 'marketing' });
  if (denied) return denied;
  try {
    return NextResponse.json({ text: buildRecap().text });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** { action: 'test' } sends a short test message; { action: 'recap' } sends the daily recap now (the scheduled one still goes out). */
export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const { action } = await request.json().catch(() => ({}));
  try {
    if (action === 'test') await sendSignal('✅ OpenConnect can send notifications here.');
    else if (action === 'recap') await sendSignal(buildRecap().text);
    else return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
