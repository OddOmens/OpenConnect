import { guard } from '@/lib/auth';
import { cardFor } from '@/lib/share-render/cards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Marketing cards rendered to PNG. Stats cards, styled like the dashboard:
//   /api/marketing?app=<id|all>&t=overview|reach|map|rating|review|milestone&range=30d&format=4x5&theme=dark
// Either kind takes &preview=1 (or &preview=s, smaller still) for a smaller image (the Marketing page's grid).
// Promo cards for one app, from its App Store listing:
//   /api/marketing?app=<id>&t=launch|update|screens|feature|store|loved|reviews|rated|milestone|download
//     &format=1x1|4x5|9x16|16x9&style=gradient&accent=3b82f6
//     &badge=1&rating=1&h=<headline>&sub=<tagline>&cta=<button text>&notes=<release notes / features>
//     &quotes=<review indexes, first in front>&n=1|3 (Reviews)
// &v=<version> (from /api/marketing/promo, or the page) lets the browser keep the card for good: a
// card whose data has changed since gets a new version, so a new URL.
// Drawing happens in lib/share-render/cards.tsx.

export async function GET(request: Request) {
  const denied = guard(request, { apiToken: 'marketing' });
  if (denied) return denied;
  const card = await cardFor(new URL(request.url).searchParams);
  if (!card.ok) return new Response(card.message, { status: card.status });
  const headers = {
    'Content-Type': 'image/png',
    ETag: card.etag,
    // Kept for good when the URL names the current version; else checked each time.
    'Cache-Control': card.current ? 'private, max-age=31536000, immutable' : 'private, no-cache',
  };
  if (request.headers.get('if-none-match') === card.etag) return new Response(null, { status: 304, headers });
  const png = await card.png();
  if (!png) return new Response('Unknown app', { status: 404 });
  return new Response(new Uint8Array(png), { headers });
}
