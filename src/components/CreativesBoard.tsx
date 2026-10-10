import { useState } from 'react';
import type { App, CreativeId } from '../shared/types';
import { CREATIVE_IDS } from '../shared/types';
import { CREATIVES } from '../shared/creatives';
import { CreativeView } from '../render/CreativeView';
import { PRIMARY_SET, setList } from '../shared/sets';

/** The Product page view: the header and search results assets side by side, with Apple's safe area. */
export function CreativesBoard({
  app,
  zoom,
  selected,
  onSelect,
  onSet,
}: {
  /** a view of the active set */
  app: App;
  onSet: (setId: string) => void;
  zoom: number;
  selected: CreativeId | null;
  onSelect: (id: CreativeId | null) => void;
}) {
  const [guide, setGuide] = useState(true);
  // Both cards are the same width, stacked, so the header's wide crop and the 3:2 search asset compare
  // directly; zoom sets the size.
  const height = (id: CreativeId) => {
    const [W, H] = CREATIVES[id].sizes[CREATIVES[id].defaultSize];
    return Math.round((zoom * 1.6 * H) / W);
  };
  return (
    <div className="pasteboard" onClick={(e) => e.target === e.currentTarget && onSelect(null)}>
      <div className="creatives-bar">
        <label className="check">
          <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} />
          Show Apple’s safe area
        </label>
        {app.sets.length > 0 && (
          <label className="row tight">
            <span className="muted small">Set</span>
            <select value={app.activeSet ?? PRIMARY_SET} onChange={(e) => onSet(e.target.value)}>
              {setList(app).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="muted small">Each set has its own header and search results asset. Shown on iOS 27 and iPadOS 27 and later.</span>
      </div>
      <div className="strip creatives" onClick={(e) => e.target === e.currentTarget && onSelect(null)}>
        {CREATIVE_IDS.map((id) => {
          const spec = CREATIVES[id];
          const [W, H] = spec.sizes[spec.defaultSize];
          const h = height(id);
          const s = h / H;
          const c = app.creatives[id];
          return (
            <figure key={id} className={`card ${selected === id ? 'selected' : ''}`} onClick={() => onSelect(id)}>
              <figcaption className="frame-label" style={{ width: Math.round(W * s) }}>
                <span className="frame-name">
                  <span className="frame-title">{spec.label}</span>
                  <span className="frame-size">
                    {W} × {H}
                  </span>
                </span>
                {!c.enabled && <span className="mark missing">Not exported</span>}
              </figcaption>
              <div className="scaled" style={{ width: Math.round(W * s), height: h }}>
                <div style={{ width: W, height: H, transform: `scale(${s})`, transformOrigin: '0 0' }}>
                  <CreativeView app={app} id={id} safeGuide={guide} />
                </div>
              </div>

            </figure>
          );
        })}
      </div>
    </div>
  );
}
