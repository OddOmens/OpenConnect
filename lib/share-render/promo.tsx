// Marketing promo cards: Launch, What's New, Screenshots, Features, App Store Page, Loved By,
// Reviews, Top Rated, Milestone and Download. Unlike the
// stats cards these are made to sell the app, so they come in several styles and an accent
// colour, and their wording can be overridden.

import type { PromoFormatId, PromoStyleId, PromoTemplateId } from '@/lib/prefs';
import { defaultCopy, featureList, noteBullets, type PromoData } from '@/lib/marketing';
import { DottedWorld, Icon, STAR_PATH, STAR_COLOR, WORLD_H, WORLD_W, fmtCompact, fmtDay } from './kit';
import { TERRITORIES } from '@/lib/territories';

export const PROMO_SIZES: Record<PromoFormatId, { width: number; height: number }> = {
  '1x1': { width: 1080, height: 1080 },
  '4x5': { width: 1080, height: 1350 },
  '9x16': { width: 1080, height: 1920 },
  '16x9': { width: 1920, height: 1080 },
};

export interface PromoOptions {
  template: PromoTemplateId;
  style: PromoStyleId;
  accent: string;
  format: PromoFormatId;
  frameColor: string;  // iPhone frame
  showBadge: boolean;
  showRating: boolean;
  headline?: string;
  tagline?: string;
  cta?: string;
  notes?: string;
  quotes?: number[];   // Reviews: which of data.quotes, the first in front
  reviewCount?: 1 | 3; // Reviews: one review, or three fanned out
}

/** The app's images, inlined by the route before rendering. */
export interface PromoImages {
  icon: string | null;
  screenshots: { src: string; ratio: number }[];
}

// --- Colour ----------------------------------------------------------------------------

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (hex: string, to: string, t: number) => {
  const a = rgb(hex);
  const b = rgb(to);
  return toHex(a.map((v, i) => v + (b[i] - v) * t));
};
const rgba = (hex: string, a: number) => `rgba(${rgb(hex).join(',')},${a})`;
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

interface Palette {
  background: string;   // backgroundColor
  image?: string;       // backgroundImage (gradients)
  fg: string;
  muted: string;
  accent: string;       // eyebrows, checkmarks, highlights
  onAccent: string;     // drawn on top of accent
  surface: string;      // cards and chips
  border: string;
  badgeBg: string;
  badgeFg: string;
  frame: string;        // iPhone frame (metal) colour
}

function palette(style: PromoStyleId, accent: string, frame: string): Palette {
  return { ...colours(style, accent), frame };
}

function colours(style: PromoStyleId, accent: string): Omit<Palette, 'frame'> {
  switch (style) {
    case 'light':
      return {
        background: '#fafafa', image: `linear-gradient(180deg, #ffffff 0%, ${mix(accent, '#ffffff', 0.9)} 100%)`,
        fg: '#09090b', muted: '#52525b', accent: mix(accent, '#000000', 0.08), onAccent: '#ffffff', surface: '#ffffff', border: '#e4e4e7',
        badgeBg: '#09090b', badgeFg: '#ffffff',
      };
    case 'gradient':
      return {
        background: accent, image: `linear-gradient(155deg, ${mix(accent, '#000000', 0.55)} 0%, ${accent} 55%, ${mix(accent, '#ffffff', 0.3)} 100%)`,
        fg: '#ffffff', muted: 'rgba(255,255,255,0.78)', accent: '#ffffff', onAccent: mix(accent, '#000000', 0.2), surface: 'rgba(255,255,255,0.13)', border: 'rgba(255,255,255,0.24)',
        badgeBg: '#000000', badgeFg: '#ffffff',
      };
    case 'bold': {
      const dark = luminance(accent) > 0.3; // light accents (amber, cyan) need dark text
      return {
        background: accent,
        fg: dark ? '#0a0a0a' : '#ffffff', muted: dark ? 'rgba(0,0,0,0.68)' : 'rgba(255,255,255,0.82)', accent: dark ? '#0a0a0a' : '#ffffff', onAccent: accent,
        surface: dark ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.14)', border: dark ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.28)',
        badgeBg: dark ? '#0a0a0a' : '#ffffff', badgeFg: dark ? '#ffffff' : '#0a0a0a',
      };
    }
    case 'glow':
      return {
        background: '#050507', image: `radial-gradient(circle at 50% 50%, ${rgba(accent, 0.55)} 0%, ${rgba(accent, 0.12)} 45%, rgba(5,5,7,0) 75%)`,
        fg: '#fafafa', muted: '#a1a1aa', accent: mix(accent, '#ffffff', 0.25), onAccent: '#09090b', surface: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)',
        badgeBg: '#fafafa', badgeFg: '#09090b',
      };
    default: // studio: the dashboard's own dark look
      return {
        background: '#09090b', fg: '#fafafa', muted: '#a1a1aa', accent, onAccent: '#ffffff', surface: '#0e0e11', border: '#27272a',
        badgeBg: '#fafafa', badgeFg: '#09090b',
      };
  }
}

// --- Pieces ----------------------------------------------------------------------------

/** Headline size that shrinks for longer lines (the longest line, when it has line breaks). */
const headlineSize = (text: string, base: number) => {
  const n = Math.max(...text.split('\n').map((l) => l.length));
  return n > 48 ? base * 0.68 : n > 30 ? base * 0.8 : n > 18 ? base * 0.9 : base;
};

// --- Fitting text into the card ----------------------------------------------------------
// satori can't measure before laying out, so blocks are sized from their text: lines at about
// half an em per character (a little generous, so estimates err towards "taller").

/** Lines `text` takes at `fontPx` in `widthPx`, at most `clamp`. Line breaks start new lines. */
function textLines(text: string, fontPx: number, widthPx: number, clamp: number) {
  const perLine = Math.max(1, Math.floor(widthPx / (fontPx * 0.53)));
  const lines = text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
  return Math.min(clamp, lines);
}

/** Height of a headline block (see Headline). */
const headlineHeight = (text: string, size: number, widthPx: number, clamp: number) => {
  const fs = headlineSize(text, size);
  // Headline type is set tight (negative tracking), so it runs narrower than body text.
  return textLines(text, fs * 0.82, widthPx, clamp) * fs * 1.05;
};

/** The leading items whose heights (plus gaps) fit in `budget`; always at least `min`. */
function fitting<T>(items: T[], height: (item: T) => number, gap: number, budget: number, min = 0) {
  const out: T[] = [];
  let used = 0;
  for (const item of items) {
    const h = height(item) + (out.length ? gap : 0);
    if (used + h > budget && out.length >= min) break;
    out.push(item);
    used += h;
  }
  return out;
}

function AppIcon({ src, size, p }: { src: string | null; size: number; p: Palette }) {
  const radius = Math.round(size * 0.225);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img src={src} width={size} height={size} style={{ borderRadius: radius }} />
  ) : (
    <div style={{ display: 'flex', width: size, height: size, borderRadius: radius, background: p.surface, border: `2px solid ${p.border}` }} />
  );
}

