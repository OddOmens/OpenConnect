import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { fontStack, headlineLineHeight, isRtl, viewLanguage } from '../shared/locales';
import type { AnnotationStyle, App, DeviceId, Rect, Slide, Theme } from '../shared/types';
import { paths, seedOf, type PathSpec } from './rough';
import { StickerLayer } from './stickers';
import { BackgroundLayers } from './background';
import { DEVICES, canvasSize } from '../shared/devices';
import { paletteFor, slideTheme } from '../shared/presets';
import { at } from '../base';

export const assetUrl = (appId: string, assetId: string) => at(`/api/apps/${appId}/assets/${assetId}`);



/** Hand-drawn marks on highlighted words; `color` is already resolved (theme color or highlight). */
export interface HeadlineMarks {
  style: AnnotationStyle;
  color: string;
  u: number;
}

/** One line's piece of the highlighted words: its text box, where the letters sit (baseline) and the text size. */
type Box = { x: number; y: number; w: number; h: number; base: number; em: number };
type MarkPath = PathSpec & { transform?: string; opacity?: number };

/** A straight stroke from x1 to x2 at y, round-capped, with the caps kept inside [x1, x2]. */
function straight(x1: number, x2: number, y: number, color: string, width: number): MarkPath {
  const inset = Math.min(width / 2, (x2 - x1) / 2);
  return { d: `M${x1 + inset} ${y}L${x2 - inset} ${y}`, stroke: color, strokeWidth: width, fill: '' };
}

/** A rectangle with rounded corners as a path (r is clamped to half the height). */
function roundRect(x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, h / 2, w / 2));
  return `M${x + k} ${y}H${x + w - k}A${k} ${k} 0 0 1 ${x + w} ${y + k}V${y + h - k}A${k} ${k} 0 0 1 ${x + w - k} ${y + h}H${x + k}A${k} ${k} 0 0 1 ${x} ${y + h - k}V${y + k}A${k} ${k} 0 0 1 ${x + k} ${y}Z`;
}

/**
 * The mark for one highlighted line fragment, in the headline's own pixel space. Underline, double and strike
 * are straight lines placed from the baseline; circle, box, brackets and squiggle are hand-drawn with rough.js;
 * the marker is a highlighter bar behind the words.
 */
function markPaths(b: Box, m: HeadlineMarks, seed: number): MarkPath[] {
  const pad = m.style.padding * m.u;
  const sw = Math.max(1, m.style.width * m.u);
  const o = { stroke: m.color, strokeWidth: sw, roughness: m.style.roughness, bowing: 1.4, seed };
  // Underlines sit `pad` below the baseline (through descenders, like a pen line under the words).
  const under = b.base + pad * 0.45 + sw / 2;
  switch (m.style.kind) {
    case 'underline':
      return [straight(b.x, b.x + b.w, under, m.color, sw)];
    case 'double': {
      const gap = Math.max(sw * 0.8, b.em * 0.05);
      return [straight(b.x, b.x + b.w, under, m.color, sw), straight(b.x, b.x + b.w, under + sw + gap, m.color, sw)];
    }
    case 'strike':
      // Through the middle of the lowercase letters.
      return [straight(b.x - pad * 0.2, b.x + b.w + pad * 0.2, b.base - b.em * 0.27, m.color, sw)];
    case 'marker': {
      const mk = m.style.marker;
      const h = Math.max(1, mk.height * b.em);
      const bottom = b.base + b.em * 0.12 - mk.lift * b.em;
      const x = b.x - pad * 0.4;
      const w = b.w + pad * 0.8;
      const d = roundRect(x, bottom - h, w, h, (mk.radius * h) / 2);
      const fill = { stroke: 'none', fill: m.color, fillStyle: 'solid', roughness: m.style.roughness, seed };
      const shape: MarkPath[] = m.style.roughness < 0.3 ? [{ d, stroke: 'none', strokeWidth: 0, fill: m.color }] : paths((g) => [g.path(d, fill)], fill);
      const transform = mk.tilt ? `rotate(${mk.tilt} ${x + w / 2} ${bottom - h / 2})` : undefined;
      return shape.map((p) => ({ ...p, transform, opacity: mk.opacity }));
    }
  }
  return paths((g) => {
    switch (m.style.kind) {
      case 'circle':
        return [g.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w + pad * 2.2, b.h + pad * 1.4, o)];
      case 'box':
        return [g.rectangle(b.x - pad, b.y - pad * 0.3, b.w + pad * 2, b.h + pad * 0.6, o)];
      case 'brackets':
        return [
          g.curve([[b.x - pad * 0.4, b.y], [b.x - pad, b.y + b.h * 0.15], [b.x - pad, b.y + b.h * 0.85], [b.x - pad * 0.4, b.y + b.h]], o),
          g.curve([[b.x + b.w + pad * 0.4, b.y], [b.x + b.w + pad, b.y + b.h * 0.15], [b.x + b.w + pad, b.y + b.h * 0.85], [b.x + b.w + pad * 0.4, b.y + b.h]], o),
        ];
      case 'squiggle': {
        // Waves about one stroke apart, centered where an underline would be.
        const amp = Math.max(sw * 0.9, b.em * 0.045);
        const n = Math.max(4, Math.round(b.w / Math.max(amp * 3.2, 1)));
        return [g.curve(Array.from({ length: n + 1 }, (_, i) => [b.x + (b.w * i) / n, under + amp + (i % 2 ? amp : -amp)] as [number, number]), { ...o, bowing: 0 })];
      }
      default:
        return [];
    }
  }, o);
}

