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

/**
 * solid · linear (gradient) · radial (glow) · image (photo) ·
 * mesh (soft blobs of color, color2 and color3, arranged by `seed`) · screenshot (the slide's own screenshot, blurred)
 */
export interface Background {
  type: 'solid' | 'linear' | 'radial' | 'image' | 'mesh' | 'screenshot';
  color: string;
  color2: string;
  /** third mesh color */
  color3: string;
  /** mesh arrangement; change it to shuffle the blobs */
  seed: number;
  angle: number;
  imageAssetId?: string | null;
  /** 0–1 darkening scrim over a background photo or frosted screenshot */
  overlay: number;
}

export type TextureKind = 'none' | 'grain' | 'dots' | 'grid' | 'lines';
export const TEXTURE_KINDS: TextureKind[] = ['none', 'grain', 'dots', 'grid', 'lines'];

/** Pattern over the background, under the text and screenshot. */
export interface TextureStyle {
  kind: TextureKind;
  /** 0–1 */
  opacity: number;
  /** pattern spacing, units */
  size: number;
}

/** Generated shapes over the background, under the screenshot. */
export type DecorKind = 'none' | 'blobs' | 'waves' | 'rings' | 'sparkles' | 'confetti' | 'bokeh';
export const DECOR_KINDS: DecorKind[] = ['none', 'blobs', 'waves', 'rings', 'sparkles', 'confetti', 'bokeh'];

export interface DecorStyle {
  kind: DecorKind;
  /** how many shapes, 0.25–3 */
  density: number;
  /** shape size, 0.4–2.5 */
  scale: number;
  /** 0–1 */
  opacity: number;
  /** '' uses the highlight and brand colors */
  color: string;
  /** arrangement; change it to shuffle */
  seed: number;
}

/** Hand-drawn marks on the *highlighted* words of a headline. */
export type AnnotationKind = 'none' | 'underline' | 'double' | 'circle' | 'box' | 'marker' | 'strike' | 'brackets' | 'squiggle';
export const ANNOTATION_KINDS: AnnotationKind[] = ['none', 'underline', 'double', 'circle', 'box', 'marker', 'strike', 'brackets', 'squiggle'];

export interface AnnotationStyle {
  kind: AnnotationKind;
  /** '' uses the highlight color */
  color: string;
  /** stroke width, units */
  width: number;
  /** 0 = clean lines, 3 = very sketchy */
  roughness: number;
  /** space around the words, units (for underlines: the gap below the letters) */
  padding: number;
  /** also color the words with the highlight color */
  recolor: boolean;
  /** the highlighter, for kind 'marker' */
  marker: MarkerStyle;
}

/** A highlighter stroke behind the words. Sizes are shares of the headline's text size. */
export interface MarkerStyle {
  /** 0–1 */
  opacity: number;
  /** 0.15 is a thin stripe under the words, 1.1 covers them */
  height: number;
  /** moves it up (+) or down (−) */
  lift: number;
  /** corners: 0 square, 1 fully round ends */
  radius: number;
  /** degrees; negative rises to the right */
  tilt: number;
}

/** Soft light behind the screenshot. */
export interface GlowStyle {
  /** 0 = off, 1 = full */
  strength: number;
  /** '' uses the highlight color */
  color: string;
  /** glow width as a multiple of the screenshot width */
  size: number;
}

export interface Palette {
  background: Background;
  textColor: string;
  accentColor: string; // used for *highlighted* words
  subtitleColor: string;
}

/**
 * outline – the screenshot with rounded corners and a stroke (strokeColor/strokeWidth)
 * device  – drawn device hardware around it: iPhone with Dynamic Island and buttons, iPad, Mac laptop
 */
export type FrameKind = 'outline' | 'device';
export const FRAME_KINDS: FrameKind[] = ['outline', 'device'];

export interface FrameStyle {
  kind: FrameKind;
  /** device body color when kind is 'device' */
  deviceColor: string;
  strokeColor: string;
  strokeWidth: number; // units
  radius: number; // % of screenshot width
  shadow: number; // 0–1
}

/** How every callout looks: the marked part of a screenshot lifted out above it, larger. */
export interface CalloutStyle {
  /** 1 = same size as in the screenshot */
  scale: number;
  shadow: number; // 0–1
  radius: number; // units
}

/** The hero slide design: badge, logo lockup and a tilted device. Used by slides with role 'hero'. */
export type BadgeKind = 'none' | 'rating' | 'downloads' | 'custom';
export const BADGE_KINDS: BadgeKind[] = ['none', 'rating', 'downloads', 'custom'];

export interface HeroStyle {
  /** rating shows five stars, downloads a download mark, custom just the text; none hides the badge */
  badge: BadgeKind;
  /** big badge line between laurels, e.g. "4.9 Stars" or "1M+ Downloads" */
  badgeTitle: string;
  /** small line under it, e.g. "From 62k+ users" */
  badgeCaption: string;
  /** app icon + name above the headline */
  lockup: boolean;
  /** device rotation in degrees; negative leans left */
  tilt: number;
  /** badge text per translation language (see locales.ts); missing keys use the text above */
  locales: Record<string, { badgeTitle?: string; badgeCaption?: string }>;
}

