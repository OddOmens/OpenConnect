// Pick a color from the screen.
// Chromium browsers have a native eyedropper (window.EyeDropper) that samples anywhere on the screen.
// Elsewhere (Safari, Firefox) we sample inside the editor: click any screenshot, icon, sticker, shape or
// background and read its color — images pixel-exact (all assets are same-origin), the rest from CSS/SVG.

interface NativeEyeDropper {
  open: () => Promise<{ sRGBHex: string }>;
}

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** "rgb(1, 2, 3)" / "rgba(1, 2, 3, 0.5)" → hex, or null when transparent or not a color. */
function cssToHex(c: string | null | undefined): string | null {
  if (!c) return null;
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  const m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (a < 0.05) return null;
  return hex(+m[1], +m[2], +m[3]);
}

// Decoded pixels per image, so moving over a screenshot doesn't redraw it every time.
const pixelCache = new WeakMap<HTMLImageElement, CanvasRenderingContext2D | null>();
function imagePixel(img: HTMLImageElement, x: number, y: number): string | null {
  if (!img.complete || !img.naturalWidth) return null;
  let ctx = pixelCache.get(img);
  if (ctx === undefined) {
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      ctx = c.getContext('2d', { willReadFrequently: true });
      ctx?.drawImage(img, 0, 0);
    } catch {
      ctx = null;
    }
    pixelCache.set(img, ctx ?? null);
  }
  if (!ctx) return null;
  const r = img.getBoundingClientRect();
  const px = Math.floor(((x - r.left) / r.width) * img.naturalWidth);
  const py = Math.floor(((y - r.top) / r.height) * img.naturalHeight);
  try {
    const d = ctx.getImageData(Math.max(0, Math.min(img.naturalWidth - 1, px)), Math.max(0, Math.min(img.naturalHeight - 1, py)), 1, 1).data;
    return d[3] < 13 ? null : hex(d[0], d[1], d[2]);
  } catch {
    return null; // a cross-origin image would taint the canvas
  }
}

/** The color under a point in the page, looking through transparent pixels and layers. */
function colorAt(x: number, y: number, skip: Element): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el === skip || skip.contains(el)) continue;
    if (el instanceof HTMLImageElement) {
      const c = imagePixel(el, x, y);
      if (c) return c;
      continue;
    }
    if (el instanceof SVGElement) {
      const cs = getComputedStyle(el);
      const c = cssToHex(cs.fill !== 'none' ? cs.fill : '') ?? cssToHex(cs.stroke !== 'none' ? cs.stroke : '');
      if (c) return c;
      continue;
    }
    const c = cssToHex(getComputedStyle(el).backgroundColor);
    if (c) return c;
  }
  return null;
}

let active: Promise<string | null> | null = null;

/** Resolves with "#rrggbb", or null when cancelled (Esc, right click). */
export function pickColor(): Promise<string | null> {
  const Native = (window as unknown as { EyeDropper?: new () => NativeEyeDropper }).EyeDropper;
  if (Native) {
    return new Promise<{ sRGBHex: string }>((resolve, reject) => new Native().open().then(resolve, reject))
      .then((r) => cssToHex(r.sRGBHex) ?? r.sRGBHex)
      .catch(() => null);
  }
  if (active) return active;
  active = new Promise<string | null>((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;cursor:crosshair;';
    const chip = document.createElement('div');
    chip.className = 'eyedropper-chip';
    overlay.appendChild(chip);
    document.body.appendChild(overlay);

    let current: string | null = null;
    const show = (e: PointerEvent) => {
      current = colorAt(e.clientX, e.clientY, overlay);
      chip.style.left = `${e.clientX + 16}px`;
      chip.style.top = `${e.clientY + 16}px`;
      chip.innerHTML = current ? `<i style="background:${current}"></i>${current}` : 'No color here';
    };
    const done = (value: string | null) => {
      overlay.remove();
      window.removeEventListener('keydown', onKey, true);
      active = null;
      resolve(value);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done(null);
      }
    };
    overlay.addEventListener('pointermove', show);
    overlay.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (e.button !== 0) return done(null);
      show(e);
      done(current);
    });
    overlay.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', onKey, true);
  });
  return active;
}