/**
 * "Get *Flexible* Starting Now" → "Flexible" in the highlight color, optionally with a hand-drawn mark around it.
 * Literal "\n" also breaks lines. The parent element must be `position: relative` for marks.
 */
export function Headline({ text, accent, marks }: { text: string; accent: string; marks?: HeadlineMarks }) {
  const parts = text.replace(/\\n/g, '\n').split(/(\*[^*]+\*)/g);
  const ref = useRef<HTMLSpanElement>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const remeasure = useRef<(() => void) | null>(null);
  const kind = marks?.style.kind ?? 'none';
  const on = kind !== 'none';

  // Measure where the highlighted words landed (per line), in unscaled pixels of the headline element.
  useLayoutEffect(() => {
    const root = ref.current;
    const host = root?.parentElement;
    if (!on || !root || !host) return setBoxes([]);
    const measure = () => {
      const hr = host.getBoundingClientRect();
      const scale = hr.width / (host.offsetWidth || 1) || 1;
      // Where the baseline sits below the top of a text box in this font: a zero-size inline-block after an
      // "x" rests on the baseline. Same font and size for every highlighted word, so measure once.
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap';
      probe.innerHTML = '<span>x<span style="display:inline-block;width:0;height:0"></span></span>';
      root.appendChild(probe);
      const line = probe.firstElementChild!;
      const ascent = (line.lastElementChild!.getBoundingClientRect().bottom - line.getBoundingClientRect().top) / scale;
      const em = parseFloat(getComputedStyle(line).fontSize) || 16;
      probe.remove();
      const out: Box[] = [];
      root.querySelectorAll('[data-mark]').forEach((el) => {
        for (const r of el.getClientRects()) {
          const y = (r.top - hr.top) / scale;
          out.push({ x: (r.left - hr.left) / scale, y, w: r.width / scale, h: r.height / scale, base: y + ascent, em });
        }
      });
      setBoxes((prev) => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out));
    };
    remeasure.current = measure;
    measure();
    document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => {
      ro.disconnect();
      remeasure.current = null;
    };
  }, [on, text]);
  // A new typeface, weight or spacing moves the words without resizing anything: check again after each render.
  useLayoutEffect(() => remeasure.current?.());

  const recolor = !on || marks!.style.recolor;
  return (
    <span ref={ref}>
      {on && boxes.length > 0 && (
        <svg style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', zIndex: 0, pointerEvents: 'none' }} aria-hidden>
          {boxes.flatMap((b, i) =>
            markPaths(b, marks!, seedOf(`${text}|${i}`)).map((p, j) => (
              <path
                key={`${i}-${j}`}
                d={p.d}
                stroke={p.stroke}
                strokeWidth={p.strokeWidth}
                fill={p.fill || 'none'}
                opacity={p.opacity}
                transform={p.transform}
                strokeLinecap="round"
              />
            )),
          )}
        </svg>
      )}
      {parts.map((part, i) =>
        part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
          <span key={i} data-mark style={{ color: recolor ? accent : undefined, position: 'relative', zIndex: 1 }}>
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={i} style={{ position: 'relative', zIndex: 1 }}>
            {part}
          </span>
        ),
      )}
    </span>
  );
}

