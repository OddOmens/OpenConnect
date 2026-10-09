import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { getCoverage, getJobStates, lastRun, resetSyncState, startJob } from '@/lib/sync';
import { getSyncConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    const states = getJobStates();
    return NextResponse.json({
      jobs: states,
      lastRuns: { asc: lastRun('asc') || null, store: lastRun('store') || null },
      coverage: getCoverage(),
      config: getSyncConfig(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Body: { job?: 'asc' | 'store' | 'all', reset?: 'errors' | 'all' } */
export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.reset === 'errors' || body.reset === 'all') {
      resetSyncState(body.reset);
    }
    const job = body.job || 'all';
    const started: string[] = [];
    if ((job === 'asc' || job === 'all') && startJob('asc', 'manual')) started.push('asc');
    if ((job === 'store' || job === 'all') && startJob('store', 'manual')) started.push('store');
    return NextResponse.json({ started, jobs: getJobStates() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
