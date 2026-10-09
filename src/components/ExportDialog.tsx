import { useState } from 'react';
import { Download, X } from 'lucide-react';
import type { App, DeviceId } from '../shared/types';
import { DEVICES, exportSizes, slideInDevice } from '../shared/devices';
import { api } from '../api';

export function ExportDialog({ app, device, onClose }: { app: App; device: DeviceId; onClose: () => void }) {
  const [devices, setDevices] = useState<DeviceId[]>([device]);
  const [sizes, setSizes] = useState(() => Object.fromEntries(app.devices.map((d) => [d, exportSizes(app, d)])) as Record<DeviceId, string[]>);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ dir: string; zipUrl: string | null; files: unknown[] } | null>(null);
  const [error, setError] = useState('');

  const count = (d: DeviceId) =>
    app.slides.filter((s) => slideInDevice(s, d)).length;

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.export(app.id, { devices, sizes });
      setResult(r);
      if (r.zipUrl) {
        const a = document.createElement('a');
        a.href = r.zipUrl;
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
          <h2 id="export-title">Export screenshots</h2>
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
        {error && <p className="error">{error}</p>}
        {result && (
          <p className="success">
            Saved {result.files.length} files to <code>{result.dir}</code>
          </p>
        )}
        <footer className="row end">
          <button className="btn ghost" onClick={onClose}>
            {result ? 'Done' : 'Cancel'}
          </button>
          <button className="btn primary" onClick={run} disabled={busy || !devices.length || devices.every((d) => !count(d) || !sizes[d]?.length)}>
            <Download size={15} /> {busy ? 'Rendering…' : 'Export and download zip'}
          </button>
        </footer>
      </div>
    </div>
  );
}