/** Decoration colors: the theme's own, or the highlight plus brand colors that differ from the background. */
function decorColors(t: Theme, pal: { accentColor: string; subtitleColor: string; background: { color: string } }, brand: string[]) {
  if (t.decor.color) return [t.decor.color];
  const bg = pal.background.color.toLowerCase();
  const list = [pal.accentColor, ...brand].filter((c) => c && c.toLowerCase() !== bg);
  return [...new Set(list.map((c) => c.toLowerCase()))];
}

interface Props {
  app: App;
  slide: Slide;
  device: DeviceId;
  /** editor mode shows drop placeholders for missing screenshots */
  editing?: boolean;
  /** render at a specific App Store size instead of the app's design size */
  sizeKey?: string;
}

export function SlideView({ app, slide, device, editing, sizeKey }: Props) {
  const [W, H] = canvasSize(app, device, sizeKey);
  const spec = DEVICES[device];
  const u = Math.min(W, H) / 1000;
  // The app's style, with anything this slide overrides.
  const t = slideTheme(app, slide);
  const slideIndex = Math.max(0, app.slides.findIndex((s) => s.id === slide.id));
  const pal = paletteFor(t, slideIndex);
  const align = t.align;
  const ts = spec.textScale;
  const landscape = W > H;

  const padX = (landscape ? 110 : 80) * u;
  const padTop = (landscape ? 90 : 130) * u;
  const padBottom = (landscape ? 90 : 130) * u;
  const gap = (landscape ? 56 : 72) * u;

  const hero = slide.role === 'hero';
  // A leaning device needs room to lean: a little smaller on hero slides.
  const fw = spec.frameWidth[t.layout] * W * (t.shotScale || 1) * (hero ? 0.92 : 1);
  const shot = slide.shots[device] ? app.assets[slide.shots[device]!] : undefined;

  const frame = (style: CSSProperties = {}) => (
    <Frame
      app={app}
      theme={t}
      asset={shot}
      width={fw}
      u={u}
      placeholderAspect={W / H}
      radiusScale={spec.radiusScale}
      device={device}
      accent={pal.accentColor}
      callout={shot ? slide.callouts?.[device] : null}
      label={editing ? `Drop ${spec.label} screenshot` : ''}
      style={style}
    />
  );

  const textBlock = (width?: number | string, header?: ReactNode) => (
    <div
      dir={isRtl(app.activeLang) ? 'rtl' : undefined}
      style={{
        // Text position: moves the headline block up (−) or down (+) without moving the screenshot.
        transform: t.textOffsetY ? `translateY(${t.textOffsetY * u}px)` : undefined,
        position: 'relative',
        zIndex: 3,
        width: width ?? '100%',
        boxSizing: 'border-box',
        padding: `0 ${padX}px`,
        // 'start' is the right edge in Arabic and Hebrew.
        textAlign: align === 'center' ? 'center' : 'start',
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        flexShrink: 0,
      }}
    >
      {header}
      <h1
        style={{
          margin: 0,
          // Positioned and isolated so hand-drawn marks sit behind the words.
          position: 'relative',
          isolation: 'isolate',
          fontSize: t.headlineSize * u * ts * (hero ? 1.12 : 1),
          fontWeight: t.headlineWeight,
          lineHeight: headlineLineHeight(t.lineHeight, app.activeLang),
          letterSpacing: `${t.letterSpacing}em`,
          color: pal.textColor,
          whiteSpace: 'pre-line',
          textWrap: 'balance',
        }}
      >
        <Headline text={slide.headline} accent={pal.accentColor} marks={{ style: t.annotation, color: t.annotation.color || pal.accentColor, u }} />
      </h1>
      {slide.subtitle && (
        <p
          style={{
            margin: `${26 * u}px 0 0`,
            fontSize: t.subtitleSize * u * ts,
            fontWeight: 400,
            lineHeight: 1.3,
            color: pal.subtitleColor,
            whiteSpace: 'pre-line',
            textWrap: 'balance',
          }}
        >
          {slide.subtitle.replace(/\\n/g, '\n')}
        </p>
      )}
    </div>
  );

  const offset = `translateY(${t.shotOffsetY * u}px)`;
  let content: ReactNode;

  if (hero) {
    const headerSize = t.headlineSize * u * ts;
    const header = (
      <HeroHeader app={app} size={headerSize} color={pal.textColor} align={align} />
    );
    // Wide devices (iPad, Mac) look heavy leaning as far as a phone does.
    const tilt = `rotate(${t.hero.tilt * (device === 'iphone' ? 1 : 0.5)}deg)`;
    if (landscape || t.layout === 'side') {
      content = (
        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          {textBlock('46%', header)}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            {frame({ transform: `${offset} ${tilt}`, flexShrink: 0 })}
          </div>
        </div>
      );
    } else {
      // Leaning device that runs off the bottom; with left-aligned text it sits toward the left like the text.
      const shift = align === 'left' ? -0.05 * W : 0;
      content = (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', paddingTop: padTop * 0.8, boxSizing: 'border-box' }}>
          {textBlock(undefined, header)}
          <div style={{ marginTop: gap * 1.1, transform: `${offset} translateX(${shift}px) ${tilt}`, transformOrigin: '50% 30%', flexShrink: 0 }}>
            {frame()}
          </div>
        </div>
      );
    }
  } else switch (t.layout) {
    case 'bottom':
      content = (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingBottom: padBottom, boxSizing: 'border-box' }}>
          <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', marginBottom: gap }}>
            {frame({ transform: offset, flexShrink: 0 })}
          </div>
          {textBlock()}
        </div>
      );
      break;

    case 'side':
      content = (
        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          {textBlock('44%')}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            {frame({ transform: offset, flexShrink: 0 })}
          </div>
        </div>
      );
      break;

    default: // top
      content = (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', paddingTop: padTop, boxSizing: 'border-box' }}>
          {textBlock()}
          <div style={{ marginTop: gap, transform: offset, flexShrink: 0 }}>{frame()}</div>
        </div>
      );
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
        background: pal.background.color,
      }}
    >
      <BackgroundLayers
        app={app}
        theme={t}
        // A panorama is one picture, so every slide uses the primary background (not the alternating one).
        bg={t.panorama ? t.palettes.primary.background : pal.background}
        ink={pal.textColor}
        area={{ W, H, index: slideIndex, count: t.panorama ? Math.max(1, app.slides.length) : 1 }}
        u={u}
        shotAssetId={shot?.id}
        colors={decorColors(t, pal, app.profile.brandColors)}
      />
      <StickerLayer stickers={slide.stickers ?? []} layer="back" W={W} H={H} u={u} shadow={t.stickerShadow} accent={pal.accentColor} zIndex={1} />
      <div style={{ position: 'relative', zIndex: 2, height: '100%' }}>{content}</div>
      <StickerLayer stickers={slide.stickers ?? []} layer="front" W={W} H={H} u={u} shadow={t.stickerShadow} accent={pal.accentColor} zIndex={3} />
    </div>
  );
}

