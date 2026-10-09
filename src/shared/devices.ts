import type { App, DeviceId, Layout, Slide } from './types';

// Sizes from App Store Connect "Screenshot specifications" (checked October 2026):
// https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications

export interface DeviceSpec {
  id: DeviceId;
  label: string;
  /** accepted App Store Connect sizes, keyed by a stable label */
  sizes: Record<string, [number, number]>;
  /** size the editor designs at */
  defaultSize: string;
  /** sizes rendered on export unless the app picks others */
  defaultExport: string[];
  /** one-line note shown next to the device in the editor */
  note: string;
  /** screenshot frame width as a fraction of canvas width, per layout */
  frameWidth: Record<Layout, number>;
  /** multiplier applied to theme text sizes */
  textScale: number;
  /** multiplier on the theme corner radius (% of the frame's shorter side) */
  radiusScale: number;
}

export const DEVICES: Record<DeviceId, DeviceSpec> = {
  iphone: {
    id: 'iphone',
    label: 'iPhone',
    sizes: {
      'Large 1320 × 2868': [1320, 2868],
      'Large 1290 × 2796': [1290, 2796],
      'Large 1260 × 2736': [1260, 2736],
      'Medium 1206 × 2622': [1206, 2622],
      'Medium 1179 × 2556': [1179, 2556],
      'Face ID large 1284 × 2778': [1284, 2778],
      'Face ID large 1242 × 2688': [1242, 2688],
      'Face ID medium 1170 × 2532': [1170, 2532],
      'Home button 1242 × 2208': [1242, 2208],
      'Large 2868 × 1320 landscape': [2868, 1320],
      'Medium 2622 × 1206 landscape': [2622, 1206],
    },
    defaultSize: 'Large 1320 × 2868',
    defaultExport: ['Large 1320 × 2868', 'Medium 1206 × 2622'],
    note: 'Medium (Dynamic Island) is required. Large covers Pro Max, Plus and Air.',
    frameWidth: { top: 0.84, bottom: 0.84, side: 0.5 },
    textScale: 1,
    radiusScale: 1,
  },
  duo: {
    id: 'duo',
    label: 'iPhone Duo',
    sizes: {
      'Inner 2007 × 2853': [2007, 2853],
      'Outer 1398 × 2034': [1398, 2034],
      'Inner 2853 × 2007 landscape': [2853, 2007],
      'Outer 2034 × 1398 landscape': [2034, 1398],
    },
    defaultSize: 'Inner 2007 × 2853',
    defaultExport: ['Inner 2007 × 2853'],
    note: 'Required from April 2027 for apps built with the iOS 27.1 SDK or later.',
    frameWidth: { top: 0.8, bottom: 0.8, side: 0.56 },
    textScale: 0.86,
    radiusScale: 0.6,
  },
  ipad: {
    id: 'ipad',
    label: 'iPad',
    sizes: {
      '13" 2064 × 2752': [2064, 2752],
      '13" 2048 × 2732': [2048, 2732],
      '11" 1668 × 2420': [1668, 2420],
      '11" 1668 × 2388': [1668, 2388],
      '11" 1640 × 2360': [1640, 2360],
      '11" 1488 × 2266': [1488, 2266],
      '13" 2752 × 2064 landscape': [2752, 2064],
      '13" 2732 × 2048 landscape': [2732, 2048],
    },
    defaultSize: '13" 2064 × 2752',
    defaultExport: ['13" 2064 × 2752'],
    note: '13" is required for iPad apps. Smaller iPads use it scaled.',
    frameWidth: { top: 0.8, bottom: 0.8, side: 0.56 },
    textScale: 0.82,
    radiusScale: 0.45,
  },
  mac: {
    id: 'mac',
    label: 'Mac',
    sizes: {
      '2880 × 1800': [2880, 1800],
      '2560 × 1600': [2560, 1600],
      '1440 × 900': [1440, 900],
      '1280 × 800': [1280, 800],
    },
    defaultSize: '2880 × 1800',
    defaultExport: ['2880 × 1800'],
    note: 'Any one 16:10 size is accepted.',
    frameWidth: { top: 0.72, bottom: 0.72, side: 0.6 },
    textScale: 0.9,
    radiusScale: 0.35,
  },
};

export function canvasSize(app: App, device: DeviceId, sizeKey?: string): [number, number] {
  const spec = DEVICES[device];
  return spec.sizes[sizeKey ?? ''] ?? spec.sizes[app.sizes?.[device]] ?? spec.sizes[spec.defaultSize];
}

export function exportSizes(app: App, device: DeviceId): string[] {
  const spec = DEVICES[device];
  const list = (app.exportSizes?.[device] ?? []).filter((k) => spec.sizes[k]);
  return list.length ? list : spec.defaultExport;
}

/** Native App Store sizes in both orientations → device. Simulator screenshots match these exactly. */
const EXACT = new Map<string, DeviceId>();
for (const spec of Object.values(DEVICES)) {
  for (const [w, h] of Object.values(spec.sizes)) {
    EXACT.set(`${w}x${h}`, spec.id);
    EXACT.set(`${h}x${w}`, spec.id);
  }
}

/** Guess which device a screenshot came from: exact App Store size first, then aspect ratio. */
export function detectDevice(width: number, height: number): DeviceId | null {
  const exact = EXACT.get(`${width}x${height}`);
  if (exact) return exact;
  const r = Math.min(width, height) / Math.max(width, height);
  if (width > height) return r > 0.55 && r < 0.7 ? 'mac' : null;
  if (r >= 0.4 && r < 0.6) return 'iphone';
  if (r >= 0.6 && r < 0.9) return 'ipad';
  return null;
}

/** A slide is exported for a device when it has a screenshot for it. */
export function slideInDevice(slide: Slide, device: DeviceId) {
  return !!slide.shots[device];
}