function Eyebrow({ children, p, size = 24, center = false }: { children: React.ReactNode; p: Palette; size?: number; center?: boolean }) {
  return (
    <div style={{ display: 'flex', flexShrink: 0, alignSelf: center ? 'center' : 'flex-start', alignItems: 'center', gap: 10, padding: `${size * 0.45}px ${size * 1.05}px`, borderRadius: 999, background: p.surface, border: `2px solid ${p.border}`, color: p.accent, fontSize: size, fontWeight: 600, letterSpacing: size * 0.12 }}>
      {children}
    </div>
  );
}

function StarRow({ rating, size, gap = 6, empty }: { rating: number; size: number; gap?: number; empty: string }) {
  const width = size * 5 + gap * 4;
  const clip = Math.floor(rating) * (size + gap) + (rating % 1) * size;
  const row = (fill: string) =>
    [0, 1, 2, 3, 4].map((i) => <path key={i} d={STAR_PATH} fill={fill} transform={`translate(${i * (size + gap)} 0) scale(${size / 24})`} />);
  return (
    <svg width={width} height={size} viewBox={`0 0 ${width} ${size}`}>
      <defs>
        <clipPath id={`promo-stars-${size}`}>
          <rect x="0" y="0" width={clip} height={size} />
        </clipPath>
      </defs>
      {row(empty)}
      <g clipPath={`url(#promo-stars-${size})`}>{row(STAR_COLOR)}</g>
    </svg>
  );
}

/** "Download on the App Store" button (or the custom call to action). */
function Badge({ p, scale = 1, cta }: { p: Palette; scale?: number; cta?: string }) {
  const h = 96 * scale;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 * scale, height: h, padding: `0 ${36 * scale}px 0 ${30 * scale}px`, borderRadius: h * 0.26, background: p.badgeBg, color: p.badgeFg }}>
      <Icon name="download" size={40 * scale} color={p.badgeFg} />
      {cta ? (
        <div style={{ display: 'flex', fontSize: 36 * scale, fontWeight: 600, letterSpacing: -0.5 }}>{cta}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
          <div style={{ display: 'flex', fontSize: 20 * scale, fontWeight: 400, opacity: 0.85 }}>Download on the</div>
          <div style={{ display: 'flex', fontSize: 38 * scale, fontWeight: 600, letterSpacing: -0.8 }}>App Store</div>
        </div>
      )}
    </div>
  );
}

function Chip({ children, p, size = 26 }: { children: React.ReactNode; p: Palette; size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.4, height: size * 2.3, padding: `0 ${size * 0.9}px`, borderRadius: size * 1.15, background: p.surface, border: `2px solid ${p.border}`, fontSize: size, fontWeight: 600, color: p.fg }}>
      {children}
    </div>
  );
}

/** A tick in an accent circle and its line of text: release notes and features. */
function CheckItem({ text, size, p }: { text: string; size: number; p: Palette }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 22 }}>
      <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'center', width: size * 1.25, height: size * 1.25, marginTop: size * 0.06, borderRadius: size, background: p.accent }}>
        <svg width={size * 0.8} height={size * 0.8} viewBox="0 0 24 24" fill="none" stroke={p.onAccent} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <div style={{ display: 'block', flex: 1, fontSize: size, lineHeight: 1.35, lineClamp: 2 }}>{text}</div>
    </div>
  );
}

function StarGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d={STAR_PATH} fill={STAR_COLOR} />
    </svg>
  );
}

// The studio's iPhone (studio/src/render/SlideView.tsx, HARDWARE.iphone), as fractions of the
// frame's outer width: metal rim in the frame colour, black glass bezel, screen corner radius.
const IPHONE = { rim: 0.009, bezel: 0.026, screenRadius: 0.135 };

/** Lighter or darker version of a hex colour (amount -1…1), for the metal's highlights. */
const shade = (hex: string, amount: number) => (amount >= 0 ? mix(hex, '#ffffff', amount) : mix(hex, '#000000', -amount));

/** A screenshot in an iPhone: Dynamic Island, side buttons and a metal rim in the frame colour. */
function Phone({ shot, width, p, rotate = 0, offsetY = 0 }: { shot: { src: string; ratio: number }; width: number; p: Palette; rotate?: number; offsetY?: number }) {
  const rim = IPHONE.rim * width;
  const bezel = IPHONE.bezel * width;
  const screenW = width - 2 * (rim + bezel);
  const screenH = screenW * shot.ratio;
  const screenR = IPHONE.screenRadius * screenW;
  const body = p.frame;
  const metal = `linear-gradient(135deg, ${shade(body, 0.35)} 0%, ${body} 18%, ${shade(body, -0.25)} 50%, ${body} 82%, ${shade(body, 0.3)} 100%)`;
  const height = screenH + 2 * (rim + bezel);
  const button = (side: 'left' | 'right', top: number, h: number) => (
    <div style={{ display: 'flex', position: 'absolute', [side]: -rim * 0.9, top: top * height, height: h * height, width: rim * 1.2, borderRadius: rim, backgroundImage: metal }} />
  );
  return (
    <div style={{ display: 'flex', flexShrink: 0, marginTop: offsetY, ...(rotate ? { transform: `rotate(${rotate}deg)` } : {}) }}>
      <div style={{ display: 'flex', position: 'relative', width, padding: rim, backgroundImage: metal, borderRadius: screenR + bezel + rim }}>
        {button('left', 0.17, 0.035)}
        {button('left', 0.235, 0.065)}
        {button('left', 0.315, 0.065)}
        {button('right', 0.265, 0.1)}
        <div style={{ display: 'flex', position: 'relative', padding: bezel, background: '#050505', borderRadius: screenR + bezel }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={shot.src} width={screenW} height={screenH} style={{ borderRadius: screenR }} />
          <div style={{ display: 'flex', position: 'absolute', left: bezel + screenW * 0.345, top: bezel + screenW * 0.027, width: screenW * 0.31, height: screenW * 0.09, borderRadius: screenW, background: '#000000' }} />
        </div>
      </div>
    </div>
  );
}

/** Up to three phones fanned out, the first in front (painted last: satori has no z-index). */
function PhoneFan({ shots, width, p }: { shots: PromoImages['screenshots']; width: number; p: Palette }) {
  const pick = shots.slice(0, 3);
  if (pick.length === 1) return <Phone shot={pick[0]} width={width} p={p} />;
  const side = Math.round(width * 0.82);
  const tuck = Math.round(side * 0.72); // how far a side phone sticks out past the middle one
  const drop = Math.round(width * 0.12);
  const h = (w: number, ratio: number) => w * (ratio + 0.07);
  const total = pick.length === 3 ? width + tuck * 2 : width + tuck;
  const height = Math.max(h(width, pick[0].ratio), drop + h(side, pick[1].ratio));
  return (
    <div style={{ display: 'flex', position: 'relative', width: total, height }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: drop }}>
        <Phone shot={pick[1]} width={side} p={p} rotate={-7} />
      </div>
      {pick[2] && (
        <div style={{ display: 'flex', position: 'absolute', left: total - side, top: drop }}>
          <Phone shot={pick[2]} width={side} p={p} rotate={7} />
        </div>
      )}
      <div style={{ display: 'flex', position: 'absolute', left: pick.length === 3 ? tuck : total - width, top: 0 }}>
        <Phone shot={pick[0]} width={width} p={p} />
      </div>
    </div>
  );
}

