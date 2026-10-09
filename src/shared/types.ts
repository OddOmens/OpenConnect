// Shared data model for the editor, the server and the CLI.
// All lengths in themes/slides are in "units": 1u = min(canvasWidth, canvasHeight) / 1000,
// so one design scales cleanly across iPhone, iPad and Mac canvases.

export type DeviceId = 'iphone' | 'duo' | 'ipad' | 'mac';
export const DEVICE_IDS: DeviceId[] = ['iphone', 'duo', 'ipad', 'mac'];

/**
 * App-wide layout — every slide uses the same one.
 * top    – headline above, screenshot below bleeding off the bottom
 * bottom – screenshot above bleeding off the top, headline below
 * side   – headline on the left, screenshot on the right (best for Mac / iPad landscape)
 */
export type Layout = 'top' | 'bottom' | 'side';
export const LAYOUTS: Layout[] = ['top', 'bottom', 'side'];

export type PaletteKey = 'primary' | 'alt';
export type Align = 'left' | 'center';

export interface Background {
  type: 'solid' | 'linear' | 'radial' | 'image';
  color: string;
  color2: string;
  angle: number;
  imageAssetId?: string | null;
  /** 0–1 darkening scrim over a background image */
  overlay: number;
}

export interface Palette {
  background: Background;
  textColor: string;
  accentColor: string; // used for *highlighted* words
  subtitleColor: string;
}

export interface FrameStyle {
  strokeColor: string;
  strokeWidth: number; // units
  radius: number; // % of screenshot width
  shadow: number; // 0–1
}

/** Every visual setting lives here and applies to all slides of the app. */
export interface Theme {
  /** preset the colors and type came from (for highlighting in the editor) */
  presetId?: string;
  layout: Layout;
  palettes: Record<PaletteKey, Palette>;
  /** use the alternate palette on every other slide */
  alternate: boolean;
  fontFamily: string;
  headlineWeight: number;
  headlineSize: number; // units
  subtitleSize: number; // units
  letterSpacing: number; // em
  lineHeight: number;
  align: Align;
  frame: FrameStyle;
  shotScale: number; // 1 = default screenshot size
  shotOffsetY: number; // units, positive = down
}

/** A slide is content only: words and screenshots. Its look comes from the app's theme. */
export interface Slide {
  id: string;
  headline: string; // wrap words in *asterisks* to highlight in the accent color; \n for line breaks
  subtitle: string;
  /** screenshot asset per device; a slide is exported for every device it has a screenshot for */
  shots: Partial<Record<DeviceId, string | null>>;
  /** which screen of the app this slide shows, and how to get there to re-capture it */
  screen: { name: string; notes: string };
}

export interface Asset {
  id: string;
  file: string;
  width: number;
  height: number;
  kind: 'screenshot' | 'icon' | 'background';
  originalName: string;
  createdAt: string;
  /** where the image came from, e.g. { kind: 'simulator', device: 'iPhone 18 Pro' } */
  source?: AssetSource;
}

export interface AssetSource {
  kind: 'simulator' | 'mac-window' | 'upload' | 'file';
  /** simulator or Mac app name */
  device?: string;
  /** original file path, when added from disk */
  path?: string;
}

/** Everything worth remembering about an app between sessions — read by Claude before it works on the app. */
export interface AppProfile {
  bundleId: string;
  /** absolute path of the app's source repo; lets `appshot` find the app from inside that folder */
  projectPath: string;
  appStoreUrl: string;
  category: string;
  /** what the app does and for whom, in plain words */
  description: string;
  audience: string;
  keywords: string[];
  brandColors: string[];
  /** which screens to capture and how to reach them (deep links, taps, demo account, seed data) */
  screens: string;
  /** anything else: tone of voice, things to avoid, decisions made */
  notes: string;
}

export interface App {
  id: string;
  name: string;
  subtitle: string;
  iconAssetId: string | null;
  devices: DeviceId[];
  /** design size per device (what the editor shows) */
  sizes: Record<DeviceId, string>;
  /** every App Store size to render on export, per device */
  exportSizes: Record<DeviceId, string[]>;
  profile: AppProfile;
  theme: Theme;
  slides: Slide[];
  assets: Record<string, Asset>;
  createdAt: string;
  updatedAt: string;
}

export type AppSummary = Pick<App, 'id' | 'name' | 'subtitle' | 'iconAssetId' | 'devices' | 'updatedAt'> & {
  slideCount: number;
  /** screenshots per enabled device */
  counts: Partial<Record<DeviceId, number>>;
};

export type DeepPartial<T> = T extends (infer U)[] ? U[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
