import type { App, AppProfile, Background, DeviceId, Palette, Slide, StyleOverride, Theme } from './types';
import { DEVICES } from './devices';
import { newCreative } from './creatives';

const bg = (b: Partial<Background>): Background => ({
  type: 'solid',
  color: '#000000',
  color2: '#000000',
  color3: b.color2 ?? '#000000',
  seed: 1,
  angle: 180,
  imageAssetId: null,
  overlay: 0.35,
  ...b,
});

const palette = (p: Partial<Palette> & { background: Background }): Palette => ({
  textColor: '#ffffff',
  accentColor: '#ffffff',
  subtitleColor: 'rgba(255,255,255,0.75)',
  ...p,
});

type ThemeExtra = Omit<Partial<Theme>, 'frame'> & { frame?: Partial<Theme['frame']> };
const baseTheme = (palettes: Theme['palettes'], extra: ThemeExtra = {}): Theme => ({
  layout: 'top',
  palettes,
  alternate: false,
  shotScale: 1,
  shotOffsetY: 0,
  textOffsetY: 0,
  panorama: false,
  texture: { kind: 'none', opacity: 0.14, size: 28 },
  vignette: 0,
  glow: { strength: 0, color: '', size: 1.2 },
  decor: { kind: 'none', density: 1, scale: 1, opacity: 0.5, color: '', seed: 1 },
  annotation: { kind: 'none', color: '', width: 6, roughness: 1.4, padding: 14, recolor: true, marker: { opacity: 0.4, height: 0.55, lift: 0, radius: 0, tilt: 0 } },
  stickerShadow: 0.25,
  fontFamily: 'Outfit Variable',
  headlineWeight: 500,
  headlineSize: 88,
  subtitleSize: 38,
  letterSpacing: -0.01,
  lineHeight: 1.08,
  align: 'center',
  ...extra,
  frame: { kind: 'outline', deviceColor: '#1c1c1e', strokeColor: '#ffffff', strokeWidth: 7, radius: 9, shadow: 0.35, ...extra.frame },
  callout: { scale: 1.12, shadow: 0.35, radius: 28 },
  hero: { badge: 'none', badgeTitle: '', badgeCaption: '', lockup: true, tilt: -6, locales: {} },
});

export interface Preset {
  id: string;
  label: string;
  theme: Theme;
}

/**
 * Clean, flat themes built from the shadcn/ui palette (Tailwind color scales): solid color, white or
 * near-black, Geist type set tight, one highlight tone, and a hairline stroke around the screenshot.
 */
function shadcnColor(c: {
  600: string;
  200: string;
  50: string;
  950: string;
  label: string;
  id: string;
  onColor?: string;
}): Preset {
  const on = c.onColor ?? '#ffffff';
  return {
    id: c.id,
    label: c.label,
    theme: baseTheme(
      {
        primary: palette({
          background: bg({ type: 'solid', color: c[600], color2: c[600] }),
          textColor: on,
          accentColor: c.onColor ? c[950] : c[200],
          subtitleColor: c.onColor ? c[950] + 'b3' : 'rgba(255,255,255,0.72)',
        }),
        alt: palette({
          background: bg({ type: 'solid', color: c[50], color2: c[50] }),
          textColor: c[950],
          accentColor: c.onColor ? '#a16207' : c[600],
          subtitleColor: c[950] + 'a6',
        }),
      },
      shadcnType({ frame: { strokeColor: c[200], strokeWidth: 5, radius: 9, shadow: 0.16 } }),
    ),
  };
}

const shadcnType = (extra: ThemeExtra = {}): ThemeExtra => ({
  fontFamily: 'Geist Variable',
  headlineWeight: 600,
  headlineSize: 86,
  subtitleSize: 36,
  letterSpacing: -0.035,
  lineHeight: 1.06,
  align: 'center',
  ...extra,
});