function Canvas({ format, p, pad, children, row = false }: { format: PromoFormatId; p: Palette; pad: number; children: React.ReactNode; row?: boolean }) {
  const { width, height } = PROMO_SIZES[format];
  return (
    <div
      style={{
        display: 'flex', flexDirection: row ? 'row' : 'column', width, height, padding: pad, overflow: 'hidden',
        backgroundColor: p.background, ...(p.image ? { backgroundImage: p.image } : {}), color: p.fg, fontFamily: 'Inter', position: 'relative',
      }}
    >
      {children}
    </div>
  );
}

/** Icon and name on one line, for footers and small headers. */
function AppLine({ data, icon, p, size = 72 }: { data: PromoData; icon: string | null; p: Palette; size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.3, minWidth: 0 }}>
      <AppIcon src={icon} size={size} p={p} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', fontSize: size * 0.44, fontWeight: 600, letterSpacing: -0.6 }}>{data.name}</div>
        {data.listing?.genre && <div style={{ display: 'flex', fontSize: size * 0.3, color: p.muted }}>{data.listing.genre}</div>}
      </div>
    </div>
  );
}

function Headline({ text, size, p, align = 'left', lines = 3 }: { text: string; size: number; p: Palette; align?: 'left' | 'center'; lines?: number }) {
  const fs = headlineSize(text, size);
  return (
    <div style={{ display: 'block', flexShrink: 0, fontSize: fs, fontWeight: 800, letterSpacing: -fs * 0.035, lineHeight: 1.05, color: p.fg, textAlign: align, lineClamp: lines, whiteSpace: 'pre-line' }}>
      {text}
    </div>
  );
}

function Tagline({ text, size, p, align = 'left', lines = 3 }: { text: string; size: number; p: Palette; align?: 'left' | 'center'; lines?: number }) {
  if (!text) return null;
  return <div style={{ display: 'block', fontSize: size, lineHeight: 1.35, color: p.muted, textAlign: align, lineClamp: lines }}>{text}</div>;
}

/** Downloads rounded down to a brag-worthy figure: 12,345 → "12K+". */
function downloadsLabel(n: number) {
  if (n < 100) return null;
  const pow = 10 ** (Math.floor(Math.log10(n)) - 1);
  return `${fmtCompact(Math.floor(n / pow) * pow)}+`;
}

function StatChips({ data, p, o, size, center = false }: { data: PromoData; p: Palette; o: PromoOptions; size: number; center?: boolean }) {
  const dl = downloadsLabel(data.downloads);
  const chips: React.ReactNode[] = [];
  if (o.showRating && data.rating != null && data.ratingCount > 0) chips.push(<Chip key="r" p={p} size={size}><StarGlyph size={size * 1.05} />{data.rating.toFixed(1)}</Chip>);
  if (dl) chips.push(<Chip key="d" p={p} size={size}>{dl} downloads</Chip>);
  if (data.countries > 1) chips.push(<Chip key="c" p={p} size={size}>{data.countries} countries</Chip>);
  if (data.listing?.price) chips.push(<Chip key="p" p={p} size={size}>{data.listing.price}</Chip>);
  if (!chips.length) return null;
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: size * 0.5, justifyContent: center ? 'center' : 'flex-start' }}>{chips}</div>;
}

// --- Templates -------------------------------------------------------------------------

type Props = { data: PromoData; images: PromoImages; o: PromoOptions; p: Palette };

const tagline = (data: PromoData, o: PromoOptions) => o.tagline ?? defaultCopy(o.template, data).tagline;
const headlineOf = (data: PromoData, o: PromoOptions) => o.headline || defaultCopy(o.template, data).headline;

function Launch({ data, images, o, p }: Props) {
  const { format } = o;
  const headline = headlineOf(data, o);
  const eyebrow = 'NEW ON THE APP STORE';
  const shots = images.screenshots;
  if (format === '16x9') {
    return (
      <Canvas format={format} p={p} pad={96} row>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: 900, gap: 36 }}>
          <Eyebrow p={p}>{eyebrow}</Eyebrow>
          <AppIcon src={images.icon} size={170} p={p} />
          <Headline text={headline} size={104} p={p} lines={2} />
          <Tagline text={tagline(data, o)} size={34} p={p} lines={2} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {o.showBadge && <Badge p={p} cta={o.cta} />}
            <StatChips data={data} p={p} o={o} size={26} />
          </div>
        </div>
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {shots.length ? <PhoneFan shots={shots} width={380} p={p} /> : <AppIcon src={images.icon} size={460} p={p} />}
        </div>
      </Canvas>
    );
  }
  const tall = format === '9x16';
  const square = format === '1x1';
  const pad = tall ? 88 : 72;
  return (
    <Canvas format={format} p={p} pad={pad}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: square ? 22 : 30, paddingTop: tall && shots.length ? 40 : 0, ...(shots.length ? {} : { flex: 1, justifyContent: 'center' }) }}>
        <Eyebrow p={p} size={square ? 22 : tall ? 30 : 24} center>{eyebrow}</Eyebrow>
        <AppIcon src={images.icon} size={square ? 130 : tall ? 250 : 170} p={p} />
        <Headline text={headline} size={square ? 92 : tall ? 136 : 108} p={p} align="center" lines={2} />
        <Tagline text={tagline(data, o)} size={square ? 30 : tall ? 40 : 34} p={p} align="center" lines={tall ? 3 : 2} />
        {o.showBadge && <Badge p={p} cta={o.cta} scale={square ? 0.85 : tall ? 1.15 : 1} />}
        {!shots.length && <StatChips data={data} p={p} o={o} size={tall ? 34 : 28} center />}
      </div>
      {/* Phones peek up from the bottom edge. */}
      {shots.length > 0 && (
        <div style={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'flex-start', marginTop: square ? 40 : 60, marginBottom: -pad - 400 }}>
          <PhoneFan shots={shots} width={square ? 330 : tall ? 540 : 400} p={p} />
        </div>
      )}
    </Canvas>
  );
}

