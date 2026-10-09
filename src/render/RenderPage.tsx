import { useEffect, useState } from 'react';
import type { App, DeviceId } from '../shared/types';
import { SlideView } from './SlideView';
import { canvasSize } from '../shared/devices';
import type { Slide } from '../shared/types';

declare global {
  interface Window {
    __appshotReady?: boolean;
    __appshotError?: string;
  }
}

/** Headless export target: every requested slide at native pixel size, stacked. */
export function RenderPage() {
  const params = new URLSearchParams(location.search);
  const appId = params.get('app')!;
  const device = (params.get('device') ?? 'iphone') as DeviceId;
  const ids = params.get('slides')?.split(',').filter(Boolean);
  const sizeKey = params.get('size') ?? undefined;
  // Smaller previews (e.g. to show in a chat) render the same layout scaled down.
  const scale = Number(params.get('scale') ?? 1);
  const [app, setApp] = useState<App | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/apps/${appId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setApp)
      .catch((e) => setError(String(e)));
  }, [appId]);

  useEffect(() => {
    if (!app) return;
    (async () => {
      await document.fonts.load(`${app.theme.headlineWeight} 100px "${app.theme.fontFamily}"`).catch(() => {});
      await document.fonts.load(`400 100px "${app.theme.fontFamily}"`).catch(() => {});
      await document.fonts.ready;
      const failed: string[] = [];
      await Promise.all(
        [...document.images].map((img) =>
          img.decode().catch(() => {
            failed.push(img.src);
          }),
        ),
      );
      if (failed.length) {
        // Never export a slide with a missing screenshot; the renderer reports this.
        window.__appshotError = `Images failed to load: ${failed.join(', ')}`;
        return;
      }
      // Background images are CSS, so preload them explicitly.
      const bgUrls = [...document.querySelectorAll<HTMLElement>('[data-render-slide] *, [data-render-slide]')]
        .map((el) => getComputedStyle(el).backgroundImage.match(/url\("?(.*?)"?\)/)?.[1])
        .filter((u): u is string => !!u);
      await Promise.all(bgUrls.map((u) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = u; })));
      requestAnimationFrame(() => requestAnimationFrame(() => (window.__appshotReady = true)));
    })();
  }, [app]);

  if (error) return <pre>{error}</pre>;
  if (!app) return null;
  const slides = ids ? ids.map((id) => app.slides.find((s) => s.id === id)!).filter(Boolean) : app.slides;
  return (
    <div style={{ margin: 0 }}>
      {slides.map((s) => (
        <div key={s.id} data-render-slide={s.id} style={{ width: 'fit-content' }}>
          {scale === 1 ? (
            <SlideView app={app} slide={s} device={device} sizeKey={sizeKey} />
          ) : (
            <ScaledSlide app={app} slide={s} device={device} sizeKey={sizeKey} scale={scale} />
          )}
        </div>
      ))}
    </div>
  );
}

function ScaledSlide({ app, slide, device, sizeKey, scale }: { app: App; slide: Slide; device: DeviceId; sizeKey?: string; scale: number }) {
  const [W, H] = canvasSize(app, device, sizeKey);
  return (
    <div style={{ width: Math.round(W * scale), height: Math.round(H * scale), overflow: 'hidden' }}>
      <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <SlideView app={app} slide={slide} device={device} sizeKey={sizeKey} />
      </div>
    </div>
  );
}
