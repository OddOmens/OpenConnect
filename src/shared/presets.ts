import type { App, AppProfile, Background, DeviceId, Palette, Slide, Theme } from './types';
import { DEVICES } from './devices';

const bg = (b: Partial<Background>): Background => ({
  type: 'solid',
  color: '#000000',
  color2: '#000000',
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

const baseTheme = (palettes: Theme['palettes'], extra: Partial<Theme> = {}): Theme => ({
  layout: 'top',
  palettes,
  alternate: false,
  shotScale: 1,
  shotOffsetY: 0,
  fontFamily: 'Outfit Variable',
  headlineWeight: 500,
  headlineSize: 88,
  subtitleSize: 38,
  letterSpacing: -0.01,
  lineHeight: 1.08,
  align: 'center',
  frame: { strokeColor: '#ffffff', strokeWidth: 7, radius: 9, shadow: 0.35 },
  ...extra,
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

const shadcnType = (extra: Partial<Theme> = {}): Partial<Theme> => ({
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
  '-apple-system',
];

export function presetTheme(id: string): Theme {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
  return { ...structuredClone(p.theme), presetId: p.id };
}

/**
 * Switch an app to a theme preset. A theme sets colors and type; the user's layout, alignment,
 * screenshot size/position and background photos stay as they were.
 */
export function applyPreset(current: Theme, id: string): Theme {
  const t = presetTheme(id);
  t.layout = current.layout;
  t.align = current.align;
  t.shotScale = current.shotScale;
  t.shotOffsetY = current.shotOffsetY;
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
