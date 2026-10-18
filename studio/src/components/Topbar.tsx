import { BookOpen, Download, Languages, Laptop, PanelLeftOpen, PanelRightOpen, PanelTop, Smartphone, Tablet, TriangleAlert, ZoomIn } from 'lucide-react';
import type { App, DeviceId } from '../shared/types';
import { DEVICE_IDS } from '../shared/types';
import { DEVICES, slideInDevice } from '../shared/devices';
import { checkDevice } from '../shared/guidelines';
import { languageName, translationProgress } from '../shared/locales';

const ICONS = { iphone: Smartphone, duo: BookOpen, ipad: Tablet, mac: Laptop };

export function Topbar({
  app,
  device,
  onDevice,
  productPage,
  onProductPage,
  onToggleDevice,
  zoom,
  onZoom,
  onExport,
  panels,
  lang,
  onLang,
  onAddLanguage,
}: {
  /** translation language being edited; null is the base language */
  lang: string | null;
  onLang: (lang: string | null) => void;
  onAddLanguage: () => void;
  /** reopen buttons for closed side panels */
  panels: { left: boolean; right: boolean; openLeft: () => void; openRight: () => void };
  app: App;
  device: DeviceId;
  onDevice: (d: DeviceId) => void;
  productPage: boolean;
  onProductPage: () => void;
  onToggleDevice: (d: DeviceId) => void;
  zoom: number;
  onZoom: (z: number) => void;
  onExport: () => void;
}) {
  const inDevice = app.slides.filter((s) => slideInDevice(s, device));
  const issues = productPage ? [] : checkDevice(app, device).filter((i) => i.level === 'error');
  const creatives = Object.values(app.creatives).filter((c) => c.enabled).length;
  return (
    <>
    <header className="topbar">
      <div className="topbar-left">
      {!panels.left && (
        <button className="icon-btn" title="Show layers (⌘/Ctrl + \)" aria-label="Show layers panel" onClick={panels.openLeft}>
          <PanelLeftOpen size={15} />
        </button>
      )}
      <div className="device-tabs" role="tablist" aria-label="Device">
        {DEVICE_IDS.map((d) => {
          const Icon = ICONS[d];
          const enabled = app.devices.includes(d);
          return enabled ? (
            <button key={d} role="tab" aria-selected={!productPage && d === device} className={!productPage && d === device ? 'on' : ''} onClick={() => onDevice(d)}>
              <Icon size={15} /> {DEVICES[d].label}
            </button>
          ) : (
            <button key={d} className="add-device" onClick={() => onToggleDevice(d)} title={`Add ${DEVICES[d].label} screenshots. ${DEVICES[d].note}`}>
              <Icon size={15} /> {DEVICES[d].label}
            </button>
          );
        })}
        <button
          role="tab"
          aria-selected={productPage}
          className={`product-page-tab ${productPage ? 'on' : ''}`}
          onClick={onProductPage}
          title="Product page header and search results assets (iOS 27 and later)"
        >
          <PanelTop size={15} /> Product page
        </button>
      </div>
      </div>
      <div className="topbar-right">
        <label className={`lang-pick ${lang ? 'on' : ''}`} title="Language: edit and preview a translation">
          <Languages size={14} />
          <select
            value={lang ?? ''}
            onChange={(e) => (e.target.value === '+' ? onAddLanguage() : onLang(e.target.value || null))}
            aria-label="Language"
          >
            <option value="">{languageName(app.baseLanguage)}</option>
            {translationProgress(app).map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} {l.done < l.total ? `(${l.done}/${l.total})` : '✓'}
              </option>
            ))}
            <option value="+">Add language…</option>
          </select>
        </label>
        <label className="zoom" title="Preview size">
          <ZoomIn size={14} />
          <input type="range" min={300} max={900} step={20} value={zoom} onChange={(e) => onZoom(Number(e.target.value))} />
          <span>{Math.round((zoom / 520) * 100)}%</span>
        </label>
        <span className="tally">
          {productPage ? `${creatives} of 2 assets in export` : `${inDevice.length} of 10 screenshots`}
        </span>
        <button className="btn primary small" onClick={onExport} disabled={!inDevice.length && !creatives}>
          <Download size={14} /> Export
        </button>
        {!panels.right && (
          <button className="icon-btn" title="Show inspector (⌘/Ctrl + \)" aria-label="Show inspector" onClick={panels.openRight}>
            <PanelRightOpen size={15} />
          </button>
        )}
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
