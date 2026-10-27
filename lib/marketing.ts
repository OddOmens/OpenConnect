// Data for the marketing promo cards: one app's App Store listing (screenshots, version,
// release notes, price) plus the numbers worth bragging about (rating, downloads, reach).

import { cached } from './cache';
import { readCachedSync, writeCached } from './disk-cache';
import { listApps, reach, reviews, storePresence } from './queries';
import type { PromoTemplateId } from './prefs';

export interface Listing {
  version: string | null;
  versionDate: string | null;    // YYYY-MM-DD of the current version
  releaseNotes: string;
  description: string;
  price: string;                 // "Free", "$2.99"
  genre: string | null;
  seller: string | null;
  storeUrl: string | null;
  screenshots: { url: string; ratio: number }[]; // ratio = height / width
}

// The listing changes only on an App Store release, so a few hours is plenty. It's kept on disk
// too: after that a card never waits for Apple. An older copy is used at once while a new one is
// fetched in the background.
const LISTING_TTL = 6 * 60 * 60 * 1000;
const listingCache = new Map<string, { at: number; listing: Listing | null }>();
// Lookups under way, so the cards that load together share one.
const listingLoads = new Map<string, Promise<Listing | null>>();

/** Screenshot URL at a size that's sharp on a 1080 px card without being a megabyte PNG. */
function screenshotUrl(url: string) {
  return url.replace(/\/\d+x\d+bb\.\w+$/, '/600x1300bb.jpg');
}

function ratioOf(url: string) {
  const m = url.match(/\/(\d+)x(\d+)bb\.\w+$/);
  return m ? Number(m[2]) / Number(m[1]) : 2.165;
}

export function listing(appId: string): Promise<Listing | null> {
  let hit = listingCache.get(appId);
  if (!hit) {
    const saved = readCachedSync('listings', appId, '.json');
    if (saved) {
      try {
        hit = JSON.parse(saved.toString('utf8')) as { at: number; listing: Listing | null };
        listingCache.set(appId, hit);
      } catch {
        // unreadable: looked up again below
      }
    }
  }
  const fresh = hit && Date.now() - hit.at < LISTING_TTL;
  if (fresh) return Promise.resolve(hit!.listing);
  let load = listingLoads.get(appId);
  if (!load) {
    load = lookup(appId, hit?.listing ?? null).finally(() => listingLoads.delete(appId));
    listingLoads.set(appId, load);
  }
  // Stale but known: use it now, the new one is on its way.
  return hit?.listing ? Promise.resolve(hit.listing) : load;
}

