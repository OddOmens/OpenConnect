import type { CSSProperties, ReactNode } from 'react';
import type { App, Background, DeviceId, Slide } from '../shared/types';
import { DEVICES, canvasSize } from '../shared/devices';
import { paletteFor } from '../shared/presets';

export const assetUrl = (appId: string, assetId: string) => `/api/apps/${appId}/assets/${assetId}`;

export function fontStack(family: string) {
  return family.startsWith('-') ? `${family}, system-ui, sans-serif` : `"${family}", -apple-system, system-ui, sans-serif`;
}

function backgroundCss(b: Background, appId: string): CSSProperties {
  switch (b.type) {
    case 'linear':
      return { background: `linear-gradient(${b.angle}deg, ${b.color}, ${b.color2})` };
    case 'radial':
      return { background: `radial-gradient(130% 75% at 50% 18%, ${b.color} 0%, ${b.color2} 100%)` };
    case 'image':
      if (b.imageAssetId) {
        return {
          backgroundColor: b.color,
          backgroundImage: `linear-gradient(180deg, rgba(0,0,0,${b.overlay * 0.6}) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,${b.overlay}) 100%), url(${assetUrl(appId, b.imageAssetId)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        };
      }
      return { background: b.color };
    default:
      return { background: b.color };
  }
}

/** "Get *Flexible* Starting Now" → accent-colored "Flexible". Literal "\n" also breaks lines. */
export function Headline({ text, accent }: { text: string; accent: string }) {
  const parts = text.replace(/\\n/g, '\n').split(/(\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
          <span key={i} style={{ color: accent }}>
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
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
  const t = app.theme;
  const pal = paletteFor(t, Math.max(0, app.slides.findIndex((s) => s.id === slide.id)));
  const align = t.align;
  const ts = spec.textScale;
  const landscape = W > H;

  const padX = (landscape ? 110 : 80) * u;
  const padTop = (landscape ? 90 : 130) * u;
  const padBottom = (landscape ? 90 : 130) * u;
  const gap = (landscape ? 56 : 72) * u;

  const fw = spec.frameWidth[t.layout] * W * (t.shotScale || 1);
  const shot = slide.shots[device] ? app.assets[slide.shots[device]!] : undefined;

  const frame = (style: CSSProperties = {}) => (
    <Frame
      app={app}
      asset={shot}
      width={fw}
      u={u}
      placeholderAspect={W / H}
      radiusScale={spec.radiusScale}
      label={editing ? `Drop ${spec.label} screenshot` : ''}
      style={style}
    />
  );

  const textBlock = (width?: number | string) => (
    <div
      style={{
        width: width ?? '100%',
        boxSizing: 'border-box',
        padding: `0 ${padX}px`,
        textAlign: align,
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        flexShrink: 0,
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: t.headlineSize * u * ts,
          fontWeight: t.headlineWeight,
          lineHeight: t.lineHeight,
          letterSpacing: `${t.letterSpacing}em`,
          color: pal.textColor,
          whiteSpace: 'pre-line',
          textWrap: 'balance',
        }}
      >
        <Headline text={slide.headline} accent={pal.accentColor} />
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

  switch (t.layout) {
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
      style={{
        width: W,
        height: H,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: fontStack(t.fontFamily),
        WebkitFontSmoothing: 'antialiased',
        ...backgroundCss(pal.background, app.id),
      }}
    >
      {content}
    </div>
  );
}

function Frame({
  app,
  asset,
  width,
  u,
  placeholderAspect,
  label,
  style,
  radiusScale,
}: {
  app: App;
  radiusScale: number;
  asset?: { id: string; width: number; height: number };
  width: number;
  u: number;
  placeholderAspect: number;
  label: string;
  style?: CSSProperties;
}) {
  const f = app.theme.frame;
  const stroke = f.strokeWidth * u;
  const aspect = asset && asset.width && asset.height ? asset.width / asset.height : placeholderAspect;
  const r = (f.radius / 100) * radiusScale * Math.min(width, width / aspect);
  const shadow = f.shadow > 0 ? `0 ${40 * u}px ${110 * u}px rgba(0,0,0,${f.shadow})` : 'none';
  return (
    <div
      style={{
        width,
        boxSizing: 'border-box',
        padding: stroke,
        background: stroke > 0 ? f.strokeColor : 'transparent',
        borderRadius: r + stroke,
        boxShadow: shadow,
        ...style,
      }}
    >
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
            paddingTop: width * 0.35,
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
    </div>
  );
}
