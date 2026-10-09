import type { App, AppProfile, AssetSource, DeviceId, Layout } from './types';
import { DEVICES, canvasSize, exportSizes, slideInDevice } from './devices';
import { checkDevice, checkSlide, SEARCH_RESULT_SLOTS, type Issue } from './guidelines';

/**
 * A clean, self-describing record of one app's screenshot set: what Claude (or anything else) reads to
 * answer "Afternoon has 6 iPhone screenshots — what's on each one?"
 */
export interface AppData {
  id: string;
  name: string;
  subtitle: string;
  editorUrl: string;
  updatedAt: string;
  hasIcon: boolean;
  profile: AppProfile;
  /** app-wide look; applies to every slide */
  style: {
    layout: Layout;
    font: string;
    alternateColors: boolean;
    palettes: { primary: PaletteSummary; alt: PaletteSummary };
    align: App['theme']['align'];
    headlineSize: number;
    screenshotScale: number;
    screenshotOffset: number;
    frame: App['theme']['frame'];
  };
  devices: DeviceData[];
  slides: SlideData[];
}

interface PaletteSummary {
  background: string;
  text: string;
  highlight: string;
}

export interface DeviceData {
  device: DeviceId;
  label: string;
  designSize: { label: string; width: number; height: number };
  exportSizes: { label: string; width: number; height: number }[];
  /** slides with a screenshot for this device — these get exported */
  screenshots: number;
  /** slides without a screenshot for this device */
  missingScreenshots: number;
  issues: Issue[];
}

export interface ScreenshotData {
  assetId: string;
  width: number;
  height: number;
  fileName: string;
  addedAt: string;
  source?: AssetSource;
  url: string;
}

export interface SlideData {
  /** 1-based listing order */
  position: number;
  id: string;
  /** headline with *highlight* markers and \n line breaks, as stored */
  headline: string;
  /** headline as a reader sees it */
  headlineText: string;
  subtitle: string;
  screen: { name: string; notes: string };
  /** can appear in App Store search results (first three exported screenshots) */
  inSearchResults: boolean;
  issues: Issue[];
  /** screenshot per device, or null when this slide has none for that device */
  screenshots: Partial<Record<DeviceId, ScreenshotData | null>>;
}

export function buildAppData(app: App, baseUrl = ''): AppData {
  const shot = (id?: string | null): ScreenshotData | null => {
    const a = id ? app.assets[id] : undefined;
    if (!a) return null;
    return {
      assetId: a.id,
      width: a.width,
      height: a.height,
      fileName: a.originalName,
      addedAt: a.createdAt,
      source: a.source,
      url: `${baseUrl}/api/apps/${app.id}/assets/${a.id}`,
    };
  };

  const order = Object.fromEntries(
    app.devices.map((d) => [d, app.slides.filter((s) => slideInDevice(s, d)).map((s) => s.id)]),
  ) as Record<DeviceId, string[]>;

  const devices: DeviceData[] = app.devices.map((d) => {
    const spec = DEVICES[d];
    const [w, h] = canvasSize(app, d);
    return {
      device: d,
      label: spec.label,
      designSize: { label: app.sizes[d], width: w, height: h },
      exportSizes: exportSizes(app, d).map((k) => ({ label: k, width: spec.sizes[k][0], height: spec.sizes[k][1] })),
      screenshots: order[d].length,
      missingScreenshots: app.slides.length - order[d].length,
      issues: checkDevice(app, d),
    };
  });

  const slides: SlideData[] = app.slides.map((s, i) => ({
    position: i + 1,
    id: s.id,
    headline: s.headline,
    headlineText: s.headline.replace(/\*/g, '').replace(/\n/g, ' '),
    subtitle: s.subtitle,
    screen: s.screen ?? { name: '', notes: '' },
    inSearchResults: app.devices.some((d) => {
      const p = order[d].indexOf(s.id);
      return p >= 0 && p < SEARCH_RESULT_SLOTS;
    }),
    issues: checkSlide(s),
    screenshots: Object.fromEntries(app.devices.map((d) => [d, shot(s.shots[d])])),
  }));

  const pal = (k: 'primary' | 'alt'): PaletteSummary => {
    const p = app.theme.palettes[k];
    return { background: p.background.color, text: p.textColor, highlight: p.accentColor };
  };
  const t = app.theme;

  return {
    id: app.id,
    name: app.name,
    subtitle: app.subtitle,
    editorUrl: `${baseUrl}/?app=${app.id}`,
    updatedAt: app.updatedAt,
    hasIcon: !!app.iconAssetId,
    profile: app.profile,
    style: {
      layout: t.layout,
      font: t.fontFamily,
      alternateColors: t.alternate,
      palettes: { primary: pal('primary'), alt: pal('alt') },
      align: t.align,
      headlineSize: t.headlineSize,
      screenshotScale: t.shotScale,
      screenshotOffset: t.shotOffsetY,
      frame: t.frame,
    },
    devices,
    slides,
  };
}
