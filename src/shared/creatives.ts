import type { App, Creative, CreativeId, CreativeShot } from './types';

// From App Store Connect "Creative assets specifications" and Apple's creative asset templates
// (Sketch/Figma, October 2026): https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/
// No alpha channel; .png or .jpeg. Shown on iOS 27 / iPadOS 27 and later.

export interface CreativeSpec {
  id: CreativeId;
  label: string;
  /** accepted image sizes, keyed by a stable label */
  sizes: Record<string, [number, number]>;
  defaultSize: string;
  /** "Art safe area" from Apple's template, centered, measured on the 3840-wide canvas */
  safe: [number, number];
  note: string;
}

export const CREATIVES: Record<CreativeId, CreativeSpec> = {
  header: {
    id: 'header',
    label: 'Product page header',
    sizes: { '21:9 3840 × 1646': [3840, 1646] },
    defaultSize: '21:9 3840 × 1646',
    safe: [1646, 661],
    note: 'The top of your product page. Cropped differently on iPhone, iPad and Mac — keep text and the focal point in the safe area.',
  },
  search: {
    id: 'search',
    label: 'Search results',
    sizes: { '3:2 3840 × 2560': [3840, 2560], '3:2 1920 × 1280': [1920, 1280] },
    defaultSize: '3:2 3840 × 2560',
    safe: [2168, 1030],
    note: 'Shown in Search before people reach your page. Make what the app does obvious; show the real interface.',
  },
};

/** The centered safe area at a given canvas size, scaled from Apple's 3840-wide template. */
export function safeArea(id: CreativeId, W: number, H: number) {
  const k = W / 3840;
  const [w, h] = CREATIVES[id].safe.map((v) => v * k);
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

export function newCreative(id: CreativeId, partial: Partial<Creative> = {}): Creative {
  return {
    enabled: false,
    headline: '',
    subtitle: '',
    lockup: true,
    textPosition: id === 'header' ? 'center' : 'left',
    shots: [],
    shotScale: id === 'header' ? 1.4 : 1.1,
    background: null,
    locales: {},
    ...partial,
  };
}

/** Screenshots a creative shows: its own picks, or the first slides that have an iPhone screenshot. */
export function creativeShots(app: App, c: Creative): (CreativeShot & { assetId: string })[] {
  const picked = c.shots.length
    ? c.shots
    : app.slides
        .filter((s) => s.shots.iphone)
        .slice(0, c.textPosition === 'center' ? 2 : 3)
        .map((s) => ({ slideId: s.id, device: 'iphone' as const }));
  return picked
    .map((p) => ({ ...p, assetId: app.slides.find((s) => s.id === p.slideId)?.shots[p.device] ?? '' }))
    .filter((p) => p.assetId && app.assets[p.assetId]);
}
