import { Copy, Crown, Plus, Trash2 } from 'lucide-react';
import type { App, DeviceId } from '../shared/types';
import { setList, setView, PRIMARY_SET } from '../shared/sets';
import type { EditorActions } from '../Editor';
import { Pasteboard } from './Pasteboard';
import { TextInput } from './controls';

/**
 * Every screenshot set of the app on one canvas, a row each. Selecting a slide in a row makes that set the
 * active one: the inspector's Slide and Style tabs then edit that set only.
 */
export function SetsBoard({
  app,
  device,
  zoom,
  activeSet,
  selected,
  onSelect,
  actionsFor,
  sets,
}: {
  app: App;
  device: DeviceId;
  zoom: number;
  activeSet: string;
  selected: string | null;
  onSelect: (setId: string, slideId: string | null) => void;
  actionsFor: (setId: string) => EditorActions;
  sets: {
    create: (from: string | null, blank?: boolean) => void;
    rename: (setId: string, name: string) => void;
    remove: (setId: string) => void;
    makePrimary: (setId: string) => void;
  };
}) {
  const list = setList(app);
  // With several sets, rows are a little smaller so more fit on screen.
  const rowZoom = list.length > 1 ? Math.round(zoom * 0.72) : zoom;
  return (
    <div className="pasteboard sets" onClick={(e) => e.target === e.currentTarget && onSelect(activeSet, null)}>
      {list.map((s) => {
        const active = s.id === activeSet;
        return (
          <section key={s.id} className={`set-row ${active ? 'active' : ''}`} aria-label={`${s.name} set`}>
            <header className="set-head" onClick={() => onSelect(s.id, null)}>
              <div className="set-name" onClick={(e) => e.stopPropagation()}>
                <TextInput commitOnBlur value={s.name} onChange={(v) => v.trim() && sets.rename(s.id, v.trim())} />
              </div>
              {s.primary ? <span className="set-badge">Primary</span> : <span className="set-badge test">Test</span>}
              <span className="muted small">{s.slides} slides</span>
              <div className="row tight set-actions" onClick={(e) => e.stopPropagation()}>
                <button className="btn small ghost" title="Copy this set's slides and style into a new set" onClick={() => sets.create(s.id)}>
                  <Copy size={14} /> Duplicate
                </button>
                {!s.primary && (
                  <>
                    <button className="btn small ghost" title="Use this set as the primary one" onClick={() => sets.makePrimary(s.id)}>
                      <Crown size={14} /> Make primary
                    </button>
                    <button
                      className="icon-btn danger"
                      title="Delete set"
                      onClick={() => confirm(`Delete the "${s.name}" set and its slides? Screenshot files stay in the app.`) && sets.remove(s.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </header>
            <Pasteboard
              embedded
              active={active}
              app={setView(app, s.id === PRIMARY_SET ? null : s.id)}
              device={device}
              zoom={rowZoom}
              selected={active ? selected : null}
              onSelect={(id) => onSelect(s.id, id)}
              actions={actionsFor(s.id)}
            />
          </section>
        );
      })}
      <div className="set-add">
        <button className="btn ghost" onClick={() => sets.create(activeSet)}>
          <Plus size={14} /> New set from “{list.find((x) => x.id === activeSet)?.name}”
        </button>
        <button className="btn ghost" onClick={() => sets.create(activeSet, true)}>
          <Plus size={14} /> Blank set
        </button>
        <span className="muted small">Try other screenshots, words or styles without touching your primary set.</span>
      </div>
    </div>
  );
}
