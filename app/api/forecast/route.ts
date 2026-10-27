import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { getUiPrefs } from '@/lib/config';
import { forecast, isHorizon } from '@/lib/forecast';
import { CURRENCIES } from '@/lib/prefs';

export const dynamic = 'force-dynamic';

/**
 * Projections for one app or all visible apps: GET /api/forecast?app=<id|all>&horizon=30|90|365&currency=USD.
 * Also open to API tokens with the Marketing scope.
 */
export function GET(request: Request) {
  const denied = guard(request, { apiToken: 'marketing' });
  if (denied) return denied;
  const q = new URL(request.url).searchParams;
  const app = q.get('app');
  if (app && app !== 'all' && !/^\d+$/.test(app)) return NextResponse.json({ error: 'Which app?' }, { status: 400 });
  const horizon = isHorizon(q.get('horizon')) ? (Number(q.get('horizon')) as 30 | 90 | 365) : 30;
  const currency = (CURRENCIES as readonly string[]).includes(q.get('currency') || '') ? q.get('currency')! : getUiPrefs().currency;
  try {
    return NextResponse.json(forecast(app && app !== 'all' ? app : undefined, horizon, currency));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
