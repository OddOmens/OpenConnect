import satori from 'satori';
import { guard } from '@/lib/auth';
import { Resvg } from '@resvg/resvg-js';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { isShareRange, ShareData, ShareIcon, ShareRange, shareData, shareDataVersion } from '@/lib/share';
import { SHARE_HEROES, SHARE_STATS, ShareHeroId, ShareStatId } from '@/lib/prefs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Social share cards rendered to PNG, styled like the dashboard:
//   /api/share?app=<id|all>&range=30d&format=4x5&theme=dark
// Layout is done by satori and rasterised by native resvg (much cheaper than next/og's
// WebAssembly build). Cards are still rendered one at a time and cached until the data
// behind them changes (a sync, hiding an app, a new day).

const FORMATS = {
  '4x5': { width: 1080, height: 1350 },
  '9x16': { width: 1080, height: 1920 },
} as const;
type Format = keyof typeof FORMATS;

// The app's own tokens (globals.css), dark and light.
const THEMES = {
  dark: { background: '#09090b', card: '#0e0e11', border: '#27272a', secondary: '#1c1c20', foreground: '#fafafa', muted: '#a1a1aa', chart: '#3b82f6', up: '#10b981', down: '#ef4444' },
  light: { background: '#fafafa', card: '#ffffff', border: '#e4e4e7', secondary: '#f4f4f5', foreground: '#09090b', muted: '#71717a', chart: '#3b82f6', up: '#059669', down: '#dc2626' },
} as const;
type Theme = (typeof THEMES)[keyof typeof THEMES];

let fonts: { name: string; data: Buffer; weight: 400 | 600 | 800; style: 'normal' }[] | null = null;
function loadFonts() {
  if (!fonts) {
    fonts = ([400, 600, 800] as const).map((weight) => ({
      name: 'Inter',
      data: fs.readFileSync(path.join(process.cwd(), 'public', 'fonts', `inter-${weight}.woff`)),
      weight,
      style: 'normal' as const,
    }));
  }
  return fonts;
}

