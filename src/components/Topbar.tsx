import { BookOpen, Download, Laptop, Smartphone, Tablet, TriangleAlert, ZoomIn } from 'lucide-react';
import type { App, DeviceId } from '../shared/types';
import { DEVICE_IDS } from '../shared/types';
import { DEVICES, slideInDevice } from '../shared/devices';
import { checkDevice } from '../shared/guidelines';

const ICONS = { iphone: Smartphone, duo: BookOpen, ipad: Tablet, mac: Laptop };

export function Topbar({
  app,
  device,
  onDevice,
  onToggleDevice,
  zoom,
  onZoom,
  onExport,
}: {
  app: App;
  device: DeviceId;
  onDevice: (d: DeviceId) => void;
  onToggleDevice: (d: DeviceId) => void;
  zoom: number;
  onZoom: (z: number) => void;
  onExport: () => void;
}) {
  const inDevice = app.slides.filter((s) => slideInDevice(s, device));
  const issues = checkDevice(app, device).filter((i) => i.level === 'error');
  return (
    <>
    <header className="topbar">
      <div className="device-tabs" role="tablist" aria-label="Device">
        {DEVICE_IDS.map((d) => {
          const Icon = ICONS[d];
          const enabled = app.devices.includes(d);
          return enabled ? (
            <button key={d} role="tab" aria-selected={d === device} className={d === device ? 'on' : ''} onClick={() => onDevice(d)}>
              <Icon size={15} /> {DEVICES[d].label}
            </button>
          ) : (
            <button key={d} className="add-device" onClick={() => onToggleDevice(d)} title={`Add ${DEVICES[d].label} screenshots. ${DEVICES[d].note}`}>
              <Icon size={15} /> {DEVICES[d].label}
            </button>
          );
        })}
      </div>
      <div className="topbar-right">
        <label className="zoom" title="Preview size">
          <ZoomIn size={15} />
          <input type="range" min={300} max={900} step={20} value={zoom} onChange={(e) => onZoom(Number(e.target.value))} />
        </label>
        <span className="tally">
          {inDevice.length} of 10 screenshots
        </span>
        <button className="btn primary" onClick={onExport} disabled={!inDevice.length}>
          <Download size={15} /> Export
        </button>
      </div>
    </header>
    {issues.map((i) => (
      <div key={i.message} className="device-alert error" role="alert">
        <TriangleAlert size={15} /> {i.message}
      </div>
    ))}
    </>
  );
}
