import { useState } from 'react';
import { Download, X } from 'lucide-react';
import type { App, CreativeId, DeviceId } from '../shared/types';
import { CREATIVE_IDS } from '../shared/types';
import { CREATIVES } from '../shared/creatives';
import { setName } from '../shared/sets';
import { DEVICES, exportSizes, slideInDevice } from '../shared/devices';
import { api } from '../api';
import { languageName, untranslated } from '../shared/locales';
import { at } from '../base';

export function ExportDialog({ app, device, onClose }: { app: App; device: DeviceId; onClose: () => void }) {
  const [devices, setDevices] = useState<DeviceId[]>([device]);
  const [creatives, setCreatives] = useState<CreativeId[]>(() => CREATIVE_IDS.filter((c) => app.creatives[c].enabled));
  const [sizes, setSizes] = useState(() => Object.fromEntries(app.devices.map((d) => [d, exportSizes(app, d)])) as Record<DeviceId, string[]>);
  const all = [app.baseLanguage, ...app.languages];
  const [languages, setLanguages] = useState<string[]>(all);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ dir: string; zipUrl: string | null; files: unknown[]; creatives?: unknown[]; untranslated?: { language: string; position: number }[] } | null>(null);
  const [error, setError] = useState('');

  const count = (d: DeviceId) =>
    app.slides.filter((s) => slideInDevice(s, d)).length;

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.export(app.id, { devices, sizes, creatives, languages: app.languages.length ? languages : undefined }, app.activeSet);
      setResult(r);
      if (r.zipUrl) {
        const a = document.createElement('a');
        a.href = at(r.zipUrl);
        a.download = '';
        a.click();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal aria-labelledby="export-title">
        <header className="row spread">
          <h2 id="export-title">Export {app.sets.length ? `“${setName(app)}”` : 'screenshots'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <p className="muted">PNGs at exact App Store Connect sizes, numbered in listing order, one folder per size.</p>
        <div className="export-devices">
          {app.devices.map((d) => (
            <div key={d} className="export-device">
              <label className="check">
                <input
                  type="checkbox"
                  checked={devices.includes(d)}
                  onChange={(e) => setDevices((x) => (e.target.checked ? [...x, d] : x.filter((y) => y !== d)))}
                />
                <strong className="grow">{DEVICES[d].label}</strong>
                <span className="muted small">{count(d)} screenshots</span>
              </label>
              {devices.includes(d) && (
                <div className="export-sizes">
                  {Object.keys(DEVICES[d].sizes).map((k) => (
                    <label key={k} className="check">
                      <input
                        type="checkbox"
                        checked={sizes[d]?.includes(k) ?? false}
                        onChange={(e) =>
                          setSizes((x) => ({ ...x, [d]: e.target.checked ? [...(x[d] ?? []), k] : (x[d] ?? []).filter((y) => y !== k) }))
                        }
                      />
                      {k}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {CREATIVE_IDS.some((c) => app.creatives[c].enabled) && (
          <div className="export-devices">
            <div className="export-device">
              <strong>Product page</strong>
              <div className="export-sizes">
                {CREATIVE_IDS.filter((c) => app.creatives[c].enabled).map((c) => {
                  const [w, h] = CREATIVES[c].sizes[CREATIVES[c].defaultSize];
                  return (
                    <label key={c} className="check">
                      <input
                        type="checkbox"
                        checked={creatives.includes(c)}
                        onChange={(e) => setCreatives((x) => (e.target.checked ? [...x, c] : x.filter((y) => y !== c)))}
                      />
                      {CREATIVES[c].label} {w} × {h}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {app.languages.length > 0 && (
          <div className="export-devices">
            <div className="export-device">
              <strong>Languages</strong>
              <span className="muted small">One folder per language</span>
              <div className="export-sizes">
                {all.map((l) => {
                  const todo = l === app.baseLanguage ? 0 : app.slides.filter((s) => untranslated(s, l).length).length;
                  return (
                    <label key={l} className="check">
                      <input
                        type="checkbox"
                        checked={languages.includes(l)}
                        onChange={(e) => setLanguages((x) => (e.target.checked ? [...x, l] : x.filter((y) => y !== l)))}
                      />
                      {languageName(l)}
                      {todo > 0 && <span className="muted small"> · {todo} untranslated</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {result && (
          <p className="success">
            Saved {result.files.length + (result.creatives?.length ?? 0)} files to <code>{result.dir}</code>
          </p>
        )}
        {!!result?.untranslated?.length && (
          <p className="muted small">
            Base-language text was used where a translation is missing:{' '}
            {[...new Set(result.untranslated.map((u) => u.language))]
              .map((l) => `${languageName(l)} (slides ${result.untranslated!.filter((u) => u.language === l).map((u) => u.position).join(', ')})`)
              .join('; ')}
          </p>
        )}
        <footer className="row end">
          <button className="btn ghost" onClick={onClose}>
            {result ? 'Done' : 'Cancel'}
          </button>
          <button className="btn primary" onClick={run} disabled={busy || (app.languages.length > 0 && !languages.length) || ((!devices.length || devices.every((d) => !count(d) || !sizes[d]?.length)) && !creatives.length)}>
            <Download size={15} /> {busy ? 'Rendering…' : 'Export and download zip'}
          </button>
        </footer>
      </div>
    </div>
  );
}
