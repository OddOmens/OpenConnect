import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Copy, FlipHorizontal, Layers, Plus, Search, Trash2, X } from 'lucide-react';
import type { App, DeviceId, EmojiStyle, Slide, Sticker } from '../shared/types';
import { DOODLES, seedOf } from '../render/rough';
import { DoodleSvg, emojiUrl } from '../render/stickers';
import { canvasSize } from '../shared/devices';
import type { EditorActions } from '../Editor';
import { ColorField, Field, Group, Segmented, Slider } from './controls';
import { Scaled } from './Scaled';

interface EmojiEntry {
  slug: string;
  name: string;
  glyph: string;
  group: string;
  keywords: string[];
  styles: string[];
}

// The emoji index is fetched once per session; it's ~1,600 entries.
let emojiCache: Promise<{ available: boolean; groups: string[]; emoji: EmojiEntry[] }> | null = null;
const loadEmoji = () => (emojiCache ??= fetch('/api/emoji').then((r) => r.json()));

const newId = () => Math.random().toString(36).slice(2, 10);

/** Stickers on one slide: pick emoji or doodles, then place, size, rotate and layer them. */
export function StickerPanel({ app, slide, device, actions }: { app: App; slide: Slide; device: DeviceId; actions: EditorActions }) {
  const stickers = slide.stickers ?? [];
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const save = (next: Sticker[]) => actions.patchSlide(slide.id, { stickers: next });
  const update = (id: string, p: Partial<Sticker>) => save(stickers.map((s) => (s.id === id ? { ...s, ...p } : s)));

  useEffect(() => {
    loadEmoji().then((d) => setNames(Object.fromEntries(d.emoji.map((e: EmojiEntry) => [e.slug, e.name]))));
  }, []);

  const add = (s: Omit<Sticker, 'id' | 'x' | 'y' | 'rotation' | 'layer' | 'opacity' | 'flip' | 'color'>) => {
    // Spread new stickers around the corners so they don't land on top of each other.
    const spots = [
      [0.82, 0.16],
      [0.18, 0.2],
      [0.85, 0.55],
      [0.15, 0.62],
      [0.5, 0.1],
    ];
    const [x, y] = spots[stickers.length % spots.length];
    const sticker: Sticker = { id: newId(), x, y, rotation: stickers.length % 2 ? 8 : -8, layer: 'front', opacity: 1, flip: false, color: '', ...s };
    save([...stickers, sticker]);
    setSelected(sticker.id);
    setPicking(false);
  };

  const current = stickers.find((s) => s.id === selected) ?? null;
  return (
    <Group
      title="Stickers"
      aside={
        <button className="btn small ghost" onClick={() => setPicking(true)}>
          <Plus size={14} /> Add
        </button>
      }
    >
      {!stickers.length ? (
        <p className="group-desc">3D emoji and hand-drawn doodles around the screenshot. Shadow is in Style.</p>
      ) : (
        <>
          <StickerPlacer app={app} slide={slide} device={device} selected={selected} onSelect={setSelected} onMove={(id, x, y) => update(id, { x, y })} />
          <ul className="sticker-list">
            {stickers.map((s) => (
              <li key={s.id}>
                <button className={`sticker-row ${s.id === selected ? 'on' : ''}`} onClick={() => setSelected(s.id === selected ? null : s.id)}>
                  <StickerThumb sticker={s} />
                  <span className="grow">{s.kind === 'emoji' ? names[s.ref] ?? s.ref : DOODLES[s.ref]?.label ?? s.ref}</span>
                  <span className="muted small">{s.layer === 'back' ? 'Behind' : 'In front'}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {current && (
        <div className="sticker-edit">
          {current.kind === 'emoji' && (
            <Field group label="Look">
              <Segmented<EmojiStyle>
                value={current.style}
                options={[
                  { value: '3d', label: '3D', title: 'Best up to medium sizes' },
                  { value: 'color', label: 'Color', title: 'Sharp at any size' },
                  { value: 'flat', label: 'Flat' },
                ]}
                onChange={(v) => update(current.id, { style: v })}
              />
            </Field>
          )}
          <Field label="Size">
            <Slider value={current.size} min={40} max={700} step={5} onChange={(v) => update(current.id, { size: v })} />
          </Field>
          <Field label="Rotation">
            <Slider value={current.rotation} min={-180} max={180} format={(v) => `${v}°`} onChange={(v) => update(current.id, { rotation: v })} />
          </Field>
          <Field label="Opacity">
            <Slider value={current.opacity} min={0.1} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update(current.id, { opacity: v })} />
          </Field>
          {current.kind === 'doodle' && (
            <>
              <label className="check">
                <input type="checkbox" checked={!current.color} onChange={(e) => update(current.id, { color: e.target.checked ? '' : '#ffffff' })} />
                Use the highlight color
              </label>
              {current.color && <ColorField label="Color" value={current.color} onChange={(v) => update(current.id, { color: v })} />}
            </>
          )}
          <div className="row tight">
            <button className="btn small" onClick={() => update(current.id, { layer: current.layer === 'back' ? 'front' : 'back' })}>
              <Layers size={14} /> {current.layer === 'back' ? 'Bring in front' : 'Send behind'}
            </button>
            <button className="btn small" onClick={() => update(current.id, { flip: !current.flip })} title="Flip horizontally">
              <FlipHorizontal size={14} />
            </button>
            <button
              className="btn small"
              title="Duplicate"
              onClick={() => {
                const copy = { ...current, id: newId(), x: Math.min(0.95, current.x + 0.06), y: Math.min(0.95, current.y + 0.04) };
                save([...stickers, copy]);
                setSelected(copy.id);
              }}
            >
              <Copy size={14} />
            </button>
            <button
              className="icon-btn danger"
              title="Remove sticker"
              onClick={() => {
                save(stickers.filter((s) => s.id !== current.id));
                setSelected(null);
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      )}
      {picking && <StickerPicker onClose={() => setPicking(false)} onPick={add} />}
    </Group>
  );
}

function StickerThumb({ sticker, size = 28 }: { sticker: Sticker; size?: number }) {
  return sticker.kind === 'emoji' ? (
    <img src={emojiUrl(sticker.ref, sticker.style)} alt="" width={size} height={size} loading="lazy" />
  ) : (
    <span className="doodle-thumb" style={{ width: size, height: size }}>
      <DoodleSvg name={sticker.ref} width={size} color={sticker.color || 'currentColor'} seed={seedOf(sticker.id)} />
    </span>
  );
}

/** A small copy of the slide with a handle per sticker; drag a handle to move it. */
function StickerPlacer({
  app,
  slide,
  device,
  selected,
  onSelect,
  onMove,
}: {
  app: App;
  slide: Slide;
  device: DeviceId;
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const [W, H] = canvasSize(app, device);
  const height = W > H ? 180 : 320;
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const at = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  };
  // While dragging, the preview shows the sticker at its new spot without saving every move.
  const shown = drag ? { ...slide, stickers: slide.stickers.map((s) => (s.id === drag.id ? { ...s, x: drag.x, y: drag.y } : s)) } : slide;
  return (
    <div className="sticker-placer" ref={box} style={{ width: Math.round((W / H) * height), height }}>
      <Scaled app={app} slide={shown} device={device} height={height} />
      {shown.stickers.map((s) => (
        <span
          key={s.id}
          className={`sticker-handle ${s.id === selected ? 'on' : ''}`}
          style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}
          title="Drag to move"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            onSelect(s.id);
            setDrag({ id: s.id, ...at(e) });
          }}
          onPointerMove={(e) => drag?.id === s.id && setDrag({ id: s.id, ...at(e) })}
          onPointerUp={(e) => {
            if (drag?.id !== s.id) return;
            const p = at(e);
            setDrag(null);
            onMove(s.id, Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000);
          }}
        />
      ))}
    </div>
  );
}

/** Emoji (3D, Color or Flat) and doodles, searchable. */
function StickerPicker({ onPick, onClose }: { onPick: (s: Pick<Sticker, 'kind' | 'ref' | 'style' | 'size'>) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'emoji' | 'doodle'>('emoji');
  const [style, setStyle] = useState<EmojiStyle>('3d');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [data, setData] = useState<{ available: boolean; groups: string[]; emoji: EmojiEntry[] } | null>(null);
  const [limit, setLimit] = useState(240);
  useEffect(() => {
    loadEmoji().then(setData);
  }, []);
  useEffect(() => setLimit(240), [q, group]);
  const hits = useMemo(() => {
    if (!data) return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return data.emoji.filter(
      (e) => (!group || e.group === group) && words.every((w) => `${e.name} ${e.keywords.join(' ')}`.toLowerCase().includes(w)),
    );
  }, [data, q, group]);

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal sticker-picker" role="dialog" aria-modal aria-label="Add a sticker">
        <header className="row spread">
          <Segmented
            value={tab}
            options={[
              { value: 'emoji', label: 'Emoji' },
              { value: 'doodle', label: 'Doodles' },
            ]}
            onChange={setTab}
          />
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        {tab === 'emoji' ? (
          data && !data.available ? (
            <p className="muted">
              Emoji aren’t downloaded yet. Run <code>npm run setup:emoji</code> in the OpenAppShot folder, then rebuild.
            </p>
          ) : (
            <>
              <div className="row">
                <label className="sticker-search grow">
                  <Search size={14} />
                  <input autoFocus placeholder="Search emoji (fire, rocket, mic…)" value={q} onChange={(e) => setQ(e.target.value)} />
                </label>
                <Segmented<EmojiStyle>
                  value={style}
                  options={[
                    { value: '3d', label: '3D' },
                    { value: 'color', label: 'Color' },
                    { value: 'flat', label: 'Flat' },
                  ]}
                  onChange={setStyle}
                />
              </div>
              <div className="chip-row">
                {['', ...(data?.groups ?? [])].map((g) => (
                  <button key={g || 'all'} className={`chip ${group === g ? 'on' : ''}`} onClick={() => setGroup(g)}>
                    {g || 'All'}
                  </button>
                ))}
              </div>
              <div className="sticker-grid">
                {hits.slice(0, limit).map((e) => (
                  <button key={e.slug} title={e.name} onClick={() => onPick({ kind: 'emoji', ref: e.slug, style, size: 200 })}>
                    <img src={emojiUrl(e.slug, style)} alt={e.name} loading="lazy" width={44} height={44} />
                  </button>
                ))}
              </div>
              {hits.length > limit && (
                <button className="btn small ghost" onClick={() => setLimit((l) => l + 480)}>
                  Show more ({hits.length - limit})
                </button>
              )}
              <p className="muted small">Fluent Emoji by Microsoft, MIT licensed. Bundled locally.</p>
            </>
          )
        ) : (
          <div className="sticker-grid doodles">
            {Object.entries(DOODLES).map(([name, d]) => (
              <button key={name} title={d.label} onClick={() => onPick({ kind: 'doodle', ref: name, style: '3d', size: 260 })}>
                <DoodleSvg name={name} width={56} color="currentColor" seed={7} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
