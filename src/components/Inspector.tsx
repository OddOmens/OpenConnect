import { CircleAlert, Copy, ImageUp, Trash2, TriangleAlert, X } from 'lucide-react';
import type { App, AppProfile, Asset, Background, DeviceId, Layout, Palette, PaletteKey, Slide } from '../shared/types';
import { DEVICE_IDS } from '../shared/types';
import { DEVICES, exportSizes } from '../shared/devices';
import { checkSlide } from '../shared/guidelines';
import { FONTS, PRESETS } from '../shared/presets';
import { assetUrl } from '../render/SlideView';
import type { EditorActions } from '../Editor';
import { ColorField, Field, FilePick, Group, Segmented, Slider, TextInput } from './controls';

const LAYOUT_OPTIONS: { value: Layout; label: string; title: string }[] = [
  { value: 'top', label: 'Text on top', title: 'Headline above, screenshot below' },
  { value: 'bottom', label: 'Text below', title: 'Screenshot above, headline below' },
  { value: 'side', label: 'Side by side', title: 'Headline left, screenshot right' },
];

export type InspectorTab = 'slide' | 'style' | 'app';

export function Inspector({
  app,
  device,
  slide,
  tab,
  onTab,
  actions,
}: {
  app: App;
  device: DeviceId;
  slide: Slide | null;
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  actions: EditorActions;
}) {
  const tabs: [InspectorTab, string][] = [
    ['slide', 'Slide'],
    ['style', 'Style'],
    ['app', 'App'],
  ];
  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="inspector-tabs">
        <div className="tabs-list" role="tablist">
          {tabs.map(([value, label]) => (
            <button key={value} role="tab" aria-selected={tab === value} className={tab === value ? 'on' : ''} onClick={() => onTab(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="inspector-body">
        {tab === 'slide' &&
          (slide ? (
            <SlidePanel app={app} device={device} slide={slide} actions={actions} />
          ) : (
            <p className="empty-note">Select a slide to edit its words and screenshot. Colors, layout and type are in Style and apply to every slide.</p>
          ))}
        {tab === 'style' && <StylePanel app={app} actions={actions} />}
        {tab === 'app' && <AppInfoPanel app={app} actions={actions} />}
      </div>
    </aside>
  );
}

/** A slide is only its words and screenshot; everything visual is app-wide in Style. */
function SlidePanel({ app, device, slide, actions }: { app: App; device: DeviceId; slide: Slide; actions: EditorActions }) {
  const patch = (p: unknown) => actions.patchSlide(slide.id, p);
  const shot = slide.shots[device] ? app.assets[slide.shots[device]!] : null;
  const index = app.slides.findIndex((s) => s.id === slide.id);
  const label = DEVICES[device].label;
  const issues = checkSlide(slide);

  return (
    <>
      <Group
        title={`Slide ${index + 1}`}
        aside={
          <div className="row tight">
            <button className="icon-btn" title="Duplicate slide" onClick={() => actions.duplicateSlide(slide.id)}>
              <Copy size={15} />
            </button>
            <button className="icon-btn danger" title="Delete slide" onClick={() => confirm('Delete this slide?') && actions.deleteSlide(slide.id)}>
              <Trash2 size={15} />
            </button>
          </div>
        }
      >
        <Field label="Headline" hint="Wrap words in *asterisks* to color them. Press Return for a new line.">
          <TextInput multiline rows={3} value={slide.headline} onChange={(v) => patch({ headline: v })} />
        </Field>
        <Field label="Subtitle">
          <TextInput multiline rows={2} value={slide.subtitle} placeholder="Optional" onChange={(v) => patch({ subtitle: v })} />
        </Field>
        {issues.length > 0 && (
          <ul className="issues" aria-label="App Store guideline checks">
            {issues.map((i) => (
              <li key={i.message} className={i.level}>
                {i.level === 'error' ? <CircleAlert size={14} /> : <TriangleAlert size={14} />}
                {i.message}
              </li>
            ))}
          </ul>
        )}
      </Group>

      <Group title={`${label} screenshot`}>
        <ShotRow
          app={app}
          asset={shot}
          label="Screenshot"
          onFiles={(f) => actions.setShot(slide.id, f)}
          onClear={() => patch({ shots: { [device]: null } })}
        />
      </Group>

      <Group title="Screen">
        <Field label="Screen shown">
          <TextInput value={slide.screen?.name ?? ''} placeholder="e.g. Stats tab" onChange={(v) => patch({ screen: { name: v } })} />
        </Field>
        <Field label="How to get there" hint="Used to re-capture this screen later.">
          <TextInput
            multiline
            rows={2}
            value={slide.screen?.notes ?? ''}
            placeholder="Tab bar → Stats, demo account with 2 weeks of data"
            onChange={(v) => patch({ screen: { notes: v } })}
          />
        </Field>
      </Group>
    </>
  );
}

function ShotRow({
  app,
  asset,
  label,
  onFiles,
  onClear,
}: {
  app: App;
  asset: Asset | null | undefined;
  label: string;
  onFiles: (f: File[]) => void;
  onClear: () => void;
}) {
  return (
    <div className="shot-row">
      <div className="shot-thumb">{asset ? <img src={assetUrl(app.id, asset.id)} alt="" /> : <ImageUp size={18} />}</div>
      <div className="shot-info">
        <strong>{label}</strong>
        <span className="muted small">
          {asset ? `${asset.width} × ${asset.height}` : 'None yet — drop one on the slide'}
        </span>
        {asset && <span className="muted small">{describeSource(asset)}</span>}
        <div className="row tight">
          <FilePick onFiles={onFiles} className="btn small">
            {asset ? 'Replace' : 'Choose'}
          </FilePick>
          {asset && (
            <button className="icon-btn" title="Remove screenshot" onClick={onClear}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BackgroundImage({
  app,
  bg,
  actions,
  onChange,
}: {
  app: App;
  bg: Background;
  actions: EditorActions;
  onChange: (b: Partial<Background>) => void;
}) {
  return (
    <div className="bg-image">
      <div className="row spread">
        <span className="field-label">Background photo</span>
        <div className="row tight">
          <FilePick
            className="btn small"
            onFiles={async ([f]) => {
              const id = await actions.uploadBackground(f);
              if (id) onChange({ type: 'image', imageAssetId: id });
            }}
          >
            {bg.imageAssetId ? 'Replace' : 'Choose'}
          </FilePick>
          {bg.imageAssetId && (
            <button className="icon-btn" title="Remove photo" onClick={() => onChange({ type: 'solid', imageAssetId: null })}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      {bg.imageAssetId && (
        <>
          <img className="bg-thumb" src={assetUrl(app.id, bg.imageAssetId)} alt="" />
          <Field label="Darken">
            <Slider value={bg.overlay} min={0} max={0.9} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => onChange({ overlay: v })} />
          </Field>
        </>
      )}
    </div>
  );
}

/** Every setting here applies to all slides in the app. */
function StylePanel({ app, actions }: { app: App; actions: EditorActions }) {
  const t = app.theme;
  const patch = actions.patchApp;
  const theme = (p: unknown) => patch({ theme: p });

  return (
    <>
      <Group title="Theme">
        <p className="group-desc">
          Everything in Style applies to every slide on every device — iPhone, iPhone Duo, iPad and Mac. A theme changes colors and
          type; your layout and screenshot size stay.
        </p>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`preset-card ${t.presetId === p.id ? 'on' : ''}`}
              aria-pressed={t.presetId === p.id}
              onClick={() => patch({ preset: p.id })}
              style={{ background: p.theme.palettes.primary.background.color, color: p.theme.palettes.primary.textColor, fontFamily: `"${p.theme.fontFamily}"` }}
            >
              <span style={{ fontWeight: p.theme.headlineWeight }}>
                Aa <em style={{ color: p.theme.palettes.primary.accentColor, fontStyle: 'normal' }}>Bb</em>
              </span>
              <small>{p.label}</small>
              {p.theme.alternate && <span className="preset-alt" style={{ background: p.theme.palettes.alt.background.color }} />}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Layout">
        <Segmented value={t.layout} options={LAYOUT_OPTIONS} onChange={(v) => theme({ layout: v })} />
        <Field label="Text alignment">
          <Segmented value={t.align} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }]} onChange={(v) => theme({ align: v })} />
        </Field>
        <Field label="Screenshot size">
          <Slider value={t.shotScale} min={0.5} max={1.5} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => theme({ shotScale: v })} />
        </Field>
        <Field label="Screenshot position">
          <Slider value={t.shotOffsetY} min={-600} max={600} step={5} onChange={(v) => theme({ shotOffsetY: v })} />
        </Field>
      </Group>

      <PaletteEditor app={app} k="primary" actions={actions} />
      <Group title="Alternate colors">
        <label className="check">
          <input type="checkbox" checked={t.alternate} onChange={(e) => theme({ alternate: e.target.checked })} />
          Use a second color scheme on every other slide
        </label>
      </Group>
      {t.alternate && <PaletteEditor app={app} k="alt" actions={actions} />}

      <Group title="Type">
        <Field label="Typeface">
          <select value={t.fontFamily} onChange={(e) => theme({ fontFamily: e.target.value })} style={{ fontFamily: `"${t.fontFamily}"` }}>
            {FONTS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>
                {f.replace(' Variable', '').replace('-apple-system', 'SF Pro (system)')}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Weight">
          <Slider value={t.headlineWeight} min={300} max={900} step={50} onChange={(v) => theme({ headlineWeight: v })} />
        </Field>
        <Field label="Headline size">
          <Slider value={t.headlineSize} min={40} max={160} onChange={(v) => theme({ headlineSize: v })} />
        </Field>
        <Field label="Subtitle size">
          <Slider value={t.subtitleSize} min={20} max={80} onChange={(v) => theme({ subtitleSize: v })} />
        </Field>
        <Field label="Letter spacing">
          <Slider value={t.letterSpacing} min={-0.06} max={0.1} step={0.005} format={(v) => v.toFixed(3)} onChange={(v) => theme({ letterSpacing: v })} />
        </Field>
        <Field label="Line height">
          <Slider value={t.lineHeight} min={0.85} max={1.5} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => theme({ lineHeight: v })} />
        </Field>
      </Group>

      <Group title="Screenshot frame">
        <ColorField label="Stroke" value={t.frame.strokeColor} onChange={(v) => theme({ frame: { strokeColor: v } })} />
        <Field label="Stroke width">
          <Slider value={t.frame.strokeWidth} min={0} max={30} step={0.5} onChange={(v) => theme({ frame: { strokeWidth: v } })} />
        </Field>
        <Field label="Corner radius">
          <Slider value={t.frame.radius} min={0} max={20} step={0.25} format={(v) => `${v}%`} onChange={(v) => theme({ frame: { radius: v } })} />
        </Field>
        <Field label="Shadow">
          <Slider value={t.frame.shadow} min={0} max={0.8} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => theme({ frame: { shadow: v } })} />
        </Field>
      </Group>
    </>
  );
}

function AppInfoPanel({ app, actions }: { app: App; actions: EditorActions }) {
  const patch = actions.patchApp;
  const profile = (p: Partial<AppProfile>) => patch({ profile: p });
  const pr = app.profile;
  const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

  return (
    <>
      <Group title="App">
        <div className="app-identity">
          <div className="icon-drop">
            {app.iconAssetId ? <img src={assetUrl(app.id, app.iconAssetId)} alt="App icon" /> : <span>{app.name.slice(0, 1)}</span>}
          </div>
          <div className="grow">
            <Field label="Name">
              <TextInput value={app.name} onChange={(v) => patch({ name: v })} />
            </Field>
            <FilePick className="btn small" onFiles={([f]) => actions.setIcon(f)}>
              {app.iconAssetId ? 'Replace icon' : 'Add icon'}
            </FilePick>
          </div>
        </div>
        <Field label="Subtitle" hint="Shown under the name on hero slides.">
          <TextInput value={app.subtitle} placeholder="120+ guided stretches" onChange={(v) => patch({ subtitle: v })} />
        </Field>
      </Group>

      <Group title="Devices and sizes">
        <p className="group-desc">Design at one size; every checked size is rendered natively on export.</p>
        {DEVICE_IDS.map((d) => {
          const spec = DEVICES[d];
          const on = app.devices.includes(d);
          const chosen = exportSizes(app, d);
          return (
            <div key={d} className={`device-block ${on ? '' : 'off'}`}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={on && app.devices.length === 1}
                  onChange={() => patch({ devices: on ? app.devices.filter((x) => x !== d) : [...app.devices, d] })}
                />
                <strong>{spec.label}</strong>
              </label>
              <span className="note">{spec.note}</span>
              {on && (
                <>
                  <Field label="Design size">
                    <select value={app.sizes[d]} onChange={(e) => patch({ sizes: { [d]: e.target.value } })}>
                      {Object.keys(spec.sizes).map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="size-list" role="group" aria-label={`${spec.label} export sizes`}>
                    <span className="field-label">Export sizes</span>
                    {Object.keys(spec.sizes).map((k) => (
                      <label key={k} className="check">
                        <input
                          type="checkbox"
                          checked={chosen.includes(k)}
                          disabled={chosen.length === 1 && chosen.includes(k)}
                          onChange={(e) =>
                            patch({ exportSizes: { [d]: e.target.checked ? [...chosen, k] : chosen.filter((x) => x !== k) } })
                          }
                        />
                        {k}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </Group>

      <Group title="Profile">
        <p className="group-desc">
          Saved with the app and read by Claude before it works on it. Set the project folder so <code>appshot</code> finds this app
          from inside your repo.
        </p>
        <Field label="Project folder">
          <TextInput value={pr.projectPath} placeholder="~/Developer/MyApp" onChange={(v) => profile({ projectPath: v })} />
        </Field>
        <Field label="Bundle ID">
          <TextInput value={pr.bundleId} placeholder="com.example.myapp" onChange={(v) => profile({ bundleId: v })} />
        </Field>
        <Field label="App Store link">
          <TextInput value={pr.appStoreUrl} placeholder="https://apps.apple.com/app/id…" onChange={(v) => profile({ appStoreUrl: v })} />
        </Field>
        <Field label="Category">
          <TextInput value={pr.category} placeholder="Health & Fitness" onChange={(v) => profile({ category: v })} />
        </Field>
        <Field label="What it does">
          <TextInput multiline rows={3} value={pr.description} placeholder="Guided stretching routines in five minutes or less." onChange={(v) => profile({ description: v })} />
        </Field>
        <Field label="Who it’s for">
          <TextInput value={pr.audience} placeholder="Desk workers with tight backs" onChange={(v) => profile({ audience: v })} />
        </Field>
        <Field label="Keywords" hint="Comma separated.">
          <TextInput value={pr.keywords.join(', ')} onChange={(v) => profile({ keywords: list(v) })} />
        </Field>
        <Field label="Brand colors" hint="Comma separated hex values.">
          <TextInput value={pr.brandColors.join(', ')} placeholder="#16a34a, #f0fdf4" onChange={(v) => profile({ brandColors: list(v) })} />
        </Field>
        {pr.brandColors.length > 0 && (
          <div className="tag-input">
            {pr.brandColors.map((c) => (
              <span key={c} className="chip-swatch">
                <i style={{ background: c }} />
                {c}
              </span>
            ))}
          </div>
        )}
        <Field label="Screens to capture" hint="Which screens, in order, and how to reach them: deep links, taps, demo account, seed data.">
          <TextInput multiline rows={4} value={pr.screens} onChange={(v) => profile({ screens: v })} />
        </Field>
        <Field label="Notes" hint="Tone of voice, things to avoid, decisions already made.">
          <TextInput multiline rows={3} value={pr.notes} onChange={(v) => profile({ notes: v })} />
        </Field>
      </Group>
    </>
  );
}

function PaletteEditor({ app, k, actions }: { app: App; k: PaletteKey; actions: EditorActions }) {
  const p = app.theme.palettes[k];
  const set = (patch: Partial<Palette> | { background: Partial<Background> }) => actions.patchApp({ theme: { palettes: { [k]: patch } } });
  const bg = p.background;
  return (
    <Group title={k === 'primary' ? (app.theme.alternate ? 'Colors — odd slides' : 'Colors') : 'Colors — even slides'}>
      <Field label="Background">
        <Segmented
          value={bg.type}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'linear', label: 'Gradient' },
            { value: 'radial', label: 'Glow' },
            { value: 'image', label: 'Photo' },
          ]}
          onChange={(v) => set({ background: { type: v } })}
        />
      </Field>
      <ColorField label={bg.type === 'solid' || bg.type === 'image' ? 'Color' : 'From'} value={bg.color} onChange={(v) => set({ background: { color: v } })} />
      {(bg.type === 'linear' || bg.type === 'radial') && (
        <ColorField label="To" value={bg.color2} onChange={(v) => set({ background: { color2: v } })} />
      )}
      {bg.type === 'linear' && (
        <Field label="Angle">
          <Slider value={bg.angle} min={0} max={360} step={5} format={(v) => `${v}°`} onChange={(v) => set({ background: { angle: v } })} />
        </Field>
      )}
      {bg.type === 'image' && <BackgroundImage app={app} bg={bg} actions={actions} onChange={(b) => set({ background: b })} />}
      <ColorField label="Headline" value={p.textColor} onChange={(v) => set({ textColor: v })} />
      <ColorField label="Highlight" value={p.accentColor} onChange={(v) => set({ accentColor: v })} />
      <ColorField label="Subtitle" value={p.subtitleColor} onChange={(v) => set({ subtitleColor: v })} />
    </Group>
  );
}

function describeSource(a: Asset) {
  const when = new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  switch (a.source?.kind) {
    case 'simulator':
      return `Captured from ${a.source.device ?? 'Simulator'} · ${when}`;
    case 'mac-window':
      return `Captured from ${a.source.device ?? 'a Mac window'} · ${when}`;
    case 'file':
      return `Added from ${a.originalName} · ${when}`;
    default:
      return `Uploaded ${when}`;
  }
}