function Update({ data, images, o, p }: Props) {
  const { format } = o;
  const l = data.listing;
  const version = l?.version;
  // "Version / 1.4.0 / Is Here!", one per line.
  const headline = headlineOf(data, o);
  const landscape = format === '16x9';
  const tall = format === '9x16';
  const square = format === '1x1';
  const { width: W, height: H } = PROMO_SIZES[format];
  const pad = landscape ? 96 : tall ? 88 : 72;
  const headSize = square ? 76 : landscape ? 84 : tall ? 124 : 96;
  const fs = square ? 30 : tall ? 44 : 34;
  const notesPad = square ? 36 : 44;
  const bulletGap = square ? 18 : 26;
  const max = { '1x1': 4, '4x5': 6, '9x16': 8, '16x9': 5 }[format];
  const bullets = noteBullets(o.notes ?? l?.releaseNotes ?? '', max);
  const all = bullets.length ? bullets : ['Performance improvements and bug fixes'];
  // Release notes go in only while they fit between the headline and the footer.
  const date = l?.versionDate ? fmtDay(l.versionDate, { month: 'long', day: 'numeric', year: 'numeric' }) : null;
  const colW = landscape ? 1080 : W - pad * 2;
  const gap = square ? 26 : tall ? 44 : 36;
  const eyebrowH = (square ? 22 : tall ? 28 : 24) * 2.2;
  const used =
    eyebrowH + gap +
    headlineHeight(headline, headSize, colW, 3) + gap +
    (date && !landscape ? (square ? 26 : tall ? 34 : 30) * 1.3 + gap - 8 : 0) +
    (tall ? 200 + gap : 0) +
    notesPad * 2;
  const budget = H - pad * 2 - (landscape ? 0 : (square ? 64 : tall ? 96 : 80) + 32) - (landscape ? 80 + 32 : 0) - used;
  const bulletW = colW - notesPad * 2 - fs * 1.25 - 22;
  const items = fitting(all, (b) => textLines(b, fs, bulletW, 2) * fs * 1.35, bulletGap, budget, 1);
  const notes = (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, gap: bulletGap, padding: notesPad, borderRadius: 32, background: p.surface, border: `2px solid ${p.border}` }}>
      {items.map((b, i) => <CheckItem key={i} text={b} size={fs} p={p} />)}
    </div>
  );
  const footer = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
      <AppLine data={data} icon={images.icon} p={p} size={square ? 64 : tall ? 96 : 80} />
      {o.showBadge && <Badge p={p} cta={o.cta} scale={square ? 0.8 : tall ? 1.05 : 0.9} />}
    </div>
  );
  const eyebrow = `WHAT'S NEW${version ? ` · ${version}` : ''}`;
  if (landscape) {
    return (
      <Canvas format={format} p={p} pad={96} row>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 1080 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            <Eyebrow p={p}>{eyebrow}</Eyebrow>
            <Headline text={headline} size={headSize} p={p} lines={3} />
            {notes}
          </div>
          {footer}
        </div>
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {images.screenshots[0] ? <Phone shot={images.screenshots[0]} width={400} p={p} rotate={4} /> : <AppIcon src={images.icon} size={380} p={p} />}
        </div>
      </Canvas>
    );
  }
  return (
    <Canvas format={format} p={p} pad={tall ? 88 : 72}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap }}>
        {tall && <AppIcon src={images.icon} size={200} p={p} />}
        <Eyebrow p={p} size={square ? 22 : tall ? 28 : 24}>{eyebrow}</Eyebrow>
        <Headline text={headline} size={headSize} p={p} lines={3} />
        {date && <div style={{ display: 'flex', flexShrink: 0, marginTop: -8, fontSize: square ? 26 : tall ? 34 : 30, color: p.muted }}>Released {date}</div>}
        {notes}
      </div>
      {footer}
    </Canvas>
  );
}

function Screens({ data, images, o, p }: Props) {
  const { format } = o;
  const { width, height } = PROMO_SIZES[format];
  const headline = headlineOf(data, o);
  const landscape = format === '16x9';
  const tall = format === '9x16';
  const square = format === '1x1';
  const pad = tall ? 88 : landscape ? 80 : 72;
  const count = tall ? 2 : landscape ? 4 : 3;
  const shots = images.screenshots.slice(0, count);
  const n = Math.max(1, shots.length);
  const inner = width - pad * 2;
  const gap = landscape ? 44 : 24;
  const textH = landscape ? 250 : square ? 240 : tall ? 460 : 300;
  const footerH = o.showBadge ? 130 : 100;
  const ratio = shots[0]?.ratio ?? 2.165;
  const stagger = tall && n > 1 ? 0.2 : 0; // the second phone sits lower, as a share of its width
  const availH = height - pad * 2 - textH - footerH;
  // As tall as the space allows; side by side in landscape, overlapping where the canvas is narrow.
  const maxW = landscape ? (inner - gap * (n - 1)) / n : inner * (n === 1 ? 0.7 : n === 2 ? 0.6 : 0.42);
  const phoneW = Math.floor(Math.min(maxW, availH / (ratio + 0.07 + stagger)));
  const spacing = n > 1 ? Math.min(gap, (inner - n * phoneW) / (n - 1)) : 0;
  return (
    <Canvas format={format} p={p} pad={pad}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, height: textH, justifyContent: 'center' }}>
        <Headline text={headline} size={square ? 80 : landscape ? 84 : tall ? 124 : 92} p={p} align="center" lines={2} />
        <Tagline text={tagline(data, o)} size={square ? 28 : tall ? 38 : 32} p={p} align="center" lines={tall ? 3 : 2} />
      </div>
      <div style={{ display: 'flex', flex: 1, alignItems: 'flex-start', justifyContent: 'center', paddingTop: Math.max(0, (availH - phoneW * (ratio + 0.07 + stagger)) / 2) }}>
        {shots.length ? (
          shots.map((s, i) => (
            <div key={i} style={{ display: 'flex', marginLeft: i ? spacing : 0, marginTop: i % 2 ? phoneW * stagger : 0 }}>
              <Phone shot={s} width={phoneW} p={p} />
            </div>
          ))
        ) : (
          <AppIcon src={images.icon} size={Math.min(availH, 420)} p={p} />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: footerH, paddingTop: 24 }}>
        <AppLine data={data} icon={images.icon} p={p} size={square ? 64 : 76} />
        {o.showBadge && <Badge p={p} cta={o.cta} scale={square ? 0.8 : 0.9} />}
      </div>
    </Canvas>
  );
}

function Loved({ data, images, o, p }: Props) {
  const { format } = o;
  const landscape = format === '16x9';
  const tall = format === '9x16';
  const square = format === '1x1';
  const headline = headlineOf(data, o);
  const { width: W } = PROMO_SIZES[format];
  const pad = landscape ? 96 : tall ? 88 : 72;
  const leftW = 780; // 16:9: headline on the left, the map on the right
  const mapW = landscape ? W - pad * 2 - leftW : W - pad * 2;
  const legendH = square ? 30 : 36;
  const reached = new Set(data.reached);
  // Every App Store storefront: green for countries with downloads, red for the rest, the same in
  // every style, over a faint grid of the continents. A dark outline keeps them clear on a green or
  // red background (Bold).
  const REACHED = '#22c55e';
  const NOT_YET = '#ef4444';
  const ring = 'rgba(0,0,0,0.55)';
  const notYet = TERRITORIES.filter((t) => !reached.has(t.code));
  const pins = [
    ...notYet.map((t) => ({ code: t.code, color: NOT_YET, r: 0.5, stroke: ring })),
    ...TERRITORIES.filter((t) => reached.has(t.code)).map((t) => ({ code: t.code, color: REACHED, r: 0.62, stroke: ring })),
  ];
  const legendFont = square ? 22 : tall ? 28 : 24;
  const legendDot = (color: string) => <div style={{ display: 'flex', width: legendFont * 0.6, height: legendFont * 0.6, borderRadius: legendFont, background: color, border: `${Math.max(2, legendFont * 0.08)}px solid ${ring}` }} />;
  const map = (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, gap: 14 }}>
      <DottedWorld width={mapW} pins={pins} dotColor={p.muted} dotOpacity={0.16} />
      <div style={{ display: 'flex', alignItems: 'center', gap: legendFont * 0.5, height: legendH, fontSize: legendFont, color: p.muted }}>
        {legendDot(REACHED)}
        <span style={{ color: p.fg, fontWeight: 600 }}>{data.reached.length}</span>
        <span>of {data.storefronts} App Store countries</span>
        <div style={{ display: 'flex', width: legendFont }} />
        {legendDot(NOT_YET)}
        <span style={{ color: p.fg, fontWeight: 600 }}>{notYet.length}</span>
        <span>not yet</span>
      </div>
    </div>
  );
  const footer = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
      <AppLine data={data} icon={images.icon} p={p} size={square ? 64 : tall ? 96 : 80} />
      {o.showBadge && <Badge p={p} cta={o.cta} scale={square ? 0.8 : tall ? 1.05 : 0.9} />}
    </div>
  );
  if (landscape) {
    return (
      <Canvas format={format} p={p} pad={pad} row>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: leftW, paddingRight: 60 }}>
          <Headline text={headline} size={110} p={p} lines={3} />
          {footer}
        </div>
        <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>{map}</div>
      </Canvas>
    );
  }
  return (
    <Canvas format={format} p={p} pad={pad}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: square ? 40 : tall ? 72 : 56 }}>
        <Headline text={headline} size={square ? 96 : tall ? 140 : 112} p={p} lines={3} />
        {map}
      </div>
      {footer}
    </Canvas>
  );
}

