import { useRef, useState, type PointerEvent } from 'react';
import type { Asset, Rect } from '../shared/types';

const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Drag a box on the screenshot to mark the part that's lifted out as a callout. */
export function CalloutPicker({
  src,
  asset,
  value,
  onChange,
}: {
  src: string;
  asset: Asset;
  value: Rect | null | undefined;
  onChange: (r: Rect) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);

  const point = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };
  const rectFrom = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  });

  const shown = draft ?? value;
  return (
    <div
      ref={box}
      className="callout-picker"
      // Width from a 420px max height, so the box is exactly the screenshot and fractions line up.
      style={{ aspectRatio: `${asset.width} / ${asset.height}`, width: `min(100%, ${Math.round((420 * asset.width) / asset.height)}px)` }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = point(e);
        setStart(p);
        setDraft({ ...p, w: 0, h: 0 });
      }}
      onPointerMove={(e) => start && setDraft(rectFrom(start, point(e)))}
      onPointerUp={(e) => {
        if (!start) return;
        const r = rectFrom(start, point(e));
        setStart(null);
        setDraft(null);
        // Ignore stray clicks; a callout needs some size.
        if (r.w > 0.04 && r.h > 0.01) onChange(r);
      }}
    >
      <img src={src} alt="" draggable={false} />
      {shown && shown.w > 0 && (
        <div
          className="callout-rect"
          style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%`, width: `${shown.w * 100}%`, height: `${shown.h * 100}%` }}
        />
      )}
    </div>
  );
}
