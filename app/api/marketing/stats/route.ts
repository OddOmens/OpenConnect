import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { isShareRange, milestoneShare, shareData, type ShareRange } from '@/lib/share';
import { SHARE_HEROES, type ShareHeroId } from '@/lib/prefs';

export const dynamic = 'force-dynamic';

/**
 * The figures the Marketing cards show, as JSON, for writing posts around them:
 * GET /api/marketing/stats?app=<id|all>&range=30d|90d|365d|ytd|all|m:YYYY-MM&hero=first_time.
 */
export function GET(request: Request) {
  const denied = guard(request, { apiToken: 'marketing' });
  if (denied) return denied;
  const q = new URL(request.url).searchParams;
  const app = q.get('app');
  const appId = app && app !== 'all' ? app : undefined;
  const range: ShareRange = isShareRange(q.get('range')) ? (q.get('range') as ShareRange) : '30d';
  const hero = (q.get('hero') && q.get('hero')! in SHARE_HEROES ? q.get('hero') : 'first_time') as ShareHeroId;
  const overview = shareData(appId, range, hero);
  if (!overview) return NextResponse.json({ error: 'Unknown app' }, { status: 404 });
  const { icons: _icons, topApps, ...rest } = overview;
  const milestone = milestoneShare(appId);
  return NextResponse.json({
    app: appId ?? 'all',
    range,
    ...rest,
    topApps: topApps.map(({ name, downloads }) => ({ name, downloads })),
    allTime: milestone && {
      firstTimeDownloads: milestone.downloads,
      milestone: milestone.milestone,
      countriesReached: milestone.countries,
      storefronts: milestone.totalCountries,
      rating: milestone.rating,
      ratingCount: milestone.ratingCount,
      since: milestone.since,
    },
  });
}
