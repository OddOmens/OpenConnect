import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { ZipArchive } from 'archiver';
import type { App, DeviceId } from '../src/shared/types.ts';
import { canvasSize, DEVICES, exportSizes, slideInDevice } from '../src/shared/devices.ts';
import { slugify } from '../src/shared/presets.ts';
import { DATA_DIR, HttpError } from './store.ts';

let browserPromise: Promise<Browser> | null = null;
let idleTimer: NodeJS.Timeout | null = null;

/** Any Chromium that Playwright has cached, newest first — used when the pinned revision isn't installed. */
function cachedChromiums(): string[] {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (!fs.existsSync(root)) return [];
  const candidates: string[] = [];
  for (const dir of fs.readdirSync(root).sort().reverse()) {
    const base = path.join(root, dir);
    if (dir.startsWith('chromium_headless_shell-')) {
      for (const arch of ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell-mac-x64', 'chrome-headless-shell-linux64']) {
        candidates.push(path.join(base, arch, 'chrome-headless-shell'));
      }
    } else if (dir.startsWith('chromium-')) {
      for (const arch of ['chrome-mac-arm64', 'chrome-mac', 'chrome-mac-x64']) {
        candidates.push(path.join(base, arch, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
        candidates.push(path.join(base, arch, 'Chromium.app/Contents/MacOS/Chromium'));
      }
    }
  }
  return candidates.filter((p) => fs.existsSync(p));
}

async function launch(): Promise<Browser> {
  const attempts: (() => Promise<Browser>)[] = [
    () => chromium.launch(),
    ...cachedChromiums().map((executablePath) => () => chromium.launch({ executablePath })),
    () => chromium.launch({ channel: 'chrome' }),
  ];
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (e) {
      lastError = e;
    }
  }
  throw new HttpError(
    500,
    `No headless browser available for rendering. Run "npm run setup:browser" once. (${(lastError as Error)?.message?.split('\n')[0]})`,
  );
}

async function getBrowser() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    const b = await browserPromise?.catch(() => null);
    browserPromise = null;
    await b?.close().catch(() => {});
  }, 60_000);
  if (!browserPromise) {
    browserPromise = launch().catch((e) => {
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
}

export interface RenderedSlide {
  slideId: string;
  index: number;
  device: DeviceId;
  png: Buffer;
  filename: string;
}

/** Render slides of one device to PNG at exact App Store pixel size. */
export async function renderSlides(
  baseUrl: string,
  app: App,
  device: DeviceId,
  opts: { slideIds?: string[]; includeIncomplete?: boolean; sizeKey?: string; scale?: number } = {},
): Promise<RenderedSlide[]> {
  const scale = opts.scale ?? 1;
  const [w, h] = canvasSize(app, device, opts.sizeKey).map((v) => Math.round(v * scale));
  const slides = app.slides
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => opts.includeIncomplete || slideInDevice(s, device))
    .filter(({ s }) => !opts.slideIds || opts.slideIds.includes(s.id))
  if (!slides.length) return [];

  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  try {
    const size = (opts.sizeKey ? `&size=${encodeURIComponent(opts.sizeKey)}` : '') + (scale !== 1 ? `&scale=${scale}` : '');
    const url = `${baseUrl}/render?app=${app.id}&device=${device}${size}&slides=${slides.map(({ s }) => s.id).join(',')}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __appshotReady?: boolean; __appshotError?: string };
        return w.__appshotReady === true || !!w.__appshotError;
      },
      null,
      { timeout: 30_000 },
    );
    const renderError = await page.evaluate(() => (window as unknown as { __appshotError?: string }).__appshotError);
    if (renderError) throw new HttpError(500, renderError);
    const out: RenderedSlide[] = [];
    let n = 0;
    for (const { s, i } of slides) {
      n++;
      const el = page.locator(`[data-render-slide="${s.id}"]`);
      const png = await el.screenshot({ type: 'png', animations: 'disabled' });
      out.push({
        slideId: s.id,
        index: i,
        device,
        png,
        filename: `${String(n).padStart(2, '0')}-${slugify(s.headline)}.png`,
      });
    }
    return out;
  } finally {
    await page.close();
  }
}

export interface ExportResult {
  dir: string;
  zip: string;
  files: { device: DeviceId; size: string; slideId: string; path: string }[];
  skipped: { device: DeviceId; slideId: string; reason: string }[];
}

/** Every size per device, each rendered natively: <dir>/<device>/<W>x<H>/NN-headline.png */
export async function exportApp(
  baseUrl: string,
  app: App,
  opts: { devices?: DeviceId[]; sizes?: Partial<Record<DeviceId, string[]>>; outDir?: string },
): Promise<ExportResult> {
  const devices = (opts.devices?.length ? opts.devices : app.devices).filter((d) => app.devices.includes(d));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = opts.outDir ? path.resolve(opts.outDir) : path.join(DATA_DIR, 'exports', `${slugify(app.name)}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });

  const files: ExportResult['files'] = [];
  const skipped: ExportResult['skipped'] = [];
  for (const device of devices) {
    for (const s of app.slides) if (!slideInDevice(s, device)) skipped.push({ device, slideId: s.id, reason: 'no screenshot' });
    const sizes = (opts.sizes?.[device] ?? exportSizes(app, device)).filter((k) => DEVICES[device].sizes[k]);
    for (const sizeKey of sizes) {
      const rendered = await renderSlides(baseUrl, app, device, { sizeKey });
      if (!rendered.length) continue;
      const [w, h] = DEVICES[device].sizes[sizeKey];
      const ddir = path.join(dir, device, `${w}x${h}`);
      fs.mkdirSync(ddir, { recursive: true });
      for (const r of rendered) {
        const p = path.join(ddir, r.filename);
        fs.writeFileSync(p, r.png);
        files.push({ device, size: sizeKey, slideId: r.slideId, path: p });
      }
    }
  }

  const zip = dir.replace(/\/$/, '') + '.zip';
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zip);
    const archive = new ZipArchive({ zlib: { level: 6 } });
    output.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(dir, false);
    archive.finalize();
  });
  return { dir, zip, files, skipped };
}
