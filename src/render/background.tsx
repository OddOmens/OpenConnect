import type { CSSProperties } from 'react';
import type { App, Background, Theme } from '../shared/types';
import { Decor } from './decor';

// Slide backgrounds, drawn as layers under the text and screenshot:
//   fill (solid, gradient, glow, photo, mesh) · frosted screenshot · texture · vignette.
// With `theme.panorama` the fill and texture are laid out across one strip as wide as all slides
// together, and each slide shows its own slice, so swiping through the set reads as one picture.

const assetUrl = (appId: string, assetId: string) => `/api/apps/${appId}/assets/${assetId}`;

/** Small deterministic random generator, so a mesh looks the same on every render. */
function rng(seed: number) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

/** Soft color blobs across a `width` × `height` area. More blobs for wider areas (panoramas). */
export function meshLayers(b: Background, width: number, height: number, variant = 0): string[] {
  // Backgrounds saved before mesh existed have no seed or third color.
  const r = rng((Number.isFinite(b.seed) ? b.seed : 1) * 7919 + variant * 104729);
  const c3 = b.color3 || b.color2;
  const colors = [b.color2, c3, b.color2, c3];
  const n = Math.max(3, Math.round((width / height) * 2.6));
  const short = Math.min(width, height);
  const layers: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.15 + r() * 0.7) / n) * width;
    const y = (0.05 + r() * 0.9) * height;
    const rx = short * (0.55 + r() * 0.45);
    const ry = rx * (0.75 + r() * 0.5);
    layers.push(`radial-gradient(${rx}px ${ry}px at ${x}px ${y}px, ${colors[i % colors.length]} 0%, transparent 100%)`);
  }
  return layers;
}

interface Area {
  /** this slide's size */
  W: number;
  H: number;
  /** slice of a panorama: which slide, out of how many (count 1 = no panorama) */
  index: number;
  count: number;
}

/** CSS for a background fill. Without an area (e.g. creative assets) it fills its box. */
export function fillCss(b: Background, app: App, area?: Area): CSSProperties {
  const strip = area && area.count > 1;
  const SW = area ? area.W * area.count : 0;
  const size = strip ? { backgroundSize: `${SW}px ${area!.H}px`, backgroundPosition: `${-area!.index * area!.W}px 0`, backgroundRepeat: 'no-repeat' } : {};
  switch (b.type) {
    case 'linear':
      return { backgroundColor: b.color, backgroundImage: `linear-gradient(${b.angle}deg, ${b.color}, ${b.color2})`, ...size };
    case 'radial':
      return {
        backgroundColor: b.color2,
        backgroundImage: `radial-gradient(${strip ? '70% 90% at 50% 30%' : '130% 75% at 50% 18%'}, ${b.color} 0%, ${b.color2} 100%)`,
        ...size,
      };
    case 'mesh': {
      // Without a panorama each slide gets its own arrangement of the same colors.
      const w = strip ? SW : (area?.W ?? 1600);
      const h = area?.H ?? 1000;
      const layers = meshLayers(b, w, h, strip ? 0 : (area?.index ?? 0));
      return {
        backgroundColor: b.color,
        backgroundImage: layers.join(', '),
        backgroundSize: `${w}px ${h}px`,
        backgroundPosition: strip ? `${-area!.index * area!.W}px 0` : '0 0',
        backgroundRepeat: 'no-repeat',
      };
    }
    case 'image': {
      if (!b.imageAssetId) return { background: b.color };
      const scrim = `linear-gradient(180deg, rgba(0,0,0,${b.overlay * 0.6}) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,${b.overlay}) 100%)`;
      const url = `url(${assetUrl(app.id, b.imageAssetId)})`;
      if (!strip) return { backgroundColor: b.color, backgroundImage: `${scrim}, ${url}`, backgroundSize: 'cover', backgroundPosition: 'center' };
      // Cover the whole strip with the photo, centered, then show this slide's slice.
      const a = app.assets[b.imageAssetId];
      const aspect = a?.width && a?.height ? a.width / a.height : SW / area!.H;
      const [iw, ih] = aspect > SW / area!.H ? [area!.H * aspect, area!.H] : [SW, SW / aspect];
      const x = -area!.index * area!.W - (iw - SW) / 2;
      const y = -(ih - area!.H) / 2;
      return {
        backgroundColor: b.color,
        backgroundImage: `${scrim}, ${url}`,
        backgroundSize: `${area!.W}px ${area!.H}px, ${iw}px ${ih}px`,
        backgroundPosition: `0 0, ${x}px ${y}px`,
        backgroundRepeat: 'no-repeat',
      };
    }
    default:
      // solid, and 'screenshot' (its frosted layer is drawn separately on top of this color)
      return { background: b.color };
  }
}

const NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

/** Texture pattern CSS; `ink` is the pattern color (the headline color reads on any background). */
function textureCss(t: Theme['texture'], ink: string, u: number, offsetX: number): CSSProperties | null {
  const s = Math.max(4, t.size) * u;
  const line = Math.max(1, 1.6 * u);
  const pos = `${offsetX}px 0`;
  switch (t.kind) {
    case 'grain':
      return { backgroundImage: NOISE, backgroundSize: `${220 * u}px ${220 * u}px`, backgroundPosition: pos, opacity: t.opacity * 0.9, mixBlendMode: 'overlay' };
    case 'dots':
      return { backgroundImage: `radial-gradient(circle, ${ink} ${line * 1.4}px, transparent ${line * 1.4 + 0.5}px)`, backgroundSize: `${s}px ${s}px`, backgroundPosition: pos, opacity: t.opacity };
    case 'grid':
      return {
        backgroundImage: `linear-gradient(${ink} ${line}px, transparent ${line}px), linear-gradient(90deg, ${ink} ${line}px, transparent ${line}px)`,
        backgroundSize: `${s}px ${s}px`,
        backgroundPosition: pos,
        opacity: t.opacity,
      };
    case 'lines':
      return { backgroundImage: `repeating-linear-gradient(135deg, ${ink} 0 ${line}px, transparent ${line}px ${s}px)`, backgroundPosition: pos, opacity: t.opacity };
    default:
      return null;
  }
}

const layer: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' };

/** Every background layer of one slide, absolutely positioned behind its content. */
export function BackgroundLayers({
  app,
  theme,
  bg,
  ink,
  area,
  u,
  shotAssetId,
  colors,
}: {
  app: App;
  theme: Theme;
  bg: Background;
  ink: string;
  /** decoration colors */
  colors: string[];
  area: Area;
  u: number;
  /** the slide's screenshot, for the frosted background */
  shotAssetId?: string | null;
}) {
  const texture = textureCss(theme.texture, ink, u, area.count > 1 ? -area.index * area.W : 0);
  const v = theme.vignette;
  return (
    <>
      <div style={{ ...layer, ...fillCss(bg, app, area) }} />
      {bg.type === 'screenshot' && shotAssetId && (
        <>
          <div
            style={{
              ...layer,
              inset: -80 * u,
              backgroundImage: `url(${assetUrl(app.id, shotAssetId)})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: `blur(${60 * u}px) saturate(1.3)`,
            }}
          />
          <div style={{ ...layer, background: `rgba(0,0,0,${bg.overlay})` }} />
        </>
      )}
      <div style={{ ...layer, overflow: 'hidden' }}>
        <Decor
          decor={theme.decor}
          colors={colors}
          width={area.count > 1 ? area.W * area.count : area.W}
          height={area.H}
          slideW={area.W}
          u={u}
          variant={area.count > 1 ? 0 : area.index}
          left={area.count > 1 ? -area.index * area.W : 0}
        />
      </div>
      {texture && <div style={{ ...layer, ...texture }} />}
      {v > 0 && (
        <div
          style={{
            ...layer,
            // A panorama only darkens top and bottom, so the seams between slides stay invisible.
            background:
              area.count > 1
                ? `linear-gradient(180deg, rgba(0,0,0,${v * 0.55}) 0%, transparent 28%, transparent 72%, rgba(0,0,0,${v * 0.7}) 100%)`
                : `radial-gradient(ellipse 85% 75% at 50% 45%, transparent 55%, rgba(0,0,0,${v * 0.75}) 100%)`,
          }}
        />
      )}
    </>
  );
}