export const PRESETS: Preset[] = [
  {
    id: 'neutral',
    label: 'Neutral',
    theme: baseTheme(
      {
        primary: palette({
          background: bg({ type: 'solid', color: '#0a0a0a', color2: '#0a0a0a' }),
          textColor: '#fafafa',
          accentColor: '#a3a3a3',
          subtitleColor: 'rgba(250,250,250,0.6)',
        }),
        alt: palette({
          background: bg({ type: 'solid', color: '#fafafa', color2: '#fafafa' }),
          textColor: '#0a0a0a',
          accentColor: '#737373',
          subtitleColor: '#737373',
        }),
      },
      shadcnType({ frame: { strokeColor: '#d4d4d4', strokeWidth: 4, radius: 9, shadow: 0.18 } }),
    ),
  },
  {
    id: 'zinc',
    label: 'Zinc',
    theme: baseTheme(
      {
        primary: palette({
          background: bg({ type: 'solid', color: '#18181b', color2: '#18181b' }),
          textColor: '#fafafa',
          accentColor: '#a1a1aa',
          subtitleColor: 'rgba(250,250,250,0.6)',
        }),
        alt: palette({
          background: bg({ type: 'solid', color: '#f4f4f5', color2: '#f4f4f5' }),
          textColor: '#09090b',
          accentColor: '#71717a',
          subtitleColor: '#71717a',
        }),
      },
      shadcnType({ frame: { strokeColor: '#3f3f46', strokeWidth: 4, radius: 9, shadow: 0.2 } }),
    ),
  },
  shadcnColor({ id: 'blue', label: 'Blue', 600: '#2563eb', 200: '#bfdbfe', 50: '#eff6ff', 950: '#172554' }),
  shadcnColor({ id: 'green', label: 'Green', 600: '#16a34a', 200: '#bbf7d0', 50: '#f0fdf4', 950: '#052e16' }),
  shadcnColor({ id: 'rose', label: 'Rose', 600: '#e11d48', 200: '#fecdd3', 50: '#fff1f2', 950: '#4c0519' }),
  shadcnColor({ id: 'orange', label: 'Orange', 600: '#ea580c', 200: '#fed7aa', 50: '#fff7ed', 950: '#431407' }),
  shadcnColor({ id: 'violet', label: 'Violet', 600: '#7c3aed', 200: '#ddd6fe', 50: '#f5f3ff', 950: '#2e1065' }),
  shadcnColor({ id: 'yellow', label: 'Yellow', 600: '#facc15', 200: '#fef08a', 50: '#fefce8', 950: '#422006', onColor: '#422006' }),
  {
    // The deep-green-and-cream look from the fitness reference.
    id: 'forest',
    label: 'Forest',
    theme: baseTheme(
      {
        primary: palette({
          background: bg({ type: 'radial', color: '#2E6B55', color2: '#173D30' }),
          textColor: '#F4F1E4',
          accentColor: '#F2DE8C',
          subtitleColor: 'rgba(244,241,228,0.72)',
        }),
        alt: palette({
          background: bg({ type: 'linear', color: '#F6F3E6', color2: '#F2EBC8', angle: 160 }),
          textColor: '#1C4A3A',
          accentColor: '#2F7A5C',
          subtitleColor: 'rgba(28,74,58,0.7)',
        }),
      },
      { alternate: true, frame: { strokeColor: '#1C4A3A', strokeWidth: 7, radius: 9, shadow: 0.3 } },
    ),
  },
];

export const FONTS = [
  'Geist Variable',
  'Inter Variable',
  'Outfit Variable',
  'Plus Jakarta Sans Variable',
  'DM Sans Variable',
  'Manrope Variable',
  'Sora Variable',
  'Urbanist Variable',
  'Space Grotesk Variable',
  'Fraunces Variable',
  'Poppins',
  'Figtree Variable',
  'Onest Variable',
  'Lexend Variable',
  'Rubik Variable',
  'Nunito Variable',
  'Fredoka Variable',
  'Bricolage Grotesque Variable',
  'Unbounded Variable',
  'Playfair Display Variable',
  'DM Serif Display',
  'Instrument Serif',
  'Bebas Neue',
  'Caveat Variable',
  '-apple-system',
];

export function presetTheme(id: string): Theme {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
  return { ...structuredClone(p.theme), presetId: p.id };
}

/**
 * Switch an app to a theme preset. A theme sets colors and type; the user's layout, alignment,
 * screenshot size/position, frame kind, callout and hero settings and background photos stay as they were.
 */
