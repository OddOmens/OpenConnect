// Shared building blocks for the share-card templates: canvas sizes, the app's colours,
// fonts, icons, the history chart, the dotted world map and the card header.

import * as fs from 'fs';
import * as path from 'path';
import DottedMap from 'dotted-map/without-countries';
import worldDots from '@/lib/world-dots.json';
import type { ShareData, ShareIcon } from '@/lib/share';
import { TERRITORY_BY_CODE } from '@/lib/territories';

export const FORMATS = {
  '4x5': { width: 1080, height: 1350 },
  '9x16': { width: 1080, height: 1920 },
} as const;
export type Format = keyof typeof FORMATS;

// The app's own tokens (globals.css), dark and light.
export const THEMES = {
  dark: { background: '#09090b', card: '#0e0e11', border: '#27272a', secondary: '#1c1c20', foreground: '#fafafa', muted: '#a1a1aa', chart: '#3b82f6', up: '#10b981', down: '#ef4444' },
  light: { background: '#fafafa', card: '#ffffff', border: '#e4e4e7', secondary: '#f4f4f5', foreground: '#09090b', muted: '#71717a', chart: '#3b82f6', up: '#059669', down: '#dc2626' },
} as const;
export type Theme = (typeof THEMES)[keyof typeof THEMES];

let fonts: { name: string; data: Buffer; weight: 400 | 600 | 800; style: 'normal' }[] | null = null;
export function loadFonts() {
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
export async function inlineIcon(url: string | null): Promise<string | null> {
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

// --- Drawing helpers --------------------------------------------------------------------

export const fmtNumber = (n: number) => n.toLocaleString('en-US');
export const fmtCompact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });

// Lucide icons (the set the dashboard uses), stroke-only.
export const ICON_PATHS: Record<ShareIcon, string[]> = {
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

export function Icon({ name, size, color }: { name: ShareIcon; size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/** "▲ 12.3% vs prev." in the KPI cards' colours; "▲ +12 vs prev. (from 0)" when there's no %. */
export function Change({ value, delta, label, size, theme }: { value: number | null; delta?: string; label: string; size: number; theme: Theme }) {
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
export function niceMax(max: number) {
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
export function monotonePath(pts: readonly (readonly [number, number])[]) {
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
export function Chart({ series, granularity, width, height, theme }: { series: ShareData['series']; granularity: ShareData['granularity']; width: number; height: number; theme: Theme }) {
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

export function AppIcon({ src, size, theme }: { src: string | null; size: number; theme: Theme }) {
  const radius = Math.round(size * 0.225);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img src={src} width={size} height={size} style={{ borderRadius: radius, border: `2px solid ${theme.border}` }} />
  ) : (
    <div style={{ display: 'flex', width: size, height: size, borderRadius: radius, background: theme.secondary, border: `2px solid ${theme.border}` }} />
  );
}


// --- Pieces for the extra templates ------------------------------------------------------

/** App icon (or a 2×2 mosaic for All Apps), name and a sub line, like the dashboard sidebar. */
export function Header({ icons, title, subtitle, size, theme }: { icons: (string | null)[]; title: string; subtitle: string; size: number; theme: Theme }) {
  const mosaic = icons.length > 1;
  const sub = Math.round((size - 8) / 2);
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: size, gap: 28 }}>
      {mosaic ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', width: size, height: size, gap: 8 }}>
          {icons.slice(0, 4).map((src, i) => <AppIcon key={i} src={src} size={sub} theme={theme} />)}
        </div>
      ) : (
        <AppIcon src={icons[0] ?? null} size={size} theme={theme} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: size * 0.48, fontWeight: 600, letterSpacing: -1.2, lineHeight: 1.1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ display: 'flex', marginTop: 8, fontSize: size * 0.24, color: theme.muted }}>{subtitle}</div>
      </div>
    </div>
  );
}

/** The same precomputed dot grid as the dashboard's map. */
const WORLD = new DottedMap({ map: worldDots as any });
export const WORLD_W = WORLD.image.width;
export const WORLD_H = WORLD.image.height;
// All base dots as one path (one element renders far faster than thousands of circles).
const WORLD_DOTS_PATH = WORLD.getPoints()
  .map((d) => `M${(d.x - 0.22).toFixed(2)} ${d.y.toFixed(2)}a0.22 0.22 0 1 0 0.44 0a0.22 0.22 0 1 0 -0.44 0`)
  .join('');

export interface WorldPin {
  code: string;
  color: string;
  r: number; // in map units (base dots are 0.22)
}

/** Dotted world map with coloured pins on storefronts. */
export function DottedWorld({ width, pins, theme }: { width: number; pins: WorldPin[]; theme: Theme }) {
  const height = Math.round((width * WORLD_H) / WORLD_W);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}>
      <path d={WORLD_DOTS_PATH} fill={theme.border} />
      {pins.map((p) => {
        const t = TERRITORY_BY_CODE[p.code];
        if (!t) return null;
        const { x, y } = WORLD.getPin({ lat: t.lat, lng: t.lng });
        return <circle key={p.code} cx={x} cy={y} r={p.r} fill={p.color} />;
      })}
    </svg>
  );
}

export const STAR_PATH =
  'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z';
export const STAR_COLOR = '#f59e0b';

/** Five stars filled to the rating (partial last star). */
export function Stars({ rating, size, theme, gap = 6 }: { rating: number; size: number; theme: Theme; gap?: number }) {
  const width = size * 5 + gap * 4;
  const filled = Math.max(0, Math.min(5, rating));
  // Width of the gold part, counting the gaps between whole stars.
  const clip = Math.floor(filled) * (size + gap) + (filled % 1) * size;
  const row = (fill: string) =>
    [0, 1, 2, 3, 4].map((i) => (
      <path key={i} d={STAR_PATH} fill={fill} transform={`translate(${i * (size + gap)} 0) scale(${size / 24})`} />
    ));
  return (
    <svg width={width} height={size} viewBox={`0 0 ${width} ${size}`}>
      <defs>
        <clipPath id="stars-fill">
          <rect x="0" y="0" width={clip} height={size} />
        </clipPath>
      </defs>
      {row(theme.border)}
      <g clipPath="url(#stars-fill)">{row(STAR_COLOR)}</g>
    </svg>
  );
}

/** "US" in a small rounded box, standing in for a flag (emoji don't render here). */
export function CountryCode({ code, theme, size = 19 }: { code: string; theme: Theme; size?: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: size * 3, height: size * 1.9, borderRadius: 8, background: theme.secondary, fontSize: size, fontWeight: 600 }}>
      {code}
    </div>
  );
}
