import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ImagePlus, Maximize2, Plus, Search, TriangleAlert } from 'lucide-react';
import type { App, DeviceId } from '../shared/types';
import { canvasSize } from '../shared/devices';
import type { EditorActions } from '../Editor';
import { Scaled } from './Scaled';
import { SlideViewer } from './SlideViewer';
import { FilePick } from './controls';
import { checkSlide, SEARCH_RESULT_SLOTS } from '../shared/guidelines';
import { DEVICES, slideInDevice } from '../shared/devices';

const imageFiles = (e: DragEvent) => [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files');

export function Pasteboard({
  app,
  device,
  zoom,
  selected,
  onSelect,
  actions,
  embedded,
  active = true,
}: {
  /** a row inside the sets canvas (no own scrolling) */
  embedded?: boolean;
  /** the row whose set is being edited: it takes the arrow keys and the full-screen viewer */
  active?: boolean;
  app: App;
  device: DeviceId;
  zoom: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  actions: EditorActions;
}) {
  const [W, H] = canvasSize(app, device);
  const height = Math.round(W > H ? zoom * 0.62 : zoom);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [boardDrop, setBoardDrop] = useState(false);
  const [viewing, setViewing] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  const slides = app.slides;
  // Position within this device's exported set (excluded or incomplete slides don't count).
  const exportOrder = app.slides.filter((s) => slideInDevice(s, device)).map((s) => s.id);

  // Arrow keys move the selection; Delete removes nothing (too easy to slip) — use the inspector.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const i = slides.findIndex((s) => s.id === selected);
      const next = slides[Math.max(0, Math.min(slides.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))];
      if (next) {
        onSelect(next.id);
        document.getElementById(`card-${next.id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides, selected, onSelect, active]);

  return (
    <div
      className={`${embedded ? 'set-board' : 'pasteboard'} ${boardDrop ? 'drop' : ''}`}
      onClick={(e) => e.target === e.currentTarget && onSelect(null)}
      onDragOver={(e) => {
        if (hasFiles(e)) {
          e.preventDefault();
          setBoardDrop(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setBoardDrop(false)}
      onDrop={(e) => {
        setBoardDrop(false);
        if (!hasFiles(e)) return;
        e.preventDefault();
        const files = imageFiles(e);
        if (files.length) actions.ingest(files);
      }}
    >
      <div className="strip" ref={stripRef} onClick={(e) => e.target === e.currentTarget && onSelect(null)}>
        {slides.map((s) => {
          const index = app.slides.indexOf(s);
          return (
            <figure
              key={s.id}
              id={`card-${s.id}`}
              className={`card ${s.id === selected ? 'selected' : ''} ${dropTarget === s.id ? 'drop' : ''} ${dragId === s.id ? 'dragging' : ''}`}
              draggable
              onClick={() => onSelect(s.id)}
              onDoubleClick={() => {
                onSelect(s.id);
                setViewing(true);
              }}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/x-slide', s.id);
                e.dataTransfer.effectAllowed = 'move';
                setDragId(s.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDropTarget(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setBoardDrop(false);
                setDropTarget(s.id);
              }}
              onDragLeave={() => setDropTarget((t) => (t === s.id ? null : t))}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDropTarget(null);
                if (hasFiles(e)) {
                  const files = imageFiles(e);
                  if (!files.length) return;
                  actions.setShot(s.id, files);
                  onSelect(s.id);
                  return;
                }
                const from = e.dataTransfer.getData('text/x-slide');
                if (!from || from === s.id) return;
                const order = app.slides.map((x) => x.id).filter((id) => id !== from);
                order.splice(order.indexOf(s.id) + (app.slides.findIndex((x) => x.id === from) < index ? 1 : 0), 0, from);
                actions.reorder(order);
              }}
            >
              {/* Frame name above the frame, like a design tool. */}
              <figcaption className="frame-label" style={{ width: Math.round((W / H) * height) }}>
                <span className="frame-name">
                  {index + 1}
                  <span className="frame-title">{s.role === 'hero' ? 'Hero · ' : ''}{s.headline.replace(/\*/g, '').replace(/\n/g, ' ') || 'Untitled'}</span>
                </span>
                {!s.shots[device] && <span className="mark missing">No {DEVICES[device].label}</span>}
                <SlideHints slide={s} position={exportOrder.indexOf(s.id)} />
              </figcaption>
              <Scaled app={app} slide={s} device={device} height={height} editing />
              <button
                className="expand"
                title="Full screen (double-click)"
                aria-label={`Show slide ${index + 1} full screen`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(s.id);
                  setViewing(true);
                }}
              >
                <Maximize2 size={14} />
              </button>

            </figure>
          );
        })}

        <div className="add-tile" style={{ height, width: Math.round((W / H) * height) }}>
          <ImagePlus size={28} strokeWidth={1.5} />
          <p>Drop screenshots anywhere on the board, or paste one with ⌘V.</p>
          <FilePick multiple onFiles={actions.ingest} className="btn primary">
            Add screenshots
          </FilePick>
          <button className="btn ghost" onClick={() => actions.addSlide()}>
            <Plus size={14} /> Blank slide
          </button>
        </div>
      </div>
      {viewing && active && selected && (
        <SlideViewer app={app} device={device} slideId={selected} onSelect={onSelect} onClose={() => setViewing(false)} />
      )}
    </div>
  );
}

function SlideHints({ slide, position }: { slide: Parameters<typeof checkSlide>[0]; position: number }) {
  const issues = checkSlide(slide);
  const errors = issues.filter((i) => i.level === 'error').length;
  return (
    <>
      {position >= 0 && position < SEARCH_RESULT_SLOTS && (
        <span className="search-hint" title="The first three screenshots can appear in App Store search results">
          <Search size={11} aria-label="Can appear in search results" />
        </span>
      )}
      {issues.length > 0 && (
        <span className={`issue-dot ${errors ? 'error' : ''}`} title={issues.map((i) => i.message).join('\n')}>
          <TriangleAlert size={13} /> {issues.length}
        </span>
      )}
    </>
  );
}
