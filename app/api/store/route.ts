import { NextResponse } from 'next/server';
import { storePresence } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const app = new URL(request.url).searchParams.get('app');
    return NextResponse.json(storePresence(app && app !== 'all' ? app : undefined));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
