import type { Sticker } from '../shared/types';
import { DOODLES, paths, seedOf } from './rough';
import { at } from '../base';

export const emojiUrl = (slug: string, style: Sticker['style']) =>
  style === 'apple'
    ? at(`/emoji-font/${encodeURIComponent(slug)}.png`)
    : at(`/vendor/emoji/${encodeURIComponent(slug)}/${style === '3d' ? '3d.png' : `${style}.svg`}`);

/** One doodle as an inline SVG, `width` px wide, in `color`. */
export function DoodleSvg({ name, width, color, seed, style }: { name: string; width: number; color: string; seed: number; style?: React.CSSProperties }) {
  const d = DOODLES[name];
  if (!d) return null;
  const ps = paths((g, o) => d.draw(g, o), {
    stroke: color,
    strokeWidth: 6,
    roughness: 1.5,
    bowing: 1.2,
    seed,
    ...(d.filled ? { fill: color, fillStyle: 'solid' } : {}),
  });
  return (
    <svg viewBox={`0 0 ${d.w} ${d.h}`} width={width} height={(width * d.h) / d.w} style={{ overflow: 'visible', display: 'block', ...style }}>
      {ps.map((p, i) => (
        <path key={i} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={p.fill || 'none'} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/** The stickers of one layer (behind or in front of the screenshot), positioned on a W × H slide. */
export function StickerLayer({
  stickers,
  layer,
  W,
  H,
  u,
  shadow,
  accent,
  zIndex,
}: {
  stickers: Sticker[];
  layer: 'back' | 'front';
  W: number;
  H: number;
  u: number;
  shadow: number;
  accent: string;
  zIndex: number;
}) {
  const mine = stickers.filter((s) => s.layer === layer);
  if (!mine.length) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex }}>
      {mine.map((s) => {
        const w = s.size * u;
        const doodle = s.kind === 'doodle' ? DOODLES[s.ref] : null;
        const h = doodle ? (w * doodle.h) / doodle.w : w;
        return (
          <div
            key={s.id}
            data-sticker={s.id}
            style={{
              position: 'absolute',
              left: s.x * W - w / 2,
              top: s.y * H - h / 2,
              width: w,
              height: h,
              transform: `rotate(${s.rotation}deg)${s.flip ? ' scaleX(-1)' : ''}`,
              opacity: s.opacity,
              filter: shadow > 0 ? `drop-shadow(0 ${10 * u}px ${22 * u}px rgba(0,0,0,${shadow}))` : undefined,
            }}
          >
            {s.kind === 'emoji' ? (
              <img src={emojiUrl(s.ref, s.style)} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }} />
            ) : (
              <DoodleSvg name={s.ref} width={w} color={s.color || accent} seed={seedOf(s.id)} />
            )}
          </div>
        );
      })}
    </div>
  );
}