/**
 * Review cards drawn solid, so the ones fanned out behind never show through the front one. On
 * see-through styles (Gradient, Bold, Glow) they're white or near-black paper instead of glass.
 */
function reviewPaper(style: PromoStyleId, p: Palette) {
  if (style === 'gradient' || style === 'bold') return { bg: '#ffffff', fg: '#09090b', muted: '#52525b', border: 'rgba(0,0,0,0.06)', empty: '#e4e4e7' };
  if (style === 'glow') return { bg: '#16161a', fg: '#fafafa', muted: '#a1a1aa', border: 'rgba(255,255,255,0.12)', empty: '#3f3f46' };
  return { bg: p.surface, fg: p.fg, muted: p.muted, border: p.border, empty: p.border };
}

type Quote = PromoData['quotes'][number];

function Reviews({ data, images, o, p }: Props) {
  const { format } = o;
  const landscape = format === '16x9';
  const tall = format === '9x16';
  const square = format === '1x1';
  const hasRating = o.showRating && data.rating != null && data.ratingCount > 0;
  const headline = headlineOf(data, o);
  const { width: W, height: H } = PROMO_SIZES[format];
  const pad = landscape ? 96 : tall ? 88 : 72;
  const leftW = 780; // 16:9: headline and rating on the left, the reviews on the right
  const colW = landscape ? W - pad * 2 - leftW : W - pad * 2;
  const footerH = square ? 64 : tall ? 96 : 80;
  const gap = square ? 30 : tall ? 56 : 44;
  const paper = reviewPaper(o.style, p);

  // The reviews picked for this card, the first in front (else the best short ones).
  const candidates = o.quotes?.length ? o.quotes.map((i) => data.quotes[i]).filter((q) => !!q) : data.quotes;
  const quotes = candidates.slice(0, o.reviewCount === 1 ? 1 : 3);
  const fanned = quotes.length > 1;

  const headSize = square ? 84 : tall ? 132 : 100;
  const numSize = landscape ? 130 : square ? 76 : tall ? 140 : 110;
  const ratingH = hasRating ? numSize : 0;
  // Height the cards get: everything else on the card comes first.
  const stackH = landscape
    ? H - pad * 2
    : H - pad * 2 - footerH - 32 - headlineHeight(headline, headSize, colW, 2) - gap - (ratingH ? ratingH + gap : 0) - gap;

  // Front card, and the two behind it: narrower, raised so their stars show above it, and turned.
  const frontW = Math.round(fanned ? colW * 0.8 : landscape ? colW : colW * (tall ? 1 : 0.92));
  const backW = Math.round(colW * 0.64);
  const fs = (q: Quote, base: number) => (q.body.length > 140 ? base * 0.86 : base);
  const base = square ? (fanned ? 32 : 38) : tall ? (fanned ? 44 : 50) : landscape ? (fanned ? 42 : 48) : fanned ? 36 : 42;
  const cardPad = Math.round(base * 1.1);
  const lift = fanned ? Math.round(base * 3.2) : 0; // how far the back cards rise above the front one
  const tilt = Math.round(backW * 0.06); // room for a turned card's corners
  const chrome = (size: number) => cardPad * 2 + size * 0.9 + size * 0.55 + size * 0.55 + size * 0.75 * 1.25;
  const front = quotes[0];
  const frontFs = front ? fs(front, base) : base;
  const frontMax = Math.max(2, Math.floor((stackH - lift - tilt - chrome(frontFs)) / (frontFs * 1.4)));
  const frontLines = front ? textLines(`“${front.body}”`, frontFs, frontW - cardPad * 2, frontMax) : 0;
  const frontH = Math.round(chrome(frontFs) + frontLines * frontFs * 1.4);
  const backH = Math.round(frontH * 0.88);

  // The shadow is two see-through layers under the card, not a box-shadow: satori draws those as a
  // blur filter, and blurring three big cards took resvg over five seconds.
  const card = (q: Quote, width: number, size: number, lines: number, height?: number) => (
    <div style={{ display: 'flex', flexShrink: 0, padding: '2px 8px 18px', margin: '-2px -8px -18px', borderRadius: size * 0.9 + 8, background: 'rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', flexShrink: 0, padding: '1px 4px 9px', borderRadius: size * 0.9 + 4, background: 'rgba(0,0,0,0.07)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, width, ...(height ? { height } : {}), overflow: 'hidden', gap: size * 0.55, padding: cardPad, borderRadius: size * 0.9, background: paper.bg, border: `2px solid ${paper.border}`, color: paper.fg }}>
          <StarRow rating={q.rating} size={size * 0.9} gap={4} empty={paper.empty} />
          <div style={{ display: 'block', fontSize: size, lineHeight: 1.4, lineClamp: lines }}>{`“${q.body}”`}</div>
          <div style={{ display: 'flex', fontSize: size * 0.75, color: paper.muted }}>{q.reviewer}</div>
        </div>
      </div>
    </div>
  );
  const backCard = (q: Quote) => {
    const size = fs(q, base) * 0.92;
    return card(q, backW, size, Math.max(1, Math.floor((backH - chrome(size)) / (size * 1.4))), backH);
  };
  // satori has no z-index: the back cards first, the front one painted last.
  const stack = front ? (
    <div style={{ display: 'flex', position: 'relative', flexShrink: 0, alignSelf: 'center', width: colW, height: lift + frontH, marginTop: fanned ? tilt : 0 }}>
      {quotes[1] && (
        <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, transform: 'rotate(-6deg)' }}>{backCard(quotes[1])}</div>
      )}
      {quotes[2] && (
        <div style={{ display: 'flex', position: 'absolute', left: colW - backW, top: 0, transform: 'rotate(6deg)' }}>{backCard(quotes[2])}</div>
      )}
      <div style={{ display: 'flex', position: 'absolute', left: Math.round((colW - frontW) / 2), top: lift }}>{card(front, frontW, frontFs, frontLines)}</div>
    </div>
  ) : (
    // No short 5★ written reviews yet: the numbers instead.
    <StatChips data={data} p={p} o={o} size={30} />
  );

  const rating = hasRating && (
    <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: numSize * 0.2 }}>
      <div style={{ display: 'flex', fontSize: numSize, fontWeight: 800, letterSpacing: -numSize * 0.04, lineHeight: 1 }}>{data.rating!.toFixed(1)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <StarRow rating={data.rating!} size={numSize * 0.38} empty={p.border} />
        <div style={{ display: 'flex', fontSize: Math.max(22, numSize * 0.22), color: p.muted }}>
          {fmtCompact(data.ratingCount)} rating{data.ratingCount === 1 ? '' : 's'} on the App Store
        </div>
      </div>
    </div>
  );
  const footer = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
      <AppLine data={data} icon={images.icon} p={p} size={square ? 64 : tall ? 96 : 80} />
      {o.showBadge && <Badge p={p} cta={o.cta} scale={square ? 0.8 : tall ? 1.05 : 0.9} />}
    </div>
  );
  if (landscape) {
    return (
      <Canvas format={format} p={p} pad={pad} row>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: leftW, paddingRight: 60 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
            <Headline text={headline} size={headSize} p={p} lines={3} />
            {rating}
          </div>
          {footer}
        </div>
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center' }}>{stack}</div>
      </Canvas>
    );
  }
  return (
    <Canvas format={format} p={p} pad={pad}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap }}>
        <Headline text={headline} size={headSize} p={p} lines={2} />
        {rating}
        {stack}
      </div>
      {footer}
    </Canvas>
  );
}