/** Every visual setting lives here and applies to all slides of the app, unless a slide overrides it. */
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
  /** moves the headline and subtitle; units, positive = down */
  textOffsetY: number;
  /** one background running across all slides, each slide showing its slice */
  panorama: boolean;
  texture: TextureStyle;
  /** 0–1 darkening toward the edges */
  vignette: number;
  glow: GlowStyle;
  decor: DecorStyle;
  annotation: AnnotationStyle;
  /** drop shadow under every sticker, 0–1 */
  stickerShadow: number;
  callout: CalloutStyle;
  hero: HeroStyle;
}

/** Part of a screenshot, as fractions (0–1) of its width and height. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SlideRole = 'standard' | 'hero';

/**
 * A slide is content: words, screenshots, what to point at, and its role. Its look comes from the app's theme.
 */
export interface Slide {
  id: string;
  headline: string; // wrap words in *asterisks* to highlight in the accent color; \n for line breaks
  subtitle: string;
  /** screenshot asset per device; a slide is exported for every device it has a screenshot for */
  shots: Partial<Record<DeviceId, string | null>>;
  /** which screen of the app this slide shows, and how to get there to re-capture it */
  screen: { name: string; notes: string };
  /** 'hero' uses the app's hero design (badge, logo lockup, tilted device), usually on the first slide */
  role: SlideRole;
  /** part of the screenshot to lift out as a callout, per device (screenshots differ per device) */
  callouts: Partial<Record<DeviceId, Rect | null>>;
  /** style settings changed for this slide only; everything else comes from the app's theme */
  style?: StyleOverride | null;
  /** emoji and doodles placed on this slide */
  stickers: Sticker[];
  /** translations, by language code (see locales.ts); anything missing uses the base language */
  locales: Record<string, SlideLocale>;
}

/** One slide in one translation language. */
export interface SlideLocale {
  headline?: string;
  subtitle?: string;
  /** screenshots taken in this language, per device; missing ones use the base screenshots */
  shots?: Partial<Record<DeviceId, string | null>>;
}

/** 'apple' is cut from an emoji font the user installs in <data>/fonts (Apple Color Emoji can't be bundled). */
export type EmojiStyle = '3d' | 'color' | 'flat' | 'apple';

/** An emoji (Fluent Emoji bundled in vendor/, or the installed emoji font) or a hand-drawn doodle placed on a slide. */
export interface Sticker {
  id: string;
  kind: 'emoji' | 'doodle';
  /** emoji slug (see /api/emoji) or doodle name */
  ref: string;
  /** emoji look; doodles ignore it */
  style: EmojiStyle;
  /** center, as fractions of the slide's width and height */
  x: number;
  y: number;
  /** width in units (1/1000 of the slide's short side) */
  size: number;
  /** degrees */
  rotation: number;
  /** behind or in front of the screenshot and text */
  layer: 'back' | 'front';
  /** doodle color; '' uses the highlight color */
  color: string;
  flip: boolean;
  /** 0–1 */
  opacity: number;
}

/** Any part of the theme, set on one slide. Unset keys fall back to the app's theme. */
export type StyleOverride = DeepPartial<Omit<Theme, 'presetId' | 'alternate' | 'hero'>>;

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

/**
 * App Store creative assets (iOS 27 / iPadOS 27 and later): one product page header and one search
 * results asset per app. Sizes and safe areas are in `creatives.ts`.
 */
export type CreativeId = 'header' | 'search';
export const CREATIVE_IDS: CreativeId[] = ['header', 'search'];

/** A screenshot shown in a creative asset: one slide's screenshot for one device. */
export interface CreativeShot {
  slideId: string;
  device: DeviceId;
}

export interface Creative {
  /** export it with the screenshots */
  enabled: boolean;
  headline: string; // *highlight* and \n like slides
  subtitle: string;
  /** app icon and name above the headline */
  lockup: boolean;
  /** text on the left with screenshots right, text centered between screenshots, or screenshots only */
  textPosition: 'left' | 'center' | 'none';
  /** 0–4 screenshots; empty picks the first slides' iPhone screenshots */
  shots: CreativeShot[];
  /** screenshot height as a multiple of the safe area height */
  shotScale: number;
  /** own background; null uses the app's colors */
  background: Background | null;
  /** text per translation language (see locales.ts); missing keys use the text above */
  locales: Record<string, { headline?: string; subtitle?: string }>;
}

/**
 * A screenshot set: its own slides, style and product page assets. An app's own `theme`, `slides` and
 * `creatives` are the primary set; `sets` holds the others (e.g. mockups being tested). Everything else
 * — name, icon, devices, sizes, profile, assets — is shared by all sets.
 */
export interface ScreenshotSet {
  id: string;
  name: string;
  theme: Theme;
  slides: Slide[];
  creatives: Record<CreativeId, Creative>;
  createdAt: string;
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
  /** product page header and search results assets */
  creatives: Record<CreativeId, Creative>;
  /** name of the primary set (this app's own theme, slides and creatives) */
  primarySetName: string;
  /** other screenshot sets */
  sets: ScreenshotSet[];
  /** set this object shows when it's a view of a non-primary set (see setView); never saved */
  activeSet?: string;
  /** language the slides are written in, an App Store Connect code like en-US */
  baseLanguage: string;
  /** translation languages, shared by every set (see locales.ts) */
  languages: string[];
  /** language this object shows when it's a translated view (see localize); never saved */
  activeLang?: string;
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
