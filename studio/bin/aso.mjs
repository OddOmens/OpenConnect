// OpenConnect ASO from Claude: keyword ranks, listing audits and search figures, and changes to the
// App Store listing in App Store Connect. Over OpenConnect's API: reading needs a token with the
// Marketing or ASO changes scope; tracking keywords and changing listings need ASO changes.
// Shared by the CLI and MCP server. Needs OPENCONNECT_URL.

import { ORIGIN } from './remote.mjs';

async function call(url, body) {
  if (!ORIGIN) throw new Error('ASO lives in OpenConnect: set OPENCONNECT_URL and OPENCONNECT_TOKEN (a token with the ASO changes scope, or Marketing to read only).');
  let res;
  try {
    res = await fetch(ORIGIN + url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  } catch (e) {
    throw new Error(`Can't reach OpenConnect at ${ORIGIN} (${e.cause?.code ?? e.message}).`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString();

/** Every visible app: listing score, wasted keyword characters, keywords in the top 10, search impressions and conversion. */
export const portfolio = ({ days } = {}) => call(`/api/aso?${qs({ app: 'all', days })}`);

/** OpenConnect's app id for an id, exact name or name prefix. */
export async function resolveApp(ref) {
  if (ref == null || ref === '') throw new Error('Which app? Give its name or id (aso_overview without an app lists them).');
  const r = String(ref).toLowerCase();
  const { apps } = await portfolio();
  const hit =
    apps.find((a) => a.apple_id === String(ref)) ??
    apps.find((a) => a.name.toLowerCase() === r) ??
    apps.find((a) => a.name.toLowerCase().split(':')[0].trim() === r) ??
    apps.find((a) => a.name.toLowerCase().startsWith(r));
  if (!hit) throw new Error(`No app "${ref}" in OpenConnect. Apps: ${apps.map((a) => a.name.split(':')[0]).join(', ')}`);
  return hit.apple_id;
}

/**
 * One app in one storefront, trimmed for reading: the listing in every locale (live and the version
 * being prepared), tracked keywords with rank, change, popularity, difficulty and the top 5, the
 * search funnel, locale gaps, keyword ideas and the change timeline with before/after impact.
 */
export async function overview({ app, country, days }) {
  const id = await resolveApp(app);
  const o = await call(`/api/aso?${qs({ app: id, country, days })}`);
  // Descriptions aren't indexed for search on iOS and are long in every locale: an excerpt is enough here.
  const excerpt = (t) => (t && t.length > 300 ? `${t.slice(0, 300)}… (${[...t].length} characters)` : t);
  const brief = (l) => ({ ...l, description: excerpt(l.description), whats_new: excerpt(l.whats_new) });
  return {
    ...o,
    listing: { ...o.listing, live: o.listing.live.map(brief), draft: o.listing.draft.map(brief) },
    keywords: o.keywords.map(({ history, top, hintPrefix, hintPosition, ...k }) => ({
      ...k,
      top5: top.slice(0, 5).map((h) => ({ name: h.name, ratings: h.ratings, rating: h.rating, ours: h.id === id || undefined })),
    })),
    funnel: { ...o.funnel, weekly: o.funnel.weekly.slice(-8) },
    changes: o.changes.slice(0, 12),
    storefrontsWithSuggestions: undefined,
  };
}

/** Live search for one keyword: top 25 apps, App Store suggestions, difficulty. */
export const keyword = ({ keyword: term, country }) => call(`/api/aso/keyword?${qs({ term, country })}`);

export async function track({ app, country = 'US', keywords, remove = false }) {
  const id = await resolveApp(app);
  if (!remove) return call('/api/aso', { action: 'add-keywords', app: id, country, keywords });
  const out = [];
  for (const k of keywords) out.push(await call('/api/aso', { action: 'remove-keyword', app: id, country, keyword: k }).then(() => k, (e) => `${k}: ${e.message}`));
  return { removed: out };
}

/** Fetch the listing from App Store Connect again and rank the app's keywords (the storefront's now, the rest in the background). */
export const refresh = async ({ app, country }) => call('/api/aso', { action: 'refresh', app: await resolveApp(app), country });

export const note = async ({ app, date, note: text }) => call('/api/aso', { action: 'add-note', app: await resolveApp(app), date: date ?? new Date().toISOString().slice(0, 10), note: text });

/**
 * Plan a listing change for one locale (apply false: nothing is sent to Apple) or make it (apply
 * true). Returns each field's old → new text and where it's written, fields that can't change now
 * and why, and the listing score before and after.
 */
export async function update({ app, locale, apply = false, ...changes }) {
  const fields = Object.fromEntries(Object.entries(changes).filter(([k, v]) => ['name', 'subtitle', 'keywords', 'promotional_text', 'description', 'whats_new'].includes(k) && typeof v === 'string'));
  return call('/api/aso', { action: 'update-listing', app: await resolveApp(app), locale, changes: fields, apply });
}

export function describePlan(p) {
  const lines = [`${p.applied ? 'Changed' : 'Planned change to'} the ${p.locale_name} (${p.locale}) listing:`];
  for (const i of p.items) lines.push(`- ${i.field} → ${i.target} (${i.length}/${i.limit})\n    was: ${i.old || '(empty)'}\n    now: ${i.new || '(empty)'}`);
  if (!p.items.length && !p.blocked.length) lines.push('- nothing differs from App Store Connect');
  for (const b of p.blocked) lines.push(`- ${b.field} can't change: ${b.reason}`);
  if (p.before && p.after) lines.push(`Listing score ${p.before.score} → ${p.after.score}; wasted keyword characters ${p.before.wastedChars} → ${p.after.wastedChars}.`);
  if (!p.applied && p.items.length && !p.blocked.length) lines.push('Nothing was sent to Apple. Apply it with apply: true once the user agrees.');
  if (!p.applied && p.blocked.length) lines.push('Nothing can be applied until every field can change.');
  return lines.join('\n');
}