async function lookup(appId: string, previous: Listing | null): Promise<Listing | null> {
  let result: Listing | null = null;
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(appId)}&country=us&entity=software`, {
      cache: 'no-store',
      headers: { 'User-Agent': 'OpenConnect/1.0' },
    });
    const r = res.ok ? (await res.json())?.results?.[0] : null;
    if (r) {
      // iPhone screenshots only: the cards draw them in iPhones.
      const shots: string[] = r.screenshotUrls || [];
      result = {
        version: r.version || null,
        versionDate: r.currentVersionReleaseDate ? String(r.currentVersionReleaseDate).slice(0, 10) : null,
        releaseNotes: r.releaseNotes || '',
        description: r.description || '',
        price: r.formattedPrice || (r.price === 0 ? 'Free' : ''),
        genre: r.primaryGenreName || null,
        seller: r.sellerName || null,
        storeUrl: r.trackViewUrl ? String(r.trackViewUrl).split('?')[0] : null,
        screenshots: shots.slice(0, 10).map((u) => ({ url: screenshotUrl(u), ratio: ratioOf(u) })),
      };
    }
  } catch {
    // Not on the store (yet), or offline: the cards fall back to what the database knows.
  }
  if (result) {
    const entry = { at: Date.now(), listing: result };
    listingCache.set(appId, entry);
    writeCached('listings', appId, JSON.stringify(entry), '.json');
  } else {
    // Keep a copy we had; don't hold on to a failed lookup for long.
    listingCache.set(appId, { at: Date.now() - LISTING_TTL + 60_000, listing: previous });
  }
  return result ?? previous;
}

// The card font has no emoji, so they're dropped from quoted text rather than drawn as boxes.
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}‍️⃣]/gu;
export const plain = (text: string) => text.replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ').trim();

/** Release notes as short bullet points: one per line or sentence, list markers removed. */
export function noteBullets(notes: string, max: number): string[] {
  const lines = plain(notes)
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:[-•*–·]|\d+[.)])\s*/, '').trim())
    .filter((l) => l && !/^(what'?s new|new in|changes|bug fixes and improvements:?)$/i.test(l));
  // One long paragraph: split it into sentences instead.
  const items = lines.length === 1 ? lines[0].split(/(?<=[.!?])\s+(?=[A-Z])/) : lines;
  return items.map((l) => l.replace(/[.:]$/, '')).filter(Boolean).slice(0, max);
}

// A description's feature list: lines that start with a bullet, a check or an emoji.
const BULLET = /^\s*(?:[-•*–·✓✔★☆▶►●○▪■◆◇➤→]|\p{Extended_Pictographic})/u;

/** Features from the App Store description: its bulleted lines, else the sentences after the first. */
export function featureList(description: string, max = 6): string[] {
  const lines = description.split(/\n+/);
  const bulleted = lines.filter((l) => BULLET.test(l)).map((l) => plain(l).replace(/^[\s\-•*–·✓✔★☆▶►●○▪■◆◇➤→:]+/u, '').trim());
  const items = bulleted.filter((l) => l.length >= 3 && l.length <= 90);
  if (items.length >= 2) return items.slice(0, max);
  const sentences = plain(description).split(/(?<=[.!?])\s+|\n+/).slice(1);
  return sentences.map((l) => l.replace(/[.!]$/, '').trim()).filter((l) => l.length >= 12 && l.length <= 90).slice(0, max);
}

/** The first sentence of the description: a ready-made tagline. */
export function firstSentence(text: string, max = 110): string {
  const first = plain(text).split(/\n/)[0]?.split(/(?<=[.!?])\s/)[0] ?? '';
  return first.length > max ? first.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : first;
}

export interface PromoData {
  appId: string;
  name: string;
  icon: string | null;
  listing: Listing | null;
  rating: number | null;
  ratingCount: number;
  downloads: number;            // first-time, all time
  countries: number;
  reached: string[];            // storefronts (country codes) with downloads, all time
  storefronts: number;          // how many App Store storefronts there are
  quotes: { title: string; body: string; reviewer: string; rating: number }[]; // up to 12; the Reviews card picks from these
}

/**
 * The card's data. The database part is worked out once per data version (a sync, a new day), not
 * once per card: reach() reads every download, and a page of cards asks for it ten times.
 */
export async function promoData(appId: string): Promise<PromoData | null> {
  const known = cached(`promo-data|${appId}`, () => {
    const app = (listApps() as any[]).find((a) => a.apple_id === appId);
    if (!app) return null;
    const store = storePresence(appId).summary;
    const r = cached('promo-reach', () => reach({}));
    // Short, glowing reviews quote best on a card.
    const quotes = (reviews({ appId, rating: 5, limit: 100, offset: 0 }).items as any[])
      .map((q) => ({ title: plain(q.title || ''), body: plain(q.body || ''), reviewer: plain(q.reviewer || '') || 'App Store reviewer', rating: q.rating }))
      .filter((q) => q.body.length >= 20 && q.body.length <= 220)
      .slice(0, 12);
    return {
      appId,
      name: app.name.split(':')[0],
      icon: app.icon_url ?? null,
      rating: store.rating,
      ratingCount: store.rating_count,
      downloads: app.first_time_downloads,
      countries: r.apps[appId]?.count ?? 0,
      reached: Object.keys(r.apps[appId]?.countries ?? {}),
      storefronts: r.total,
      quotes,
    };
  });
  return known && { ...known, listing: await listing(appId) };
}

/** Each template's own wording, used where a card's text is left empty. */
export function defaultCopy(t: PromoTemplateId, data: PromoData) {
  const version = data.listing?.version;
  const headline = {
    launch: `Meet ${data.name}`,
    update: version ? `Version\n${version}\nIs Here!` : `${data.name} just got better`,
    screens: `See ${data.name}\nIn Action`,
    loved: data.countries > 1 ? `Loved In\n${data.countries} Countries` : `People Love\n${data.name}`,
    reviews: `People Love\n${data.name}`,
    download: `Get ${data.name}${data.listing?.price === 'Free' ? ' free' : ''}`,
    feature: `Why\n${data.name}?`,
    store: 'Now On The\nApp Store',
    rated: data.rating != null && data.rating >= 4.5 && data.ratingCount > 0 ? 'Top Rated\nOn The App Store' : `People Love\n${data.name}`,
    milestone: 'Thank You!',
  }[t];
  const description = data.listing?.description ?? '';
  const tagline =
    t === 'milestone'
      ? `To everyone using ${data.name}${data.countries > 1 ? ` in ${data.countries} countries` : ''}.`
      : firstSentence(description);
  // Features lists the description's bullet points; What's New, the release notes.
  const notes = t === 'feature' ? featureList(description).join('\n') : data.listing?.releaseNotes ?? '';
  return { headline, tagline, cta: '', notes };
}
