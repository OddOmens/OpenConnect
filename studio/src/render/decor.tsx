import type { DecorStyle } from '../shared/types';

// Generated decorations: seeded shapes in the app's colors, drawn as one SVG over the background fill.
// For a panorama the SVG spans the whole strip and each slide shows its slice, so a wave can flow across.

function rng(seed: number) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

/** Closed smooth path through points (Catmull-Rom as cubic Béziers). */
function smooth(pts: [number, number][]) {
  const n = pts.length;
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ` C ${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6}, ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6}, ${p2[0]} ${p2[1]}`;
  }
  return d + ' Z';
}

const sparkle = (x: number, y: number, r: number) =>
  `M ${x} ${y - r} Q ${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q ${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q ${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q ${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r} Z`;

/**
 * `width` is the whole drawing (slide width, or the strip for a panorama); `slideW` sets density per slide.
 * `variant` gives each slide its own arrangement when there's no panorama.
 */
export function Decor({
  decor,
  colors,
  width,
  height,
  slideW,
  u,
  variant,
  left,
}: {
  decor: DecorStyle;
  colors: string[];
  width: number;
  height: number;
  slideW: number;
  u: number;
  variant: number;
  left: number;
}) {
  if (decor.kind === 'none' || !colors.length) return null;
  const r = rng((Number.isFinite(decor.seed) ? decor.seed : 1) * 6151 + variant * 92821 + decor.kind.length * 17);
  const k = decor.scale;
  const slides = Math.max(1, width / slideW);
  const count = (perSlide: number) => Math.max(1, Math.round(perSlide * decor.density * slides));
  const pick = (i: number) => colors[i % colors.length];
  const shapes: React.ReactNode[] = [];

  switch (decor.kind) {
    case 'blobs':
      for (let i = 0; i < count(2.2); i++) {
        const cx = ((i + 0.2 + r() * 0.6) / count(2.2)) * width;
        const cy = r() * height;
        const rad = slideW * 0.28 * k * (0.6 + r() * 0.8);
        const pts = Array.from({ length: 9 }, (_, j) => {
          const a = (Math.PI * 2 * j) / 9;
          const jr = rad * (0.72 + r() * 0.5);
          return [cx + jr * Math.cos(a), cy + jr * Math.sin(a)] as [number, number];
        });
        shapes.push(<path key={i} d={smooth(pts)} fill={pick(i)} opacity={0.55 + r() * 0.45} />);
      }
      break;
    case 'waves':
      for (let layer = 0; layer < 3; layer++) {
        const base = height * (0.66 + layer * 0.1);
        const amp = slideW * 0.05 * k * (1 - layer * 0.15);
        const len = slideW * (0.55 + r() * 0.3) / Math.max(0.4, k);
        const phase = r() * len;
        let d = `M 0 ${height} L 0 ${base}`;
        for (let x = -phase; x < width + len; x += len / 2) {
          const up = Math.round((x + phase) / (len / 2)) % 2 === 0 ? -1 : 1;
          d += ` Q ${x + len / 4} ${base + up * amp} ${x + len / 2} ${base}`;
        }
        d += ` L ${width} ${height} Z`;
        shapes.push(<path key={layer} d={d} fill={pick(layer)} opacity={0.45 + layer * 0.25} />);
      }
      break;
    case 'rings':
      for (let i = 0; i < count(1); i++) {
        const cx = ((i + 0.25 + r() * 0.5) / count(1)) * width;
        const cy = height * (0.3 + r() * 0.5);
        const gap = 70 * u * k;
        for (let j = 1; j <= 7; j++) {
          shapes.push(<circle key={`${i}-${j}`} cx={cx} cy={cy} r={gap * j} fill="none" stroke={pick(i)} strokeWidth={3 * u * k} opacity={1 - j * 0.11} />);
        }
      }
      break;
    case 'sparkles':
      for (let i = 0; i < count(14); i++) {
        shapes.push(<path key={i} d={sparkle(r() * width, r() * height, (14 + r() * 34) * u * k)} fill={pick(i)} opacity={0.5 + r() * 0.5} />);
      }
      break;
    case 'confetti':
      for (let i = 0; i < count(36); i++) {
        const x = r() * width;
        const y = r() * height;
        const s = (10 + r() * 18) * u * k;
        const rot = r() * 360;
        const kind = Math.floor(r() * 3);
        shapes.push(
          kind === 0 ? (
            <rect key={i} x={x - s / 2} y={y - s / 4} width={s} height={s / 2} rx={s * 0.1} fill={pick(i)} transform={`rotate(${rot} ${x} ${y})`} />
          ) : kind === 1 ? (
            <circle key={i} cx={x} cy={y} r={s * 0.35} fill={pick(i)} />
          ) : (
            <path key={i} d={`M ${x - s / 2} ${y} q ${s / 4} ${-s / 2} ${s / 2} 0 t ${s / 2} 0`} fill="none" stroke={pick(i)} strokeWidth={s * 0.22} strokeLinecap="round" transform={`rotate(${rot} ${x} ${y})`} />
          ),
        );
      }
      break;
    case 'bokeh':
      for (let i = 0; i < count(9); i++) {
        shapes.push(<circle key={i} cx={r() * width} cy={r() * height} r={(30 + r() * 120) * u * k} fill={pick(i)} opacity={0.25 + r() * 0.5} />);
      }
      break;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', top: 0, left, opacity: decor.opacity, pointerEvents: 'none', overflow: 'hidden' }}
    >
      {decor.kind === 'bokeh' && (
        <defs>
          <filter id="bokeh-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={10 * u} />
          </filter>
        </defs>
      )}
      <g filter={decor.kind === 'bokeh' ? 'url(#bokeh-soft)' : undefined}>{shapes}</g>
    </svg>
  );
}
