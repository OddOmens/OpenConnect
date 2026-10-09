import { useState } from 'react';
import { Images, Monitor, Moon, Plus, Sun, Trash2 } from 'lucide-react';
import { useColorTheme, type ColorTheme } from '../theme';
import type { AppSummary } from '../shared/types';
import { PRESETS } from '../shared/presets';
import { assetUrl } from '../render/SlideView';
import { DEVICES } from '../shared/devices';

export function AppRail({
  apps,
  current,
  onSelect,
  onCreate,
  onDelete,
}: {
  apps: AppSummary[];
  current: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string, preset: string) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [theme, setTheme] = useColorTheme();
  return (
    <nav className="rail" aria-label="Apps">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <Images size={16} />
        </span>
        OpenAppShot
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
