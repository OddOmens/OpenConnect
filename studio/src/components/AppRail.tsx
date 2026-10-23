import { useState } from 'react';
import { Frame, Images, LayoutGrid, Monitor, Moon, PanelLeftClose, Plus, Sun, Trash2 } from 'lucide-react';
import { UI_SCALES, useColorTheme, type ColorTheme, type UiScale } from '../theme';
import type { App, AppSummary } from '../shared/types';
import { setList, setView, PRIMARY_SET } from '../shared/sets';
import { PRESETS } from '../shared/presets';
import { assetUrl } from '../render/SlideView';
import { DEVICES } from '../shared/devices';

export function AppRail({
  apps,
  current,
  onSelect,
  onCreate,
  onDelete,
  layers,
  onClose,
  ui,
}: {
  onClose: () => void;
  /** interface size: setting, setter, and the size in effect */
  ui: [UiScale, (s: UiScale) => void, number];
  /** the open app's sets and frames, like a design tool's layers panel */
  layers?: { app: App; activeSet: string; selected: string | null; onSelect: (setId: string, slideId: string | null) => void } | null;
  apps: AppSummary[];
  current: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string, preset: string) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [theme, setTheme] = useColorTheme();
  const [uiScale, setUiScale, uiValue] = ui;
  return (
    <nav className="rail" aria-label="Apps">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <Images size={16} />
        </span>
        Studio
        <button className="icon-btn panel-toggle" title="Hide panel (⌘/Ctrl + \ hides all)" aria-label="Hide layers panel" onClick={onClose}>
          <PanelLeftClose size={15} />
        </button>
      </div>
      <div className="rail-label">Apps</div>
      <ul className="rail-list">
        {apps.map((a) => {
          const counts = a.devices.map((d) => `${a.counts?.[d] ?? 0} ${DEVICES[d].label}`).join(' · ');
          return (
            <li key={a.id}>
              <button className={`rail-app ${a.id === current ? 'on' : ''}`} onClick={() => onSelect(a.id)}>
                {a.iconAssetId ? (
                  <img className="rail-icon" src={assetUrl(a.id, a.iconAssetId)} alt="" />
                ) : (
                  <span className="rail-icon blank">{a.name.slice(0, 1)}</span>
                )}
                <span className="rail-text">
                  <span className="rail-name">{a.name}</span>
                  <span className="rail-meta">{a.slideCount ? counts : 'No screenshots yet'}</span>
                </span>
              </button>
              {a.id === current && (
                <button
                  className="rail-delete"
                  title={`Delete ${a.name}`}
                  onClick={() => confirm(`Delete ${a.name} and all its screenshots?`) && onDelete(a.id)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {layers && <Layers {...layers} />}
      <div className="rail-foot">
        {adding ? (
          <NewAppForm
            onCancel={() => setAdding(false)}
            onCreate={(n, p) => {
              onCreate(n, p);
              setAdding(false);
            }}
          />
        ) : (
          <button className="btn rail-new" onClick={() => setAdding(true)}>
            <Plus size={16} /> New app
          </button>
        )}
        <label className="ui-size">
          Interface size
          <select value={String(uiScale)} onChange={(e) => setUiScale((e.target.value === 'auto' ? 'auto' : Number(e.target.value)) as UiScale)}>
            {UI_SCALES.map((s) => (
              <option key={String(s)} value={String(s)}>
                {s === 'auto' ? `Auto (${Math.round(uiValue * 100)}%)` : `${Math.round(s * 100)}%`}
              </option>
            ))}
          </select>
        </label>
        <div className="theme-switch" role="radiogroup" aria-label="Appearance">
          {(
            [
              ['light', Sun, 'Light'],
              ['dark', Moon, 'Dark'],
              ['system', Monitor, 'Match system'],
            ] as [ColorTheme, typeof Sun, string][]
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={theme === value}
              aria-label={label}
              title={label}
              className={theme === value ? 'on' : ''}
              onClick={() => setTheme(value)}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

function Layers({ app, activeSet, selected, onSelect }: NonNullable<Parameters<typeof AppRail>[0]['layers']>) {
  const reveal = (id: string) =>
    requestAnimationFrame(() => document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }));
  return (
    <div className="layers">
      <div className="rail-label">Layers</div>
      <ul className="layer-list" role="tree" aria-label="Sets and slides">
        {setList(app).map((set) => {
          const view = setView(app, set.id === PRIMARY_SET ? null : set.id);
          return (
            <li key={set.id} role="treeitem" aria-expanded>
              <button
                className={`layer set ${set.id === activeSet && !selected ? 'on' : ''} ${set.id === activeSet ? 'current' : ''}`}
                onClick={() => onSelect(set.id, null)}
              >
                <LayoutGrid size={13} />
                <span className="layer-name">{set.name}</span>
                {set.primary && set.name.toLowerCase() !== 'primary' && <span className="layer-tag">Primary</span>}
              </button>
              <ul role="group">
                {view.slides.map((s, i) => (
                  <li key={s.id} role="treeitem">
                    <button
                      className={`layer frame ${s.id === selected ? 'on' : ''}`}
                      onClick={() => {
                        onSelect(set.id, s.id);
                        reveal(s.id);
                      }}
                    >
                      <Frame size={12} />
                      <span className="layer-name">
                        {i + 1} {s.headline.replace(/\*/g, '').replace(/\n/g, ' ') || 'Untitled'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function NewAppForm({ onCreate, onCancel }: { onCreate: (name: string, preset: string) => void; onCancel?: () => void }) {
  const [name, setName] = useState('');
  const [preset, setPreset] = useState(PRESETS[0].id);
  return (
    <form
      className="new-app"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onCreate(name.trim(), preset);
      }}
    >
      <input autoFocus placeholder="App name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="preset-row" role="radiogroup" aria-label="Starting style">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={p.id === preset}
            title={p.label}
            className={`preset-dot ${p.id === preset ? 'on' : ''}`}
            style={{ background: p.theme.palettes.primary.background.color }}
            onClick={() => setPreset(p.id)}
          >
            <span style={{ background: p.theme.palettes.primary.accentColor }} />
          </button>
        ))}
      </div>
      <div className="row">
        <button className="btn primary" type="submit" disabled={!name.trim()}>
          Create app
        </button>
        {onCancel && (
          <button className="btn ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