// App icons are inlined so a slow or flaky image host can't break the render.
const iconCache = new Map<string, string | null>();
async function inlineIcon(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (iconCache.has(url)) return iconCache.get(url)!;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url.replace(/\/\d+x\d+bb\./, '/256x256bb.'), { cache: 'no-store' });
      if (res.ok) {
        const type = res.headers.get('content-type') || 'image/png';
        const data = `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
        iconCache.set(url, data);
        return data;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return null;
}

// --- Rendered PNG cache + one-at-a-time render queue -------------------------------

const RENDER_VERSION = 14; // bump when the card design changes
const MAX_CACHED = 48;
const pngCache = new Map<string, Buffer>();
let queue: Promise<unknown> = Promise.resolve();

function serially<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

function remember(key: string, png: Buffer) {
  pngCache.delete(key);
  pngCache.set(key, png);
  while (pngCache.size > MAX_CACHED) pngCache.delete(pngCache.keys().next().value!);
}

// --- Drawing helpers --------------------------------------------------------------------

const fmtNumber = (n: number) => n.toLocaleString('en-US');
const fmtCompact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });

// Lucide icons (the set the dashboard uses), stroke-only.
const ICON_PATHS: Record<ShareIcon, string[]> = {
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
  dollar: ['M12 2v20', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],
  star: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'],
  eye: ['M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  pointer: ['M14 4.1 12 6', 'm5.1 8-2.9-.8', 'm6 12-1.9 2', 'M7.2 2.2 8 5.1', 'M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z'],
  bag: ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'],
  trophy: ['M6 9H4.5a2.5 2.5 0 0 1 0-5H6', 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18', 'M4 22h16', 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22', 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22', 'M18 2H6v7a6 6 0 0 0 12 0V2Z'],
  globe: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'],
  update: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'm16 12-4-4-4 4', 'M12 16V8'],
};

// Tile labels when four sit side by side and the full names don't fit.
const SHORT_LABELS: Record<ShareStatId, string> = {
  proceeds: 'Proceeds',
  rating: 'Rating',
  impressions: 'Impressions',
  pageViews: 'Page Views',
  redownloads: 'Redownloads',
  iap: 'Purchases',
  bestRank: 'Best Rank',
  storefronts: 'Storefronts',
  updates: 'Updates',
};

function Icon({ name, size, color }: { name: ShareIcon; size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/** "▲ 12.3% vs prev." in the KPI cards' colours; "▲ +12 vs prev. (from 0)" when there's no %. */
function Change({ value, delta, label, size, theme }: { value: number | null; delta?: string; label: string; size: number; theme: Theme }) {
  if (value == null && delta == null) return null;
  const up = value == null ? true : value > 0;
  const fromZero = value == null;
  const color = up ? theme.up : value! < 0 ? theme.down : theme.muted;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.35, fontSize: size }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 10 10">
        <path d={up ? 'M5 1 9.5 9h-9z' : value! < 0 ? 'M5 9 .5 1h9z' : 'M1 4h8v2H1z'} fill={color} />
      </svg>
      <span style={{ color, fontWeight: 600 }}>
        {fromZero ? delta : `${Math.abs(value!) >= 1000 ? Math.round(Math.abs(value!)).toLocaleString('en-US') : Math.abs(value!).toFixed(1)}%`}
      </span>
      {fromZero && <span style={{ color: theme.muted }}>from 0</span>}
      {label && <span style={{ color: theme.muted }}>{label}</span>}
    </div>
  );
}

/** Round up to 1/2/2.5/5 × 10^k so the three gridline labels are tidy numbers. */
function niceMax(max: number) {
  if (max <= 3) return 3;
  const step = max / 3;
  const pow = 10 ** Math.floor(Math.log10(step));
  const nice = [1, 2, 2.5, 5, 10].find((m) => m * pow >= step)! * pow;
  return nice * 3;
}

/**
 * Smooth path through every point without overshooting (monotone cubic, Fritsch–Carlson;
 * the same curve as the dashboard's recharts "monotone" lines).
 */
function monotonePath(pts: readonly (readonly [number, number])[]) {
  const n = pts.length;
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) slope.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  const tangent = pts.map((_, i) => (i === 0 ? slope[0] : i === n - 1 ? slope[n - 2] : slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const len = a * a + b * b;
    if (len > 9) {
      const tau = 3 / Math.sqrt(len);
      tangent[i] = tau * a * slope[i];
      tangent[i + 1] = tau * b * slope[i];
    }
  }
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const third = (x1 - x0) / 3;
    d += ` C ${x0 + third} ${y0 + tangent[i] * third} ${x1 - third} ${y1 - tangent[i + 1] * third} ${x1} ${y1}`;
  }
  return d;
}

/** The dashboard's history chart: area in chart-1 at 25% opacity, dashed horizontal grid. */
function Chart({ series, granularity, width, height, theme }: { series: ShareData['series']; granularity: ShareData['granularity']; width: number; height: number; theme: Theme }) {
  const axisW = 76;
  const labelsH = 40;
  const w = width - axisW;
  const h = height - labelsH;
  const values = series.length > 1 ? series.map((s) => s.value) : [series[0]?.value ?? 0, series[0]?.value ?? 0];
  const top = niceMax(Math.max(0, ...values));
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - (v / top) * (h - 4) - 2] as const);
  const line = monotonePath(pts);
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;

  const tickFormat: Intl.DateTimeFormatOptions = granularity === 'month' ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' };
  const ticks = series.length ? [series[0], series[Math.floor((series.length - 1) / 2)], series[series.length - 1]] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width, height }}>
      <div style={{ display: 'flex', height: h }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: axisW, height: h, paddingRight: 14, fontSize: 22, color: theme.muted, alignItems: 'flex-end' }}>
          {[top, (top * 2) / 3, top / 3, 0].map((v, i) => (
            <div key={i} style={{ display: 'flex', height: 26, marginTop: i === 0 ? -13 : 0, marginBottom: i === 3 ? -13 : 0 }}>{fmtCompact(v)}</div>
          ))}
        </div>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d={`M 0 ${1 + (i * (h - 2)) / 3} L ${w} ${1 + (i * (h - 2)) / 3}`} stroke={theme.border} strokeWidth={2} strokeDasharray="7 7" />
          ))}
          <path d={area} fill={theme.chart} fillOpacity={0.25} />
          <path d={line} fill="none" stroke={theme.chart} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', height: labelsH, paddingLeft: axisW, alignItems: 'flex-end', fontSize: 22, color: theme.muted }}>
        {ticks.map((t, i) => <div key={i} style={{ display: 'flex' }}>{fmtDay(t.date, tickFormat)}</div>)}
      </div>
    </div>
  );
}

function AppIcon({ src, size, theme }: { src: string | null; size: number; theme: Theme }) {
  const radius = Math.round(size * 0.225);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img src={src} width={size} height={size} style={{ borderRadius: radius, border: `2px solid ${theme.border}` }} />
  ) : (
    <div style={{ display: 'flex', width: size, height: size, borderRadius: radius, background: theme.secondary, border: `2px solid ${theme.border}` }} />
  );
}

function Card({ data, icons, format, theme, showList }: { data: ShareData; icons: (string | null)[]; format: Format; theme: Theme; showList: boolean }) {
  const { width, height } = FORMATS[format];
  const tall = format === '9x16';
  const pad = tall ? 64 : 56;
  const gap = tall ? 28 : 24;
  const inner = width - pad * 2;
  const cardPad = tall ? 36 : 32;
  const radius = 20; // the app's 0.5rem, scaled to this canvas
  const cardStyle = { display: 'flex', background: theme.card, border: `2px solid ${theme.border}`, borderRadius: radius } as const;

  // KPI tiles: up to 4 (one row) in 4:5 and 6 (two rows of 3) in 9:16, spread evenly over
  // the rows so a row never ends with a lone tile (4 tiles in 9:16 = 2 + 2).
  const tiles = data.stats.slice(0, tall ? 6 : 4);
  const rows = tiles.length ? Math.ceil(tiles.length / (tall ? 3 : 4)) : 0;
  const tileRows: (typeof tiles)[] = [];
  for (let r = 0, i = 0; r < rows; r++) {
    const take = Math.ceil((tiles.length - i) / (rows - r));
    tileRows.push(tiles.slice(i, i + take));
    i += take;
  }
  const tileGap = tall ? 20 : 18;
  const tileH = tall ? 180 : 168;

  const listKind = data.topApps.length ? 'apps' : 'markets';
  const listRows = showList ? (listKind === 'apps' ? data.topApps : data.markets).slice(0, tall ? 5 : 3) : [];
  const rowH = tall ? 66 : 58;

  // Vertical budget: everything is fixed except the hero card, which takes the rest.
  const headerH = tall ? 120 : 104;
  const tilesH = rows ? rows * tileH + (rows - 1) * tileGap : 0;
  const listH = listRows.length ? cardPad * 2 + 52 + listRows.length * rowH : 0;
  const sections = 1 + (tilesH ? 1 : 0) + (listH ? 1 : 0);
  const heroH = height - pad * 2 - headerH - tilesH - listH - gap * sections;
  const heroTopH = (tall ? 34 : 32) + (tall ? 150 : 124) + (data.hero.change != null || data.hero.delta != null ? 44 : 0) + 24;
  const chartH = heroH - cardPad * 2 - heroTopH;

  const mosaic = icons.length > 1;
  const iconSize = headerH;
  const sub = Math.round((iconSize - 8) / 2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width, height, padding: pad, gap, background: theme.background, color: theme.foreground, fontFamily: 'Inter' }}>
      {/* Header, like the sidebar's app row */}
      <div style={{ display: 'flex', alignItems: 'center', height: headerH, gap: 28 }}>
        {mosaic ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', width: iconSize, height: iconSize, gap: 8 }}>
            {icons.slice(0, 4).map((src, i) => <AppIcon key={i} src={src} size={sub} theme={theme} />)}
          </div>
        ) : (
          <AppIcon src={icons[0] ?? null} size={iconSize} theme={theme} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: tall ? 56 : 50, fontWeight: 600, letterSpacing: -1.2, lineHeight: 1.1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {data.title}
          </div>
          <div style={{ display: 'flex', marginTop: 8, fontSize: tall ? 27 : 25, color: theme.muted }}>
            {data.rangeLabel}
            {data.period ? ` · ${data.period}` : ''}
          </div>
        </div>
      </div>

      {/* Hero KPI + history chart */}
      <div style={{ ...cardStyle, flexDirection: 'column', height: heroH, padding: cardPad }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: tall ? 34 : 32, fontSize: tall ? 27 : 25, fontWeight: 600, color: theme.muted }}>
          <Icon name={data.hero.icon} size={tall ? 27 : 25} color={theme.muted} />
          {data.hero.label}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: tall ? 150 : 124, fontSize: tall ? 136 : 112, fontWeight: 600, letterSpacing: tall ? -5 : -4 }}>
          {data.hero.value}
        </div>
        {(data.hero.change != null || data.hero.delta != null) && (
          <div style={{ display: 'flex', height: 44 }}>
            <Change value={data.hero.change} delta={data.hero.delta} label={data.compareLabel} size={tall ? 28 : 26} theme={theme} />
          </div>
        )}
        <div style={{ display: 'flex', height: 24 }} />
        <Chart series={data.series} granularity={data.granularity} width={inner - cardPad * 2 - 4} height={Math.max(120, chartH)} theme={theme} />
      </div>

      {/* KPI tiles, like the dashboard's KPI cards */}
      {tileRows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: tileGap }}>
          {tileRows.map((row, r) => (
          <div key={r} style={{ display: 'flex', gap: tileGap }}>
          {row.map((s) => (
            <div key={s.id} style={{ ...cardStyle, flexDirection: 'column', justifyContent: 'center', width: (inner - tileGap * (row.length - 1)) / row.length, height: tileH, padding: `0 ${tall ? 28 : 24}px` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: row.length >= 4 ? 8 : 10, fontSize: row.length >= 4 ? 20 : 22, fontWeight: 600, color: theme.muted }}>
                <Icon name={s.icon} size={row.length >= 4 ? 20 : 22} color={theme.muted} />
                <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{row.length >= 4 ? SHORT_LABELS[s.id] : s.label}</span>
              </div>
              <div style={{ display: 'flex', marginTop: 10, fontSize: tall ? 54 : 48, fontWeight: 600, letterSpacing: -1.5, lineHeight: 1.1 }}>{s.value}</div>
              <div style={{ display: 'flex', marginTop: 8, height: 26 }}>
                {s.change != null || s.delta != null ? (
                  <Change value={s.change} delta={s.delta} label="" size={21} theme={theme} />
                ) : (
                  s.hint && <span style={{ fontSize: 21, color: theme.muted }}>{s.hint}</span>
                )}
              </div>
            </div>
          ))}
          </div>
          ))}
        </div>
      )}

      {/* Top apps (All Apps) or top markets (one app), like the dashboard's tables */}
      {listRows.length > 0 && (
        <div style={{ ...cardStyle, flexDirection: 'column', height: listH, padding: cardPad }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 52, fontSize: tall ? 30 : 28, fontWeight: 600 }}>
            {listKind === 'apps' ? 'Top Apps' : 'Top Markets'}
            <span style={{ fontSize: 22, fontWeight: 400, color: theme.muted }}>{listKind === 'apps' ? 'First-time downloads' : 'Share of downloads'}</span>
          </div>
          {listRows.map((row: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, height: rowH, borderTop: `2px solid ${theme.border}`, fontSize: tall ? 28 : 26 }}>
              {listKind === 'apps' ? (
                <AppIcon src={row.iconData} size={rowH - 18} theme={theme} />
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: 58, height: 36, borderRadius: 8, background: theme.secondary, fontSize: 19, fontWeight: 600 }}>{row.code}</div>
              )}
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{row.name}</div>
              {listKind === 'markets' && <div style={{ display: 'flex', color: theme.muted }}>{fmtNumber(row.downloads)}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', width: 120, fontWeight: 600 }}>
                {listKind === 'apps' ? fmtCompact(row.downloads) : `${(row.share * 100).toFixed(1)}%`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Picks {
  hero: ShareHeroId;
  stats: ShareStatId[];
  showList: boolean;
}

async function render(appId: string | undefined, range: ShareRange, format: Format, theme: Theme, picks: Picks): Promise<Buffer | null> {
  const full = shareData(appId, range, picks.hero);
  if (!full) return null;
  // Only the tiles you picked, in the order you picked them.
  const stats = picks.stats.map((id) => full.stats.find((s) => s.id === id)).filter((s): s is ShareData['stats'][number] => !!s);
  const data = { ...full, stats, topApps: picks.showList ? full.topApps : [] };
  const [icons, topIcons] = await Promise.all([
    Promise.all(data.icons.map(inlineIcon)),
    Promise.all(data.topApps.map((a) => inlineIcon(a.icon))),
  ]);
  const withIcons = { ...data, topApps: data.topApps.map((a, i) => ({ ...a, iconData: topIcons[i] })) };
  const { width, height } = FORMATS[format];
  const svg = await satori(<Card data={withIcons} icons={icons.length ? icons : [null]} format={format} theme={theme} showList={picks.showList} />, {
    width,
    height,
    fonts: loadFonts(),
  });
  return new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng();
}

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const q = new URL(request.url).searchParams;
  const appParam = q.get('app');
  const appId = appParam && appParam !== 'all' ? appParam : undefined;
  const range: ShareRange = isShareRange(q.get('range')) ? (q.get('range') as ShareRange) : '30d';
  const format = (q.get('format') && q.get('format')! in FORMATS ? q.get('format') : '4x5') as Format;
  const themeId = (q.get('theme') && q.get('theme')! in THEMES ? q.get('theme') : 'dark') as keyof typeof THEMES;

  const statsParam = q.get('stats');
  const picks: Picks = {
    stats: statsParam === null ? (Object.keys(SHARE_STATS) as ShareStatId[]) : (statsParam.split(',').filter((s) => s in SHARE_STATS) as ShareStatId[]),
    showList: q.get('list') !== '0',
    hero: (q.get('hero') && q.get('hero')! in SHARE_HEROES ? q.get('hero') : 'first_time') as ShareHeroId,
  };

  const key = [RENDER_VERSION, shareDataVersion(), appId || 'all', range, format, themeId, picks.hero, picks.stats.join(','), picks.showList].join('|');
  const etag = `"${crypto.createHash('sha1').update(key).digest('hex').slice(0, 20)}"`;
  const headers = { 'Content-Type': 'image/png', ETag: etag, 'Cache-Control': 'private, no-cache' };
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });

  let png = pngCache.get(key);
  if (!png) {
    // Re-check inside the queue: an identical request may have rendered it while we waited.
    const rendered = await serially(async () => pngCache.get(key) ?? render(appId, range, format, THEMES[themeId], picks));
    if (!rendered) return new Response('Unknown app', { status: 404 });
    png = rendered;
    remember(key, png);
  }
  return new Response(new Uint8Array(png), { headers });
}