export function applyPreset(current: Theme, id: string): Theme {
  const t = presetTheme(id);
  t.layout = current.layout;
  t.align = current.align;
  t.shotScale = current.shotScale;
  t.shotOffsetY = current.shotOffsetY;
  t.textOffsetY = current.textOffsetY;
  // Background effects are layout choices too; a theme only swaps the colors under them.
  t.panorama = current.panorama;
  t.texture = { ...current.texture };
  t.vignette = current.vignette;
  t.glow = { ...current.glow };
  t.decor = { ...current.decor };
  t.annotation = { ...current.annotation, marker: { ...current.annotation.marker } };
  t.stickerShadow = current.stickerShadow;
  // Frame kind, callouts and the hero design aren't part of a theme's colors and type.
  t.frame.kind = current.frame.kind;
  t.frame.deviceColor = current.frame.deviceColor;
  t.callout = { ...current.callout };
  t.hero = { ...current.hero };
  for (const k of ['primary', 'alt'] as const) {
    const img = current.palettes[k]?.background.imageAssetId;
    if (img) t.palettes[k].background.imageAssetId = img;
  }
  return t;
}

export function newSlide(id: string, partial: Partial<Slide> = {}): Slide {
  return {
    id,
    headline: 'Say what this *screen* does',
    subtitle: '',
    shots: {},
    screen: { name: '', notes: '' },
    role: 'standard',
    callouts: {},
    stickers: [],
    locales: {},
    ...partial,
  };
}

export function newProfile(): AppProfile {
  return {
    bundleId: '',
    projectPath: '',
    appStoreUrl: '',
    category: '',
    description: '',
    audience: '',
    keywords: [],
    brandColors: [],
    screens: '',
    notes: '',
  };
}

export function newApp(id: string, partial: Partial<App> & { preset?: string } = {}): App {
  const { preset, ...rest } = partial;
  const now = new Date().toISOString();
  const ids = Object.keys(DEVICES) as DeviceId[];
  return {
    id,
    name: 'Untitled app',
    subtitle: '',
    iconAssetId: null,
    devices: ['iphone'],
    sizes: Object.fromEntries(ids.map((d) => [d, DEVICES[d].defaultSize])) as Record<DeviceId, string>,
    exportSizes: Object.fromEntries(ids.map((d) => [d, [...DEVICES[d].defaultExport]])) as Record<DeviceId, string[]>,
    profile: newProfile(),
    theme: presetTheme(preset ?? 'neutral'),
    slides: [],
    creatives: { header: newCreative('header'), search: newCreative('search') },
    primarySetName: 'Primary',
    sets: [],
    baseLanguage: 'en-US',
    languages: [],
    assets: {},
    createdAt: now,
    updatedAt: now,
    ...rest,
  };
}

/** Recursively merge plain objects; arrays and primitives replace. `null` clears a key. */
export function deepMerge<T>(target: T, patch: unknown): T {
  if (patch === undefined) return target;
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch as T;
  const out: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const cur = out[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
      out[k] = deepMerge(cur, v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

/** Merge an override onto a base, skipping null/undefined (an unset override key means "use the base"). */
function mergeSet<T>(base: T, over: unknown): T {
  if (over === null || over === undefined) return base;
  if (typeof over !== 'object' || Array.isArray(over)) return over as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    const cur = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' ? mergeSet(cur, v) : v;
  }
  return out as T;
}

/** The theme one slide is drawn with: the app's theme plus anything the slide overrides. */
export function slideTheme(app: App, slide: Pick<Slide, 'style'>): Theme {
  return slide.style ? mergeSet(app.theme, slide.style) : app.theme;
}

/** Drop null leaves and empty objects from an override, so "reset" really removes the key. */
export function pruneOverride(o: unknown): StyleOverride | null {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const inner = pruneOverride(v);
      if (inner) out[k] = inner;
    } else out[k] = v;
  }
  return Object.keys(out).length ? (out as StyleOverride) : null;
}

/** Colors for the slide at `index` (0-based): the primary palette, or every other slide alternate. */
export function paletteFor(theme: Theme, index: number): Palette {
  return theme.alternate && index % 2 === 1 ? theme.palettes.alt : theme.palettes.primary;
}

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/\\n|\n/g, ' ')
      .replace(/\*/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'slide'
  );
}