/**
 * Drawn hardware per device, as fractions of the frame's outer width.
 * rim: metal edge in the device color · bezel: black glass around the screen · screenRadius: of the screen width.
 */
const HARDWARE: Record<DeviceId, { rim: number; bezel: number; screenRadius: number; island: boolean; buttons: boolean }> = {
  iphone: { rim: 0.009, bezel: 0.026, screenRadius: 0.135, island: true, buttons: true },
  duo: { rim: 0.008, bezel: 0.028, screenRadius: 0.07, island: false, buttons: true },
  ipad: { rim: 0.006, bezel: 0.042, screenRadius: 0.03, island: false, buttons: false },
  mac: { rim: 0.004, bezel: 0.02, screenRadius: 0.012, island: false, buttons: false },
};

/** Lighter or darker version of a hex color (amount -1…1), for metal highlights. */
function shade(hex: string, amount: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(ch);
  return `rgb(${r}, ${g}, ${b})`;
}

export function Frame({
  app,
  theme,
  asset,
  width,
  u,
  placeholderAspect,
  label,
  style,
  radiusScale,
  device,
  callout,
  accent,
}: {
  app: App;
  theme: Theme;
  /** glow color when the theme doesn't set one */
  accent?: string;
  radiusScale: number;
  asset?: { id: string; width: number; height: number };
  width: number;
  u: number;
  placeholderAspect: number;
  label: string;
  style?: CSSProperties;
  device: DeviceId;
  callout?: Rect | null;
}) {
  const f = theme.frame;
  const aspect = asset && asset.width && asset.height ? asset.width / asset.height : placeholderAspect;
  // Soft light behind the screenshot: a wrapper holds the glow under whichever frame is drawn.
  const g = theme.glow;
  const withGlow = (node: React.ReactNode, outerStyle?: CSSProperties) =>
    g.strength > 0 ? (
      <div style={{ position: 'relative', width: 'fit-content', ...outerStyle }}>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '42%',
            width: width * g.size * 1.25,
            height: width * g.size * 1.25,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${g.color || accent || theme.palettes.primary.accentColor} 0%, transparent 68%)`,
            opacity: Math.min(1, g.strength),
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative' }}>{node}</div>
      </div>
    ) : null;
  const shadow = f.shadow > 0 ? `0 ${40 * u}px ${110 * u}px rgba(0,0,0,${f.shadow})` : 'none';

  const screen = (screenWidth: number, r: number | string) => (
    <div style={{ position: 'relative', width: '100%' }}>
      {asset ? (
        <img
          src={assetUrl(app.id, asset.id)}
          alt=""
          draggable={false}
          style={{ display: 'block', width: '100%', aspectRatio: aspect, objectFit: 'cover', borderRadius: r }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            aspectRatio: aspect,
            borderRadius: r,
            background: 'repeating-linear-gradient(135deg, rgba(127,127,127,0.18) 0 2px, rgba(127,127,127,0.08) 2px 28px)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: screenWidth * 0.35,
            boxSizing: 'border-box',
            color: 'rgba(127,127,127,0.9)',
            fontSize: 40 * u,
            fontFamily: 'system-ui',
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          {label}
        </div>
      )}
      {asset && callout && <Callout app={app} style={theme.callout} asset={asset} rect={callout} screenWidth={screenWidth} aspect={aspect} u={u} />}
    </div>
  );

  if (f.kind === 'device') {
    const hw = HARDWARE[device];
    const mac = device === 'mac';
    // A Mac's base is wider than its lid; keep the whole laptop inside `width`.
    const outer = mac ? width / 1.14 : width;
    const rim = hw.rim * outer;
    const bezel = hw.bezel * outer;
    const screenW = outer - 2 * (rim + bezel);
    const screenR = hw.screenRadius * screenW;
    const body = f.deviceColor;
    const metal = `linear-gradient(135deg, ${shade(body, 0.35)} 0%, ${body} 18%, ${shade(body, -0.25)} 50%, ${body} 82%, ${shade(body, 0.3)} 100%)`;
    const button = (side: 'left' | 'right', top: number, height: number) => (
      <div
        style={{
          position: 'absolute',
          [side]: -rim * 0.9,
          top: `${top * 100}%`,
          height: `${height * 100}%`,
          width: rim * 1.2,
          borderRadius: rim,
          background: metal,
        }}
      />
    );
    const lid = (
      <div
        style={{
          position: 'relative',
          width: outer,
          boxSizing: 'border-box',
          padding: rim,
          background: metal,
          borderRadius: mac ? `${screenR + bezel + rim}px ${screenR + bezel + rim}px ${rim * 2}px ${rim * 2}px` : screenR + bezel + rim,
          boxShadow: mac ? 'none' : shadow,
        }}
      >
        {hw.buttons && device === 'iphone' && (
          <>
            {button('left', 0.17, 0.035)}
            {button('left', 0.235, 0.065)}
            {button('left', 0.315, 0.065)}
            {button('right', 0.265, 0.1)}
          </>
        )}
        {hw.buttons && device === 'duo' && button('right', 0.12, 0.08)}
        <div
          style={{
            position: 'relative',
            padding: bezel,
            paddingBottom: mac ? bezel * 1.6 : bezel,
            background: '#050505',
            borderRadius: mac ? `${screenR + bezel}px ${screenR + bezel}px 0 0` : screenR + bezel,
            boxShadow: `inset 0 0 0 ${Math.max(1, u)}px rgba(255,255,255,0.06)`,
          }}
        >
          {screen(screenW, mac ? `${screenR}px ${screenR}px 0 0` : screenR)}
          {hw.island && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: bezel + screenW * 0.027,
                width: screenW * 0.31,
                height: screenW * 0.09,
                transform: 'translateX(-50%)',
                borderRadius: screenW,
                background: '#000',
              }}
            />
          )}
          {mac && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                width: screenW * 0.11,
                height: bezel * 1.45,
                transform: 'translateX(-50%)',
                borderRadius: `0 0 ${bezel * 0.5}px ${bezel * 0.5}px`,
                background: '#050505',
              }}
            />
          )}
        </div>
      </div>
    );
    if (!mac) return withGlow(lid, style) ?? <div style={{ position: 'relative', ...style }}>{lid}</div>;
    const baseH = outer * 0.028;
    const laptop = (own?: CSSProperties) => (
      <div style={{ width, display: 'flex', flexDirection: 'column', alignItems: 'center', filter: f.shadow > 0 ? `drop-shadow(0 ${30 * u}px ${60 * u}px rgba(0,0,0,${f.shadow}))` : undefined, ...own }}>
        {lid}
        <div
          style={{
            position: 'relative',
            width,
            height: baseH,
            background: `linear-gradient(180deg, ${shade(body, 0.4)} 0%, ${body} 35%, ${shade(body, -0.35)} 100%)`,
            borderRadius: `${baseH * 0.2}px ${baseH * 0.2}px ${baseH * 0.9}px ${baseH * 0.9}px / ${baseH * 0.2}px ${baseH * 0.2}px ${baseH}px ${baseH}px`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              width: width * 0.14,
              height: baseH * 0.4,
              transform: 'translateX(-50%)',
              borderRadius: `0 0 ${baseH * 0.4}px ${baseH * 0.4}px`,
              background: shade(body, -0.3),
            }}
          />
        </div>
      </div>
    );
    return withGlow(laptop(), style) ?? laptop(style);
  }

  const stroke = f.strokeWidth * u;
  const r = (f.radius / 100) * radiusScale * Math.min(width, width / aspect);
  const outlined = (own?: CSSProperties) => (
    <div
      style={{
        width,
        boxSizing: 'border-box',
        padding: stroke,
        background: stroke > 0 ? f.strokeColor : 'transparent',
        borderRadius: r + stroke,
        boxShadow: shadow,
        ...own,
      }}
    >
      {screen(width - 2 * stroke, r)}
    </div>
  );
  return withGlow(outlined(), style) ?? outlined(style);
}

/**
 * The marked part of the screenshot, drawn again on top of it — larger, rounded and with a shadow — so it
 * reads as lifted out of the screen. It never grows wider than about the device itself.
 */
function Callout({
  app,
  style: c,
  asset,
  rect,
  screenWidth,
  aspect,
  u,
}: {
  app: App;
  style: Theme['callout'];
  asset: { id: string };
  rect: Rect;
  screenWidth: number;
  aspect: number;
  u: number;
}) {
  const sw = screenWidth;
  const sh = screenWidth / aspect;
  const w = rect.w * sw;
  const h = rect.h * sh;
  const scale = Math.max(0.5, Math.min(c.scale, (sw * 1.16) / w));
  const cx = (rect.x + rect.w / 2) * sw;
  const cy = (rect.y + rect.h / 2) * sh;
  return (
    <div
      style={{
        position: 'absolute',
        left: cx - (w * scale) / 2,
        top: cy - (h * scale) / 2,
        width: w * scale,
        height: h * scale,
        borderRadius: c.radius * u,
        backgroundImage: `url(${assetUrl(app.id, asset.id)})`,
        backgroundSize: `${sw * scale}px ${sh * scale}px`,
        backgroundPosition: `${-rect.x * sw * scale}px ${-rect.y * sh * scale}px`,
        // The faint edge keeps it readable on dark screens, where a shadow barely shows.
        boxShadow: `0 0 0 ${2 * u}px rgba(255,255,255,0.14), 0 ${30 * u}px ${90 * u}px rgba(0,0,0,${c.shadow}), 0 ${6 * u}px ${18 * u}px rgba(0,0,0,${c.shadow * 0.6})`,
        zIndex: 2,
      }}
    />
  );
}

/** Rating or downloads badge between laurels, then the app icon and name — the top of a hero slide. */
function HeroHeader({ app, size, color, align }: { app: App; size: number; color: string; align: 'left' | 'center' }) {
  const h = app.theme.hero;
  const justify = align === 'center' ? 'center' : 'flex-start';
  const showBadge = h.badge !== 'none' && (h.badgeTitle || h.badgeCaption || h.badge !== 'custom');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: justify, gap: size * 0.6, marginBottom: size * 0.6 }}>
      {showBadge && (
        <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.14, color }}>
          <Laurel size={size * 2.1} color={color} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', lineHeight: 1.08 }}>
            {h.badge === 'rating' && <Stars size={size * 0.42} color={color} />}
            {h.badge === 'downloads' && <DownloadMark size={size * 0.56} color={color} />}
            {h.badgeTitle && (
              <div style={{ fontSize: size * 0.64, fontWeight: 750, letterSpacing: '-0.02em', marginTop: h.badge === 'custom' ? 0 : size * 0.1 }}>
                {h.badgeTitle}
              </div>
            )}
            {h.badgeCaption && <div style={{ fontSize: size * 0.34, fontWeight: 500, opacity: 0.85, marginTop: size * 0.06 }}>{h.badgeCaption}</div>}
          </div>
          <Laurel size={size * 2.1} color={color} mirror />
        </div>
      )}
      {h.lockup && (
        <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.3, color }}>
          {app.iconAssetId && (
            <img
              src={assetUrl(app.id, app.iconAssetId)}
              alt=""
              style={{
                width: size * 1.35,
                height: size * 1.35,
                borderRadius: size * 1.35 * 0.225,
                display: 'block',
                boxShadow: `0 ${size * 0.06}px ${size * 0.2}px rgba(0,0,0,0.25)`,
              }}
            />
          )}
          <span style={{ fontSize: size * 0.82, fontWeight: 700, letterSpacing: '-0.02em' }}>{app.name}</span>
        </div>
      )}
    </div>
  );
}

function Stars({ size, color }: { size: number; color: string }) {
  const star = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';
  return (
    <div style={{ display: 'flex', gap: size * 0.12 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24">
          <path d={star} fill={color} />
        </svg>
      ))}
    </div>
  );
}

function DownloadMark({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M6.5 10l5.5 5.5 5.5-5.5M4 20h16" />
    </svg>
  );
}

/**
 * One laurel branch: a stem bowing outward, with leaves in pairs on both sides pointing up along it, getting
 * smaller toward the top, and a single leaf at the tip. The stem never shows past the lowest leaves.
 */
function Laurel({ size, color, mirror }: { size: number; color: string; mirror?: boolean }) {
  // Quadratic stem from the bottom (inner side, near the text) bowing out to the left and back in at the top.
  const P0 = [40, 112];
  const P1 = [2, 70];
  const P2 = [30, 8];
  const at = (t: number) => [0, 1].map((k) => (1 - t) ** 2 * P0[k] + 2 * (1 - t) * t * P1[k] + t * t * P2[k]);
  const tangent = (t: number) => [0, 1].map((k) => 2 * (1 - t) * (P1[k] - P0[k]) + 2 * t * (P2[k] - P1[k]));
  const leaf = (t: number, side: -1 | 0 | 1, len: number, key: string) => {
    const [x, y] = at(t);
    const [dx, dy] = tangent(t);
    const rot = (Math.atan2(dy, dx) * 180) / Math.PI + side * 34;
    const w = len * 0.4;
    // Pointed leaf from its base at the stem to its tip.
    return <path key={key} d={`M 0 0 C ${len * 0.3} ${-w} ${len * 0.75} ${-w * 0.8} ${len} 0 C ${len * 0.75} ${w * 0.8} ${len * 0.3} ${w} 0 0 Z`} transform={`translate(${x} ${y}) rotate(${rot})`} />;
  };
  const steps = [0.1, 0.23, 0.36, 0.49, 0.62, 0.75];
  // The part of the quadratic stem from t to the tip, as its own quadratic (de Casteljau split).
  const stemFrom = (t: number) => {
    const s = at(t);
    const c = [0, 1].map((k) => (1 - t) * P1[k] + t * P2[k]);
    return `M ${s[0]} ${s[1]} Q ${c[0]} ${c[1]} ${P2[0]} ${P2[1]}`;
  };
  return (
    <svg width={size * 0.5} height={size} viewBox="0 0 60 120" style={{ transform: mirror ? 'scaleX(-1)' : undefined, flexShrink: 0 }}>
      <g fill={color}>
        {/* The stem starts at the lowest pair of leaves, so no bare stalk shows below them. */}
        <path d={stemFrom(0.1)} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        {steps.map((t, i) => leaf(t, -1, 21 - i * 1.3, `o${i}`))}
        {steps.map((t, i) => leaf(t + 0.04, 1, 16 - i * 1.1, `i${i}`))}
        {leaf(0.9, 0, 14, 'tip')}
      </g>
    </svg>
  );
}