function Download({ data, images, o, p }: Props) {
  const { format } = o;
  const landscape = format === '16x9';
  const tall = format === '9x16';
  const square = format === '1x1';
  const headline = headlineOf(data, o);
  const url = data.listing?.storeUrl?.replace(/^https?:\/\//, '').replace(/\/[a-z]{2}\/app\/[^/]+\//, '/app/') ?? null;
  const iconSize = square ? 220 : landscape ? 240 : tall ? 360 : 300;
  return (
    <Canvas format={format} p={p} pad={tall ? 96 : 80}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center', justifyContent: 'center', gap: square || landscape ? 30 : 44 }}>
        <AppIcon src={images.icon} size={iconSize} p={p} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, maxWidth: landscape ? 1400 : 920 }}>
          <Headline text={headline} size={square ? 90 : landscape ? 100 : tall ? 124 : 110} p={p} align="center" lines={2} />
          <Tagline text={tagline(data, o)} size={square ? 28 : 34} p={p} align="center" lines={2} />
        </div>
        <StatChips data={data} p={p} o={o} size={square ? 24 : 28} center />
        {o.showBadge && <Badge p={p} cta={o.cta} scale={square ? 1 : 1.2} />}
      </div>
      {url && <div style={{ display: 'flex', justifyContent: 'center', fontSize: square ? 22 : 26, color: p.muted }}>{url}</div>}
    </Canvas>
  );
}

/** App icon and name on the left, the App Store button on the right. */
function Footer({ data, icon, o, p, size }: { data: PromoData; icon: string | null; o: PromoOptions; p: Palette; size: number }) {
  return (
    <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
      <AppLine data={data} icon={icon} p={p} size={size} />
      {o.showBadge && <Badge p={p} cta={o.cta} scale={size / 88} />}
    </div>
  );
}

function Feature({ data, images, o, p }: Props) {
  const { format } = o;
  const landscape = format === '16x9';
  const tall = format === '9x16';
  const square = format === '1x1';
  const { width: W, height: H } = PROMO_SIZES[format];
  const pad = landscape ? 96 : tall ? 88 : 72;
  const headline = headlineOf(data, o);
  const sub = tagline(data, o);
  const shot = images.screenshots[0];
  const footerSize = square ? 64 : tall ? 88 : 80;
  // The phone stands beside the text, or under it on 9:16 (where it runs off the bottom).
  const phoneW = shot ? (landscape ? 430 : tall ? 560 : square ? 290 : 350) : 0;
  const colW = landscape ? 1040 : tall || !shot ? W - pad * 2 : W - pad * 2 - phoneW - (square ? 44 : 56);
  const headSize = square ? 70 : landscape ? 96 : tall ? 120 : 84;
  const subSize = square ? 26 : tall ? 36 : 30;
  const fs = square ? 26 : tall ? 38 : landscape ? 34 : 30;
  const gap = square ? 22 : tall ? 36 : 30;
  const itemGap = square ? 14 : 22;
  const all = noteBullets(o.notes ?? featureList(data.listing?.description ?? '').join('\n'), 6);
  // As many features as fit under the headline and tagline.
  const textH = (tall ? H * 0.5 : H - pad * 2 - footerSize - 40) - (tall ? footerSize + gap : 0);
  const budget = textH - headlineHeight(headline, headSize, colW, 3) - gap - (sub ? textLines(sub, subSize, colW, 3) * subSize * 1.35 + gap : 0);
  const items = fitting(all, (f) => textLines(f, fs, colW - fs * 1.25 - 22, 2) * fs * 1.35, itemGap, budget);
  const text = (
    <div style={{ display: 'flex', flexDirection: 'column', width: colW, gap }}>
      <Headline text={headline} size={headSize} p={p} lines={3} />
      <Tagline text={sub} size={subSize} p={p} lines={3} />
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: itemGap }}>
          {items.map((f, i) => <CheckItem key={i} text={f} size={fs} p={p} />)}
        </div>
      )}
    </div>
  );
  const phone = shot ? <Phone shot={shot} width={phoneW} p={p} /> : <AppIcon src={images.icon} size={landscape ? 380 : 300} p={p} />;
  if (tall) {
    return (
      <Canvas format={format} p={p} pad={pad}>
        <Footer data={data} icon={images.icon} o={o} p={p} size={footerSize} />
        <div style={{ display: 'flex', marginTop: gap * 1.6 }}>{text}</div>
        <div style={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: shot ? 'flex-start' : 'center', marginTop: 64, marginBottom: shot ? -pad - 600 : 0 }}>{phone}</div>
      </Canvas>
    );
  }
  return (
    <Canvas format={format} p={p} pad={pad}>
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'space-between', gap: 56 }}>
        {text}
        {(shot || landscape) && <div style={{ display: 'flex', flex: 1, justifyContent: 'center' }}>{phone}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', paddingTop: 40, ...(landscape ? { width: colW } : {}) }}>
        <Footer data={data} icon={images.icon} o={o} p={p} size={footerSize} />
      </div>
    </Canvas>
  );
}

