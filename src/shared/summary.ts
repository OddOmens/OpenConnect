import type { App, AppProfile, AssetSource, CreativeId, DeviceId, Layout, Slide } from './types';
import { CREATIVE_IDS } from './types';
import { CREATIVES, creativeShots } from './creatives';
import { PRIMARY_SET, setList, setName, type SetSummary } from './sets';
import { DEVICES, canvasSize, exportSizes, slideInDevice } from './devices';
import { checkCreative, checkDevice, checkSlide, checkTranslation, SEARCH_RESULT_SLOTS, type Issue } from './guidelines';
import { languageName, translationProgress, untranslated, viewLanguage } from './locales';

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
  /** the screenshot set this record describes; slides, style and creatives below are this set's */
  set: { id: string; name: string; primary: boolean };
  /** every set of the app (pass ?set= / --set to read another) */
  sets: SetSummary[];
  /** the language this record shows (pass ?lang= / --lang for a translation), and every translation's progress */
  languages: {
    current: { code: string; name: string };
    base: { code: string; name: string };
    translations: { code: string; name: string; done: number; total: number }[];
  };
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
    textOffset: number;
    /** fill of the main colors: solid, linear, radial, image, mesh or screenshot (frosted) */
    background: string;
    panorama: boolean;
    texture: App['theme']['texture'];
    vignette: number;
    glow: App['theme']['glow'];
    decor: App['theme']['decor'];
    headlineMarks: App['theme']['annotation'];
    stickerShadow: number;
    frame: App['theme']['frame'];
    callout: App['theme']['callout'];
    hero: App['theme']['hero'];
  };
  devices: DeviceData[];
  slides: SlideData[];
  /** product page header and search results assets (iOS 27 and later) */
  creatives: Record<CreativeId, CreativeData>;
}

export interface CreativeData {
  label: string;
  /** exported with the screenshots */
  enabled: boolean;
  size: { label: string; width: number; height: number };
  /** Apple's art safe area at that size, centered */
  safeArea: { width: number; height: number };
  headline: string;
  subtitle: string;
  lockup: boolean;
  textPosition: 'left' | 'center' | 'none';
  /** screenshots shown (picked, or the automatic first slides), by slide position and device */
  screenshots: { slide: number; device: DeviceId }[];
  automaticScreenshots: boolean;
  shotScale: number;
  ownBackground: boolean;
  issues: Issue[];
  renderUrl: string;
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
  /** 'hero' uses the app's hero design */
  role: Slide['role'];
  /** style this slide changes for itself; everything else is the app style */
  styleOverrides: Slide['style'];
  /** emoji and doodle stickers on the slide */
  stickers: Slide['stickers'];
  /** in a translation: base-language text still showing because it isn't translated yet */
  untranslated?: ('headline' | 'subtitle')[];
  /** part of each device's screenshot lifted out as a callout, in that screenshot's pixels */
  callouts: Partial<Record<DeviceId, { x: number; y: number; width: number; height: number }>>;
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
    role: s.role ?? 'standard',
    styleOverrides: s.style ?? null,
    stickers: s.stickers ?? [],
    ...(app.activeLang ? { untranslated: untranslated(s, app.activeLang) } : {}),
    callouts: Object.fromEntries(
      app.devices.flatMap((d) => {
        const c = s.callouts?.[d];
        const a = s.shots[d] ? app.assets[s.shots[d]!] : undefined;
        if (!c || !a) return [];
        const px = (v: number, n: number) => Math.round(v * n);
        return [[d, { x: px(c.x, a.width), y: px(c.y, a.height), width: px(c.w, a.width), height: px(c.h, a.height) }]];
      }),
    ),
    inSearchResults: app.devices.some((d) => {
      const p = order[d].indexOf(s.id);
      return p >= 0 && p < SEARCH_RESULT_SLOTS;
    }),
    issues: [...checkSlide(s), ...checkTranslation(s, app.activeLang ?? null)],
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
    set: { id: app.activeSet ?? PRIMARY_SET, name: setName(app), primary: !app.activeSet },
    sets: setList(app),
    languages: {
      current: { code: viewLanguage(app), name: languageName(viewLanguage(app)) },
      base: { code: app.baseLanguage, name: languageName(app.baseLanguage) },
      translations: translationProgress(app),
    },
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
      textOffset: t.textOffsetY,
      background: t.palettes.primary.background.type,
      panorama: t.panorama,
      texture: t.texture,
      vignette: t.vignette,
      glow: t.glow,
      decor: t.decor,
      headlineMarks: t.annotation,
      stickerShadow: t.stickerShadow,
      frame: t.frame,
      callout: t.callout,
      hero: t.hero,
    },
    devices,
    slides,
    creatives: Object.fromEntries(
      CREATIVE_IDS.map((id) => {
        const c = app.creatives[id];
        const spec = CREATIVES[id];
        const [w, h] = spec.sizes[spec.defaultSize];
        return [
          id,
          {
            label: spec.label,
            enabled: c.enabled,
            size: { label: spec.defaultSize, width: w, height: h },
            safeArea: { width: spec.safe[0], height: spec.safe[1] },
            headline: c.headline,
            subtitle: c.subtitle,
            lockup: c.lockup,
            textPosition: c.textPosition,
            screenshots: creativeShots(app, c).map((s) => ({ slide: app.slides.findIndex((x) => x.id === s.slideId) + 1, device: s.device })),
            automaticScreenshots: !c.shots.length,
            shotScale: c.shotScale,
            ownBackground: !!c.background,
            issues: checkCreative(c),
            renderUrl: `${baseUrl}/api/apps/${app.id}/creatives/${id}/render.png`,
          } satisfies CreativeData,
        ];
      }),
    ) as Record<CreativeId, CreativeData>,
  };
}
