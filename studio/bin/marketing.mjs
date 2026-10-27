// OpenConnect Marketing from Claude: the figures, projections and PNG cards the dashboard's Marketing
// page makes, over OpenConnect's API with a token that has the Marketing scope. Shared by the CLI and
// MCP server. Needs OPENCONNECT_URL (a standalone studio has no Marketing).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ORIGIN } from './remote.mjs';

export const STATS_TEMPLATES = ['overview', 'reach', 'map', 'rating', 'review', 'milestone'];
export const PROMO_TEMPLATES = ['launch', 'update', 'screens', 'loved', 'reviews', 'download'];
export const OUT_DIR = path.join(os.homedir(), '.openappshot', 'marketing');

async function get(url, accept = 'application/json') {
  if (!ORIGIN) throw new Error('Marketing lives in OpenConnect: set OPENCONNECT_URL and OPENCONNECT_TOKEN (a token with the Marketing scope).');
  let res;
  try {
    res = await fetch(ORIGIN + url, { headers: { accept } });
  } catch (e) {
    throw new Error(`Can't reach OpenConnect at ${ORIGIN} (${e.cause?.code ?? e.message}).`);
  }
  if (!res.ok) {
    const err = await res.json().catch(async () => ({ error: (await res.text().catch(() => '')) || res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return accept.includes('json') ? res.json() : Buffer.from(await res.arrayBuffer());
}

let catalogCache;
export async function catalog() {
  catalogCache ??= await get('/api/marketing/catalog');
  return catalogCache;
}

/** OpenConnect's app id for an id, exact name, name prefix or bundle id; "all" stays "all". */
export async function resolveApp(ref) {
  if (ref == null || ref === '' || String(ref).toLowerCase() === 'all') return 'all';
  const r = String(ref).toLowerCase();
  const { apps } = await catalog();
  const hit =
    apps.find((a) => a.id === String(ref)) ??
    apps.find((a) => a.name.toLowerCase() === r || a.bundleId?.toLowerCase() === r) ??
    apps.find((a) => a.name.toLowerCase().split(':')[0].trim() === r) ??
    apps.find((a) => a.name.toLowerCase().startsWith(r));
  if (!hit) throw new Error(`No app "${ref}" in OpenConnect. Apps: ${apps.map((a) => a.name).join(', ')}`);
  return hit.id;
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString();

export const stats = async ({ app, range, hero }) => get(`/api/marketing/stats?${qs({ app: await resolveApp(app), range, hero })}`);
export const forecast = async ({ app, horizon, currency }) => get(`/api/forecast?${qs({ app: await resolveApp(app), horizon, currency })}`);
export async function promoMaterial({ app }) {
  const id = await resolveApp(app);
  if (id === 'all') throw new Error('Promo cards are for one app.');
  return get(`/api/marketing/promo?app=${id}`);
}

/**
 * Render a card. Stats templates take range/format(4x5|9x16)/theme/hero/stats/list/pick; promo templates
 * take format(1x1|4x5|9x16|16x9)/style/accent/frame/badge/rating/headline/tagline/cta/notes/shots/quotes/reviews.
 * Saves the full-size PNG and returns its path, plus a smaller preview when asked.
 */
export async function card(o, { preview = false } = {}) {
  const t = o.template ?? 'overview';
  if (![...STATS_TEMPLATES, ...PROMO_TEMPLATES].includes(t)) throw new Error(`Unknown template "${t}". Stats: ${STATS_TEMPLATES.join(', ')}. Promo: ${PROMO_TEMPLATES.join(', ')}.`);
  const app = await resolveApp(o.app);
  const promo = PROMO_TEMPLATES.includes(t);
  if (promo && app === 'all') throw new Error('Promo cards are for one app.');
  const hex = (c) => (c ? String(c).replace(/^#/, '') : undefined);
  const flag = (b) => (b === undefined ? undefined : b ? 1 : 0);
  const list = (v) => (Array.isArray(v) ? v.join(',') : v);
  const params = promo
    ? {
        app, t, format: o.format, style: o.style, accent: hex(o.accent), frame: hex(o.frame), badge: flag(o.badge), rating: flag(o.rating),
        h: o.headline, sub: o.tagline, cta: o.cta, notes: o.notes, shots: list(o.shots), quotes: list(o.quotes), n: o.reviews,
      }
    : { app, t, range: o.range, format: o.format, theme: o.theme, hero: o.hero, stats: list(o.stats), list: flag(o.list), pick: o.pick };
  const png = await get(`/api/marketing?${qs(params)}`, 'image/png');
  const name = `${app}-${t}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`;
  const file = path.resolve(String(o.out ?? path.join(OUT_DIR, name)).replace(/^~(?=$|\/)/, os.homedir()));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
  const small = preview ? await get(`/api/marketing?${qs({ ...params, preview: 1 })}`, 'image/png') : null;
  return { path: file, bytes: png.length, preview: small, url: `${ORIGIN}/api/marketing?${qs(params)}` };
}

// ---------- plain-text summaries ----------

const n = (v) => Math.round(v).toLocaleString('en-US');
const pct = (v, d = 2) => (v == null ? '—' : `${(v * 100).toFixed(d)}%`);

export function describeForecast(f) {
  const money = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: f.currency, maximumFractionDigits: Math.abs(v) < 10 ? 2 : 0 }).format(v);
  const lines = [`Projections for ${f.appId ? `app ${f.appId}` : 'all apps'}, ${f.horizonLabel.toLowerCase()}, rough 80% ranges:`];
  for (const m of Object.values(f.metrics)) {
    const fmt = m.metric === 'proceeds' ? money : n;
    lines.push(
      m.unavailable
        ? `  ${m.label}: ${m.unavailable}`
        : `  ${m.label}: ${fmt(m.total)} (${fmt(m.low)}–${fmt(m.high)}); ${fmt(m.projectedDaily)}/day vs ${fmt(m.recentDaily)}/day over the last 28 days`,
    );
  }
  const fu = f.funnel;
  if (fu) {
    lines.push(
      `Funnel ${fu.from} – ${fu.to}: ${n(fu.impressions)} impressions → ${n(fu.pageViews)} page views (${pct(fu.pageViewRate, 1)}) → ${n(fu.downloads)} first-time downloads (${pct(fu.downloadsPerView, 1)} of views).`,
      `Conversion ${pct(fu.conversion)} of impressions${fu.bestConversion ? `; best 28 days ${pct(fu.bestConversion)} (${fu.bestConversionPeriod.from} – ${fu.bestConversionPeriod.to})` : ''}.` +
        (fu.proceedsPerDownload != null ? ` Recent proceeds per first-time download: ${money(fu.proceedsPerDownload)}.` : ''),
    );
  }
  if (f.scenarios.length) {
    lines.push('What if:');
    for (const s of f.scenarios) lines.push(`  ${s.label}: ${n(s.downloads)} downloads (+${n(s.extra)}${s.proceeds != null ? `, ≈ +${money(s.proceeds)}` : ''})`);
  }
  if (f.milestone?.date) lines.push(`Next milestone: ${n(f.milestone.next)} first-time downloads around ${f.milestone.date} (${f.milestone.days} days; ${n(f.milestone.downloads)} now).`);
  lines.push(...f.notes);
  return lines.join('\n');
}

export function describeStats(s) {
  const lines = [`${s.title} — ${s.rangeLabel} (${s.period})`, `  ${s.hero.label}: ${s.hero.value}${s.hero.change != null ? ` (${s.hero.change >= 0 ? '+' : ''}${s.hero.change.toFixed(0)}% ${s.compareLabel})` : ''}`];
  for (const t of s.stats) lines.push(`  ${t.label}: ${t.value}${t.change != null ? ` (${t.change >= 0 ? '+' : ''}${t.change.toFixed(0)}%)` : t.delta ? ` (${t.delta})` : ''}${t.hint ? ` · ${t.hint}` : ''}`);
  if (s.markets.length) lines.push(`  Top markets: ${s.markets.map((m) => `${m.name} ${(m.share * 100).toFixed(0)}%`).join(', ')}`);
  if (s.topApps.length) lines.push(`  Top apps: ${s.topApps.map((a) => `${a.name} ${n(a.downloads)}`).join(', ')}`);
  if (s.allTime) lines.push(`  All time: ${n(s.allTime.firstTimeDownloads)} first-time downloads, ${s.allTime.countriesReached}/${s.allTime.storefronts} countries${s.allTime.rating ? `, ${s.allTime.rating.toFixed(2)}★ from ${n(s.allTime.ratingCount)} ratings` : ''}`);
  return lines.join('\n');
}
