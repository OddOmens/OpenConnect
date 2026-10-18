import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { App, DeviceId } from '../shared/types';
import { canvasSize, DEVICES } from '../shared/devices';
import { Scaled } from './Scaled';

/** Full-screen look at one slide as it exports. Arrow keys (handled by the board) step through slides. */
export function SlideViewer({
  app,
  device,
  slideId,
  onSelect,
  onClose,
}: {
  app: App;
  device: DeviceId;
  slideId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [W, H] = canvasSize(app, device);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const index = app.slides.findIndex((s) => s.id === slideId);
  const slide = app.slides[index];

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (!slide) onClose();
  }, [slide, onClose]);
  if (!slide) return null;

  // Fit inside the window, leaving room for the controls around it.
  const height = Math.floor(Math.min(viewport.h - 120, ((viewport.w - 160) * H) / W));
  const prev = app.slides[index - 1];
  const next = app.slides[index + 1];

  // Portal to <body> so it sits above the rails and inspector, not inside the board's stacking context.
  return createPortal(
    <div className="viewer" role="dialog" aria-modal aria-label={`Slide ${index + 1}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <header className="viewer-bar">
        <span>
          {index + 1} / {app.slides.length} · {DEVICES[device].label}
        </span>
        <button className="icon-btn light" onClick={onClose} aria-label="Close (Esc)" title="Close (Esc)">
          <X size={18} />
        </button>
      </header>
      <button
        className="icon-btn light viewer-nav prev"
        disabled={!prev}
        onClick={() => prev && onSelect(prev.id)}
        aria-label="Previous slide"
      >
        <ChevronLeft size={24} />
      </button>
      <Scaled app={app} slide={slide} device={device} height={Math.max(100, height)} />
      <button
        className="icon-btn light viewer-nav next"
        disabled={!next}
        onClick={() => next && onSelect(next.id)}
        aria-label="Next slide"
      >
        <ChevronRight size={24} />
      </button>
    </div>,
    document.body,
  );
}