/** An App Store product page, as it looks on an iPhone: icon, name, Get button, the numbers, screenshots. */
function Store({ data, images, o, p }: Props) {
  const { format } = o;
  const landscape = format === '16x9';
  const tall = format === '9x16';
  const square = format === '1x1';
  const { width: W } = PROMO_SIZES[format];
  const pad = landscape ? 96 : tall ? 88 : 72;
  const headline = headlineOf(data, o);
  const paper = reviewPaper(o.style, p);
  const leftW = 640; // 16:9: headline on the left, the page on the right
  const sheetW = landscape ? W - pad * 2 - leftW : W - pad * 2;
  const sp = square ? 36 : 44;          // the page's padding
  const u = square ? 0.86 : tall ? 1.1 : 1; // type and icon scale
  const iconSize = Math.round(150 * u);
  const sub = tagline(data, o) || data.listing?.genre || '';
  const paid = data.listing?.price && data.listing.price !== 'Free' ? data.listing.price : null;
  const get = o.cta || paid || 'Get';
  const dl = downloadsLabel(data.downloads);
  const hasRating = o.showRating && data.rating != null && data.ratingCount > 0;
  // The info strip under the title, as on the App Store.
  const facts: { top: string; value: React.ReactNode; bottom: React.ReactNode }[] = [];
  if (hasRating) facts.push({ top: `${fmtCompact(data.ratingCount)} RATINGS`, value: data.rating!.toFixed(1), bottom: <StarRow rating={data.rating!} size={Math.round(22 * u)} gap={3} empty={paper.empty} /> });
  if (dl) facts.push({ top: 'DOWNLOADS', value: dl, bottom: 'worldwide' });
  if (data.countries > 1) facts.push({ top: 'COUNTRIES', value: String(data.countries), bottom: `of ${data.storefronts}` });
  if (data.listing?.genre && facts.length < (square ? 3 : 4)) facts.push({ top: 'CATEGORY', value: <Icon name="bag" size={Math.round(40 * u)} color={paper.muted} />, bottom: data.listing.genre });
  const shown = facts.slice(0, square ? 3 : 4);
  const count = tall ? 2 : 3;
  const shots = images.screenshots.slice(0, count);
  const shotGap = Math.round(20 * u);
  const shotW = Math.floor((sheetW - sp * 2 - shotGap * (count - 1)) / count);
  const sheet = (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, width: sheetW, padding: sp, gap: Math.round(34 * u), borderRadius: `${48 * u}px ${48 * u}px 0 0`, background: paper.bg, border: `2px solid ${paper.border}`, color: paper.fg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(30 * u) }}>
        <AppIcon src={images.icon} size={iconSize} p={p} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: 6 * u }}>
          <div style={{ display: 'block', fontSize: 44 * u, fontWeight: 800, letterSpacing: -1, lineHeight: 1.1, lineClamp: 1 }}>{data.name}</div>
          {sub && <div style={{ display: 'block', fontSize: 26 * u, lineHeight: 1.3, color: paper.muted, lineClamp: 2 }}>{sub}</div>}
          <div style={{ display: 'flex', marginTop: 10 * u }}>
            <div style={{ display: 'flex', alignItems: 'center', height: 54 * u, padding: `0 ${34 * u}px`, borderRadius: 999, background: o.accent, color: luminance(o.accent) > 0.45 ? '#0a0a0a' : '#ffffff', fontSize: 26 * u, fontWeight: 800, letterSpacing: 0.5 }}>
              {get.toUpperCase()}
            </div>
          </div>
        </div>
      </div>
      {shown.length > 0 && (
        <div style={{ display: 'flex', paddingTop: 26 * u, paddingBottom: 26 * u, borderTop: `2px solid ${paper.border}`, borderBottom: `2px solid ${paper.border}` }}>
          {shown.map((f, i) => (
            <div key={i} style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', gap: 8 * u, borderLeft: i ? `2px solid ${paper.border}` : 'none' }}>
              <div style={{ display: 'flex', fontSize: 17 * u, fontWeight: 600, letterSpacing: 1.2, color: paper.muted }}>{f.top}</div>
              <div style={{ display: 'flex', alignItems: 'center', height: 48 * u, fontSize: 42 * u, fontWeight: 800, letterSpacing: -1, color: paper.muted }}>{f.value}</div>
              <div style={{ display: 'flex', fontSize: 20 * u, color: paper.muted }}>{f.bottom}</div>
            </div>
          ))}
        </div>
      )}
      {shots.length > 0 ? (
        <div style={{ display: 'flex', gap: shotGap }}>
          {shots.map((s, i) => (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img key={i} src={s.src} width={shotW} height={Math.round(shotW * s.ratio)} style={{ borderRadius: shotW * 0.09, border: `2px solid ${paper.border}` }} />
          ))}
        </div>
      ) : (
        <Tagline text={data.listing?.description.split('\n')[0] ?? ''} size={26 * u} p={{ ...p, muted: paper.muted }} lines={6} />
      )}
    </div>
  );
  if (landscape) {
    return (
      <Canvas format={format} p={p} pad={pad} row>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: leftW, paddingRight: 60, gap: 40 }}>
          <Headline text={headline} size={100} p={p} lines={3} />
          {o.showBadge && <div style={{ display: 'flex' }}><Badge p={p} cta={o.cta} /></div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: -pad - 600 }}>{sheet}</div>
      </Canvas>
    );
  }
  return (
    <Canvas format={format} p={p} pad={pad}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, paddingBottom: square ? 36 : tall ? 64 : 48 }}>
        <Headline text={headline} size={square ? 76 : tall ? 124 : 96} p={p} align="center" lines={2} />
        {tall && o.showBadge && <Badge p={p} cta={o.cta} scale={1.05} />}
      </div>
      <div style={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'flex-start', marginBottom: -pad - 600 }}>{sheet}</div>
    </Canvas>
  );
}

/** A laurel wreath: two branches of leaves curving up from the bottom, open at the top. */
function Laurel({ size, color }: { size: number; color: string }) {
  const c = 100;
  const R = 82;
  const rad = (d: number) => (d * Math.PI) / 180;
  const leaves: { x: number; y: number; angle: number; len: number }[] = [];
  // The left branch, from the bottom (105°) round to the top left (250°); the right one mirrors it.
  const N = 11;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const a = rad(105 + t * 140);
    const x = c + R * Math.cos(a);
    const y = c + R * Math.sin(a);
    const tangent = [-Math.sin(a), Math.cos(a)];
    const normal = [Math.cos(a), Math.sin(a)];
    const len = 26 - t * 9;
    for (const side of [1, -1]) {
      const dx = tangent[0] + side * 0.75 * normal[0];
      const dy = tangent[1] + side * 0.75 * normal[1];
      leaves.push({ x, y, angle: (Math.atan2(dx, -dy) * 180) / Math.PI, len: side < 0 ? len * 0.85 : len });
    }
  }
  const leaf = (len: number) => {
    const w = len * 0.36;
    return `M0,0 C${w},${-len * 0.3} ${w},${-len * 0.75} 0,${-len} C${-w},${-len * 0.75} ${-w},${-len * 0.3} 0,0 Z`;
  };
  const start = [c + R * Math.cos(rad(100)), c + R * Math.sin(rad(100))];
  const end = [c + R * Math.cos(rad(250)), c + R * Math.sin(rad(250))];
  const branch = (mirror: boolean) => (
    <g transform={mirror ? `translate(${c * 2} 0) scale(-1 1)` : undefined}>
      <path d={`M${start[0]},${start[1]} A${R},${R} 0 0 1 ${end[0]},${end[1]}`} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      {leaves.map((l, i) => <path key={i} d={leaf(l.len)} fill={color} transform={`translate(${l.x} ${l.y}) rotate(${l.angle})`} />)}
    </g>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 200 200">
      {branch(false)}
      {branch(true)}
    </svg>
  );
}

