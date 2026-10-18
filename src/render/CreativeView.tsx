import type { CSSProperties, ReactNode } from 'react';
import type { App, CreativeId } from '../shared/types';
import { CREATIVES, creativeShots, safeArea } from '../shared/creatives';
import { DEVICES } from '../shared/devices';
import { assetUrl, Frame, Headline } from './SlideView';
import { fontStack, headlineLineHeight, isRtl, viewLanguage } from '../shared/locales';
import { fillCss } from './background';

/**
 * A product page header or search results asset at native size. Text and screenshots are laid out around
 * the center of Apple's art safe area; the background runs to the edges for the crops each device makes.
 */
export function CreativeView({ app, id, sizeKey, safeGuide }: { app: App; id: CreativeId; sizeKey?: string; safeGuide?: boolean }) {
  const spec = CREATIVES[id];
  const [W, H] = spec.sizes[sizeKey ?? spec.defaultSize] ?? spec.sizes[spec.defaultSize];
  const c = app.creatives[id];
  const t = app.theme;
  const pal = t.palettes.primary;
  const safe = safeArea(id, W, H);
  const u = safe.h / 1000; // sizes follow the safe area, so text stays inside it on every crop
  const shots = creativeShots(app, c);
  const showText = c.textPosition !== 'none';
  const cx = W / 2;
  const cy = H / 2;

  // The header's safe area is short and wide, so its type runs a little larger against it.
  const k = id === 'header' ? 1.3 : 1;
  const textWidth = c.textPosition === 'center' ? safe.w * 0.46 : safe.w * 0.5;
  const headlineSize = (t.headlineSize / 86) * 150 * u * k;
  const text = showText && (
    <div
      dir={isRtl(app.activeLang) ? 'rtl' : undefined}
      style={{
        position: 'absolute',
        width: textWidth,
        left: c.textPosition === 'center' ? cx - textWidth / 2 : safe.x,
        top: cy,
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: c.textPosition === 'center' ? 'center' : 'flex-start',
        textAlign: c.textPosition === 'center' ? 'center' : 'start',
        color: pal.textColor,
        zIndex: 3,
      }}
    >
      {c.lockup && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 34 * u * k, marginBottom: 56 * u * k }}>
          {app.iconAssetId && (
            <img
              src={assetUrl(app.id, app.iconAssetId)}
              alt=""
              style={{ width: 150 * u * k, height: 150 * u * k, borderRadius: 150 * u * k * 0.225, display: 'block', boxShadow: `0 ${8 * u}px ${28 * u}px rgba(0,0,0,0.25)` }}
            />
          )}
          <span style={{ fontSize: 96 * u * k, fontWeight: 700, letterSpacing: '-0.02em' }}>{app.name}</span>
        </div>
      )}
      {c.headline && (
        <h1
          style={{
            margin: 0,
            position: 'relative',
            isolation: 'isolate',
            fontSize: headlineSize,
            fontWeight: t.headlineWeight,
            lineHeight: headlineLineHeight(t.lineHeight, app.activeLang),
            letterSpacing: `${t.letterSpacing}em`,
            whiteSpace: 'pre-line',
            textWrap: 'balance',
          }}
        >
          <Headline text={c.headline} accent={pal.accentColor} marks={{ style: t.annotation, color: t.annotation.color || pal.accentColor, u }} />
        </h1>
      )}
      {c.subtitle && (
        <p style={{ margin: `${34 * u}px 0 0`, fontSize: headlineSize * 0.42, lineHeight: 1.3, color: pal.subtitleColor, whiteSpace: 'pre-line', textWrap: 'balance' }}>
          {c.subtitle.replace(/\\n/g, '\n')}
        </p>
      )}
    </div>
  );

  // Screenshots as small fans of devices; how they're grouped depends on where the text is.
  // Shrunk below when the screenshots wouldn't fit in the room the safe area leaves them.
  let shotH = safe.h * c.shotScale;
  const device = (i: number, style: CSSProperties) => {
    const s = shots[i];
    const a = app.assets[s.assetId];
    const frameW = shotH * (a.width / a.height);
    return (
      <div key={i} style={{ position: 'absolute', ...style }}>
        <Frame
          app={app}
          theme={t}
          asset={a}
          width={frameW}
          u={u}
          placeholderAspect={a.width / a.height}
          label=""
          radiusScale={DEVICES[s.device].radiusScale}
          device={s.device}
          accent={pal.accentColor}
        />
      </div>
    );
  };
  const widthOf = (i: number) => {
    const a = app.assets[shots[i].assetId];
    return shotH * (a.width / a.height);
  };

  // A fan: the first shot in front at the anchor, the rest stepped outward (toward `dir`, or alternating
  // both ways for 0) and slightly smaller behind it.
  const stepOf = (k: number, dir: -1 | 0 | 1) => (dir === 0 ? (k === 0 ? 0 : (k % 2 ? -1 : 1) * Math.ceil(k / 2)) : k * dir);
  const placed = (indexes: number[], dir: -1 | 0 | 1) =>
    indexes.map((i, k) => {
      const w = widthOf(i);
      const step = stepOf(k, dir);
      const scale = step === 0 ? 1 : Math.pow(0.88, Math.abs(step));
      const center = step * w * 0.62; // relative to the anchor
      return { i, step, scale, center, from: center - (w * scale) / 2, to: center + (w * scale) / 2 };
    });
  /** How far a fan reaches left and right of its anchor. */
  const extent = (indexes: number[], dir: -1 | 0 | 1) => {
    const p = placed(indexes, dir);
    return { left: -Math.min(0, ...p.map((x) => x.from)), right: Math.max(0, ...p.map((x) => x.to)) };
  };
  const fan = (indexes: number[], x: number, dir: -1 | 0 | 1): ReactNode[] =>
    placed(indexes, dir).map(({ i, step, scale, center }) =>
      device(i, {
        left: x + center - widthOf(i) / 2,
        top: cy - shotH / 2,
        transform: `scale(${scale})`,
        transformOrigin: '50% 50%',
        zIndex: 2 - Math.abs(step),
      }),
    );

  const idx = shots.map((_, i) => i);
  /** Scale screenshots down so a fan of `width` fits in `room`. */
  const fitTo = (width: number, room: number) => {
    if (width > room && width > 0) shotH *= room / width;
  };
  let devices: ReactNode[] = [];
  if (c.textPosition === 'center') {
    // Screenshots hug the text so they stay inside the safe area on narrow crops.
    const gap = 30 * u;
    const left = idx.filter((i) => i % 2 === 0);
    const right = idx.filter((i) => i % 2 === 1);
    const edge = textWidth / 2 + gap;
    const room = safe.w / 2 - edge;
    const widest = Math.max(...[extent(left, -1), extent(right, 1)].map((e) => e.left + e.right), 0);
    fitTo(widest, room);
    devices = [
      ...fan(left, cx - edge - (left.length ? widthOf(left[0]) / 2 : 0), -1),
      ...fan(right, cx + edge + (right.length ? widthOf(right[0]) / 2 : 0), 1),
    ];
  } else if (c.textPosition === 'left') {
    // Start the fan just after the text, so the two never overlap however many shots there are.
    const start = safe.x + textWidth + 50 * u;
    const end = safe.x + safe.w;
    const first = extent(idx, 0);
    fitTo(first.left + first.right, end - start);
    const e = extent(idx, 0);
    devices = fan(idx, Math.max(start + e.left, Math.min(end - e.right, (start + end) / 2 + (e.left - e.right) / 2)), 0);
  } else {
    const e = extent(idx, 0);
    fitTo(e.left + e.right, safe.w);
    devices = fan(idx, cx, 0);
  }

  return (
    <div
      lang={viewLanguage(app)}
      style={{
        width: W,
        height: H,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: fontStack(t.fontFamily, app.activeLang),
        WebkitFontSmoothing: 'antialiased',
        ...fillCss((c.background ?? pal.background).type === 'screenshot' ? { ...(c.background ?? pal.background), type: 'solid' } : (c.background ?? pal.background), app, { W, H, index: 0, count: 1 }),
      }}
    >
      {devices}
      {text}
      {safeGuide && (
        <div
          style={{
            position: 'absolute',
            left: safe.x,
            top: safe.y,
            width: safe.w,
            height: safe.h,
            outline: `${Math.max(2, 4 * (W / 3840))}px dashed rgba(59,130,246,0.9)`,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}
