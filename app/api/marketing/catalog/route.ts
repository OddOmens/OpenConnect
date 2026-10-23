import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { listApps } from '@/lib/queries';
import { SHARE_RANGES } from '@/lib/share';
import { FORMATS, THEMES } from '@/lib/share-render/kit';
import { FORECAST_HORIZONS } from '@/lib/forecast';
import { PROMO_FORMATS, PROMO_FRAMES, PROMO_STYLES, PROMO_TEMPLATES, SHARE_HEROES, SHARE_STATS, SHARE_TEMPLATES } from '@/lib/prefs';

export const dynamic = 'force-dynamic';

/** Everything a script or Claude needs to use Marketing: the apps, every card option, and the endpoints. */
export function GET(request: Request) {
  const denied = guard(request, { apiToken: 'marketing' });
  if (denied) return denied;
  const apps = (listApps() as any[])
    .filter((a) => !a.hidden)
    .map((a) => ({ id: a.apple_id, name: a.name, bundleId: a.bundle_id, firstTimeDownloads: a.first_time_downloads }));
  return NextResponse.json({
    apps,
    statsCards: {
      templates: SHARE_TEMPLATES,
      ranges: { ...SHARE_RANGES, 'm:YYYY-MM': 'One calendar month' },
      formats: Object.fromEntries(Object.entries(FORMATS).map(([k, v]) => [k, `${v.width}×${v.height}`])),
      themes: Object.keys(THEMES),
      heroes: SHARE_HEROES,
      stats: SHARE_STATS,
    },
    promoCards: {
      templates: PROMO_TEMPLATES,
      styles: PROMO_STYLES,
      formats: PROMO_FORMATS,
      frames: PROMO_FRAMES,
    },
    forecastHorizons: FORECAST_HORIZONS,
    endpoints: {
      'GET /api/marketing/catalog': 'This list',
      'GET /api/marketing/stats?app=<id|all>&range=30d&hero=first_time': 'The figures on the cards, as JSON',
      'GET /api/forecast?app=<id|all>&horizon=30|90|365&currency=USD': 'Projections, conversion funnel, what-if scenarios, next milestone',
      'GET /api/marketing/promo?app=<id>': "One app's promo card material: screenshots, each template's default wording, quotable reviews",
      'GET /api/marketing?app=<id|all>&t=<stats template>&range=30d&format=4x5&theme=dark&hero=first_time&stats=a,b&list=1&pick=0': 'A stats card as PNG',
      'GET /api/marketing?app=<id>&t=<promo template>&format=4x5&style=gradient&accent=3b82f6&frame=2c2c30&badge=1&rating=1&h=<headline>&sub=<tagline>&cta=<button>&notes=<release notes>&shots=s:<id>,a:<n>&quotes=0,2&n=1|3':
        'A promo card as PNG. Headlines: \\n breaks lines',
    },
  });
}