function Rated({ data, images, o, p }: Props) {
  const { format } = o;
  const landscape = format === '16x9';
  const tall = format === '9x16';
  const square = format === '1x1';
  const pad = landscape ? 96 : tall ? 88 : 72;
  const headline = headlineOf(data, o);
  const sub = tagline(data, o);
  const hasRating = data.rating != null && data.ratingCount > 0;
  const dl = downloadsLabel(data.downloads);
  const wreath = landscape ? 760 : square ? 520 : tall ? 820 : 640;
  const num = wreath * 0.27;
  const middle = hasRating ? (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: wreath * 0.02 }}>
      <div style={{ display: 'flex', fontSize: num, fontWeight: 800, letterSpacing: -num * 0.04, lineHeight: 1 }}>{data.rating!.toFixed(1)}</div>
      <StarRow rating={data.rating!} size={Math.round(wreath * 0.065)} gap={Math.round(wreath * 0.01)} empty={p.border} />
      <div style={{ display: 'flex', fontSize: wreath * 0.04, color: p.muted, marginTop: wreath * 0.01 }}>
        {fmtCompact(data.ratingCount)} rating{data.ratingCount === 1 ? '' : 's'}
      </div>
    </div>
  ) : dl ? (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: wreath * 0.02 }}>
      <div style={{ display: 'flex', fontSize: num * 0.9, fontWeight: 800, letterSpacing: -num * 0.04, lineHeight: 1 }}>{dl}</div>
      <div style={{ display: 'flex', fontSize: wreath * 0.045, color: p.muted }}>downloads</div>
    </div>
  ) : (
    <AppIcon src={images.icon} size={wreath * 0.4} p={p} />
  );
  const badge = (
    <div style={{ display: 'flex', position: 'relative', flexShrink: 0, width: wreath, height: wreath }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0 }}>
        <Laurel size={wreath} color={p.accent} />
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: wreath, height: wreath, alignItems: 'center', justifyContent: 'center' }}>
        {middle}
      </div>
    </div>
  );
  const footerSize = square ? 64 : tall ? 96 : 80;
  if (landscape) {
    return (
      <Canvas format={format} p={p} pad={pad} row>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 820 }}>{badge}</div>
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'space-between', paddingLeft: 40 }}>
          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 32 }}>
            <Headline text={headline} size={104} p={p} lines={3} />
            <Tagline text={sub} size={34} p={p} lines={3} />
          </div>
          <Footer data={data} icon={images.icon} o={o} p={p} size={footerSize} />
        </div>
      </Canvas>
    );
  }
  return (
    <Canvas format={format} p={p} pad={pad}>
      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: square ? 16 : tall ? 40 : 28 }}>
        {badge}
        <Headline text={headline} size={square ? 72 : tall ? 120 : 92} p={p} align="center" lines={2} />
        <Tagline text={sub} size={square ? 26 : tall ? 38 : 32} p={p} align="center" lines={2} />
      </div>
      <Footer data={data} icon={images.icon} o={o} p={p} size={footerSize} />
    </Canvas>
  );
}

// Confetti for the Milestone card, the same on every render: a few festive colours, scattered
// around the edges so the number in the middle stays clear.
const CONFETTI_COLORS = ['#f59e0b', '#ec4899', '#22c55e', '#3b82f6', '#a855f7', '#ef4444'];

function confetti(width: number, height: number, accent: string, footer: number) {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pieces: { x: number; y: number; w: number; h: number; r: number; color: string; round: boolean }[] = [];
  const colors = [accent, ...CONFETTI_COLORS];
  for (let tries = 0; pieces.length < 46 && tries < 400; tries++) {
    const x = rand() * width;
    const y = rand() * height;
    // Keep clear of the middle (an ellipse around the number and headline).
    const dx = (x - width / 2) / (width * 0.42);
    const dy = (y - height * 0.46) / (height * 0.36);
    // ...and of the footer.
    if (dx * dx + dy * dy < 1 || y > height - footer) continue;
    const round = rand() < 0.35;
    const s = 12 + rand() * 18;
    pieces.push({ x, y, w: round ? s : s * 0.55, h: round ? s : s * 1.6, r: rand() * 180, color: colors[Math.floor(rand() * colors.length)], round });
  }
  return pieces;
}

function Milestone({ data, images, o, p }: Props) {
  const { format } = o;
  const landscape = format === '16x9';
  const tall = format === '9x16';
  const square = format === '1x1';
  const { width: W, height: H } = PROMO_SIZES[format];
  const pad = landscape ? 96 : tall ? 88 : 72;
  const headline = headlineOf(data, o);
  const sub = tagline(data, o);
  const dl = downloadsLabel(data.downloads);
  const figure = dl ? { value: dl, label: 'DOWNLOADS' } : data.countries > 1 ? { value: String(data.countries), label: 'COUNTRIES' } : null;
  const numSize = square ? 250 : landscape ? 290 : tall ? 360 : 300;
  const footerSize = square ? 64 : tall ? 96 : 80;
  return (
    <Canvas format={format} p={p} pad={pad}>
      {confetti(W, H, p.accent, pad + footerSize + 40).map((c, i) => (
        <div key={i} style={{ display: 'flex', position: 'absolute', left: c.x, top: c.y, width: c.w, height: c.h, borderRadius: c.round ? 999 : 3, background: c.color, transform: `rotate(${c.r}deg)`, opacity: 0.9 }} />
      ))}
      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: square ? 20 : 30 }}>
        <Eyebrow p={p} size={square ? 22 : tall ? 30 : 24} center>MILESTONE</Eyebrow>
        {figure ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', fontSize: numSize, fontWeight: 800, letterSpacing: -numSize * 0.05, lineHeight: 1, color: p.fg }}>{figure.value}</div>
            <div style={{ display: 'flex', fontSize: numSize * 0.13, fontWeight: 600, letterSpacing: numSize * 0.03, color: p.muted }}>{figure.label}</div>
          </div>
        ) : (
          <AppIcon src={images.icon} size={numSize * 0.9} p={p} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: landscape ? 1300 : 920, marginTop: square ? 0 : 16 }}>
          <Headline text={headline} size={square ? 80 : tall ? 120 : 100} p={p} align="center" lines={2} />
          <Tagline text={sub} size={square ? 28 : tall ? 38 : 32} p={p} align="center" lines={2} />
        </div>
      </div>
      <Footer data={data} icon={images.icon} o={o} p={p} size={footerSize} />
    </Canvas>
  );
}

const TEMPLATES: Record<PromoTemplateId, (props: Props) => React.ReactElement> = {
  launch: Launch,
  update: Update,
  screens: Screens,
  loved: Loved,
  reviews: Reviews,
  download: Download,
  feature: Feature,
  store: Store,
  rated: Rated,
  milestone: Milestone,
};

export function PromoCard({ data, images, o }: { data: PromoData; images: PromoImages; o: PromoOptions }) {
  const T = TEMPLATES[o.template];
  return <T data={data} images={images} o={o} p={palette(o.style, o.accent, o.frameColor)} />;
}
