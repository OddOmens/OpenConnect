import { CircleAlert, Copy, ImageUp, PanelRightClose, Trash2, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AnnotationKind, App, AppProfile, Asset, Background, BadgeKind, DecorKind, DeviceId, FrameKind, Layout, PaletteKey, Slide, TextureKind, Theme } from '../shared/types';
import { DEVICE_IDS } from '../shared/types';
import { DEVICES, exportSizes } from '../shared/devices';
import { checkSlide, checkTranslation } from '../shared/guidelines';
import { LANGUAGES, languageName, translationProgress } from '../shared/locales';
import { FONTS, PRESETS, slideTheme } from '../shared/presets';
import { setName } from '../shared/sets';
import { assetUrl } from '../render/SlideView';
import type { EditorActions } from '../Editor';
import { ColorField, Field, FilePick, Group, Segmented, Slider, TextInput } from './controls';
import { CalloutPicker } from './CalloutPicker';
import { CreativePanel } from './CreativePanel';
import { StickerPanel } from './StickerPanel';
import type { CreativeId } from '../shared/types';

/** Common device finishes for the drawn hardware. */
const DEVICE_COLORS: { label: string; value: string }[] = [
  { label: 'Black', value: '#2b2b2e' },
  { label: 'Silver', value: '#d9dadc' },
  { label: 'Natural', value: '#bdb6aa' },
  { label: 'Desert', value: '#c9a98a' },
  { label: 'Blue', value: '#3d4a5c' },
];

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
  baseSlide,
  productPage,
  creative,
  tab,
  onTab,
  actions,
  onClose,
}: {
  onClose: () => void;
  app: App;
  device: DeviceId;
  slide: Slide | null;
  /** while translating: the slide as written in the base language */
  baseSlide: Slide | null;
  productPage: boolean;
  creative: CreativeId | null;
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  actions: EditorActions;
}) {
  const tabs: [InspectorTab, string][] = [
    ['slide', productPage ? 'Asset' : 'Slide'],
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
          <button className="icon-btn panel-toggle" title="Hide panel (⌘/Ctrl + \ hides all)" aria-label="Hide inspector" onClick={onClose}>
            <PanelRightClose size={15} />
          </button>
        </div>
      </div>
      <div className="inspector-body">
        {tab === 'slide' &&
          productPage &&
          (creative ? (
            <CreativePanel app={app} id={creative} actions={actions} />
          ) : (
            <p className="empty-note">
              Select the header or the search results asset to edit it. Colors, type and the screenshot frame come from Style.
            </p>
          ))}
        {tab === 'slide' &&
          !productPage &&
          (slide ? (
            <SlidePanel app={app} device={device} slide={slide} base={baseSlide} actions={actions} />
          ) : (
            <p className="empty-note">Select a slide to edit its words and screenshot. Style sets the look of every slide; a slide can change any of it for itself here.</p>
          ))}
        {tab === 'style' && <StylePanel app={app} actions={actions} />}
        {tab === 'app' && <AppInfoPanel app={app} actions={actions} />}
      </div>
    </aside>
  );
}

/** A slide's words, screenshot, callout and role, plus any style it changes for itself. */
function SlidePanel({ app, device, slide, base, actions }: { app: App; device: DeviceId; slide: Slide; base: Slide | null; actions: EditorActions }) {
  const patch = (p: unknown) => actions.patchSlide(slide.id, p);
  const shot = slide.shots[device] ? app.assets[slide.shots[device]!] : null;
  const index = app.slides.findIndex((s) => s.id === slide.id);
  const label = DEVICES[device].label;
  // While translating, `slide` shows the translation (or the base text where there's none yet).
  const lang = base ? (app.activeLang ?? null) : null;
  const loc = lang ? slide.locales?.[lang] : undefined;
  const ownShot = !lang || !!loc?.shots?.[device];
  const issues = [...checkSlide(slide), ...checkTranslation(slide, lang)];

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
        {lang && base ? (
          <>
            <Field label={`Headline · ${languageName(lang)}`} hint={<>{languageName(app.baseLanguage)}: {base.headline.replace(/\n/g, ' / ')}</>}>
              <TextInput multiline rows={3} value={loc?.headline ?? ''} placeholder={base.headline} onChange={(v) => patch({ headline: v })} />
            </Field>
            <Field label={`Subtitle · ${languageName(lang)}`} hint={base.subtitle ? <>{languageName(app.baseLanguage)}: {base.subtitle}</> : undefined}>
              <TextInput multiline rows={2} value={loc?.subtitle ?? ''} placeholder={base.subtitle || 'Optional'} onChange={(v) => patch({ subtitle: v })} />
            </Field>
            <p className="group-desc">Keep the *asterisks* around the words to highlight. Everything else on this slide is shared by every language.</p>
          </>
        ) : (
          <>
            <Field label="Headline" hint="Wrap words in *asterisks* to color them. Press Return for a new line.">
              <TextInput multiline rows={3} value={slide.headline} onChange={(v) => patch({ headline: v })} />
            </Field>
            <Field label="Subtitle">
              <TextInput multiline rows={2} value={slide.subtitle} placeholder="Optional" onChange={(v) => patch({ subtitle: v })} />
            </Field>
          </>
        )}
        <label className="check">
          <input type="checkbox" checked={slide.role === 'hero'} onChange={(e) => patch({ role: e.target.checked ? 'hero' : 'standard' })} />
          Hero slide — badge, app icon and name, and a leaning device
        </label>
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

      {slide.role === 'hero' && <HeroSettings app={app} actions={actions} />}

      <Group title={lang ? `${label} screenshot · ${languageName(lang)}` : `${label} screenshot`}>
        {lang && !ownShot && shot && (
          <p className="group-desc">Showing the {languageName(app.baseLanguage)} screenshot. Drop one taken in {languageName(lang)} to use it for this language only.</p>
        )}
        <ShotRow
          app={app}
          asset={ownShot ? shot : null}
          label={lang ? `${languageName(lang)} screenshot` : 'Screenshot'}
          onFiles={(f) => actions.setShot(slide.id, f)}
          onClear={() => patch({ shots: { [device]: null } })}
        />
      </Group>

      {shot && (
        <Group
          title={`${label} callout`}
          aside={
            slide.callouts?.[device] ? (
              <button className="btn small ghost" onClick={() => patch({ callouts: { [device]: null } })}>
                Remove
              </button>
            ) : undefined
          }
        >
          <p className="group-desc">
            Drag a box on the screenshot around one thing to point at — a card, a row, a button. It's shown larger, lifted above
            the screen. Size and shadow are in Style.
          </p>
          <CalloutPicker
            src={assetUrl(app.id, shot.id)}
            asset={shot}
            value={slide.callouts?.[device]}
            onChange={(r) => patch({ callouts: { [device]: r } })}
          />
        </Group>
      )}

      <StickerPanel app={app} slide={slide} device={device} actions={actions} />

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

      <SlideStyle app={app} slide={slide} actions={actions} />
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

export function BackgroundImage({
  appId,
  bg,
  upload,
  onChange,
}: {
  appId: string;
  bg: Background;
  upload: (f: File) => Promise<string | undefined>;
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
              const id = await upload(f);
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
          <img className="bg-thumb" src={assetUrl(appId, bg.imageAssetId)} alt="" />
          <Field label="Darken">
            <Slider value={bg.overlay} min={0} max={0.9} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => onChange({ overlay: v })} />
          </Field>
        </>
      )}
    </div>
  );
}

/** Nested object from a dotted path: nest('frame.kind', 'device') → { frame: { kind: 'device' } }. */
function nest(path: string, value: unknown): Record<string, unknown> {
  return path
    .split('.')
    .reverse()
    .reduce<unknown>((acc, k) => ({ [k]: acc }), value) as Record<string, unknown>;
}
function getPath(o: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), o);
}

/**
 * Where style edits go: the app's theme (Style tab) or one slide's override (Slide tab). `reset` returns a
 * function only when the slide overrides that setting, which is what shows its ↺ button.
 */
interface StyleScope {
  t: Theme;
  set: (path: string, value: unknown) => void;
  reset: (path: string) => (() => void) | undefined;
  palettes: PaletteKey[];
  uploadBackground: (f: File) => Promise<string | undefined>;
  appId: string;
  /** the app's brand colors, to seed new gradients and meshes */
  brand: string[];
}

/** The Style tab: the app-wide look every slide starts from. */
function StylePanel({ app, actions }: { app: App; actions: EditorActions }) {
  const t = app.theme;
  const scope: StyleScope = {
    t,
    set: (path, v) => actions.patchApp({ theme: nest(path, v) }),
    reset: () => undefined,
    palettes: t.alternate ? ['primary', 'alt'] : ['primary'],
    uploadBackground: actions.uploadBackground,
    appId: app.id,
    brand: app.profile.brandColors,
  };

  return (
    <>
      <Group title="Theme">
        <p className="group-desc">
          {app.sets.length > 0 && (
            <>
              Editing the <strong>{setName(app)}</strong> set — other sets keep their own style.{' '}
            </>
          )}
          Style is the look of every slide on every device. A slide can change any of it for itself in the Slide tab. A theme
          changes colors and type; your layout and screenshot size stay.
        </p>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`preset-card ${t.presetId === p.id ? 'on' : ''}`}
              aria-pressed={t.presetId === p.id}
              onClick={() => actions.patchApp({ preset: p.id })}
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
      <StyleControls
        scope={scope}
        afterColors={
          <Group title="Alternate colors">
            <label className="check">
              <input type="checkbox" checked={t.alternate} onChange={(e) => actions.patchApp({ theme: { alternate: e.target.checked } })} />
              Use a second color scheme on every other slide
            </label>
          </Group>
        }
      />
    </>
  );
}

/** Style for one slide: starts from the app's Style; any change here applies to this slide only. */
function SlideStyle({ app, slide, actions }: { app: App; slide: Slide; actions: EditorActions }) {
  const index = app.slides.findIndex((s) => s.id === slide.id);
  const key: PaletteKey = app.theme.alternate && index % 2 === 1 ? 'alt' : 'primary';
  const overrides = countLeaves(slide.style);
  const scope: StyleScope = {
    t: slideTheme(app, slide),
    set: (path, v) => actions.patchSlide(slide.id, { style: nest(path, v) }),
    reset: (path) => {
      const v = getPath(slide.style, path);
      return v === undefined || v === null || (typeof v === 'object' && !countLeaves(v))
        ? undefined
        : () => actions.patchSlide(slide.id, { style: nest(path, null) });
    },
    palettes: [key],
    uploadBackground: actions.uploadBackground,
    appId: app.id,
    brand: app.profile.brandColors,
  };
  return (
    <details className="slide-style" open={overrides > 0 || undefined}>
      <summary>
        Style for this slide
        {overrides > 0 && <span className="override-count">{overrides} changed</span>}
      </summary>
      <Group
        title="Overrides"
        aside={
          overrides > 0 ? (
            <button className="btn small ghost" onClick={() => actions.patchSlide(slide.id, { style: null })}>
              Revert all
            </button>
          ) : undefined
        }
      >
        <p className="group-desc">
          Everything starts from the app's Style. Change a setting here to use it on this slide only; ↺ next to it goes back to
          the app style.
        </p>
      </Group>
      <StyleControls scope={scope} />
    </details>
  );
}

function countLeaves(o: unknown): number {
  if (o === null || o === undefined) return 0;
  if (typeof o !== 'object' || Array.isArray(o)) return 1;
  return Object.values(o as Record<string, unknown>).reduce<number>((n, v) => n + countLeaves(v), 0);
}

/** Layout, colors, type, frame and callouts — shared by the Style tab and a slide's own style. */
function StyleControls({ scope, afterColors }: { scope: StyleScope; afterColors?: ReactNode }) {
  const { t, set, reset } = scope;
  return (
    <>
      <Group title="Layout">
        <Field group label="Arrangement" onReset={reset('layout')}>
          <Segmented value={t.layout} options={LAYOUT_OPTIONS} onChange={(v) => set('layout', v)} />
        </Field>
        <Field group label="Text alignment" onReset={reset('align')}>
          <Segmented value={t.align} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }]} onChange={(v) => set('align', v)} />
        </Field>
        <Field label="Screenshot size" onReset={reset('shotScale')}>
          <Slider value={t.shotScale} min={0.5} max={1.5} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('shotScale', v)} />
        </Field>
        <Field label="Screenshot position" onReset={reset('shotOffsetY')}>
          <Slider value={t.shotOffsetY} min={-600} max={600} step={5} onChange={(v) => set('shotOffsetY', v)} />
        </Field>
        <Field label="Text position" hint="Move the headline up or down; the screenshot stays put." onReset={reset('textOffsetY')}>
          <Slider value={t.textOffsetY} min={-400} max={600} step={5} onChange={(v) => set('textOffsetY', v)} />
        </Field>
      </Group>

      {scope.palettes.map((k, i) => (
        <PaletteEditor
          key={k}
          scope={scope}
          k={k}
          title={scope.palettes.length > 1 ? (i === 0 ? 'Colors — odd slides' : 'Colors — even slides') : 'Colors'}
        />
      ))}
      {afterColors}

      <Group title="Type">
        <Field label="Typeface" onReset={reset('fontFamily')}>
          <select value={t.fontFamily} onChange={(e) => set('fontFamily', e.target.value)} style={{ fontFamily: `"${t.fontFamily}"` }}>
            {FONTS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>
                {f.replace(' Variable', '').replace('-apple-system', 'SF Pro (system)')}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Weight" onReset={reset('headlineWeight')}>
          <Slider value={t.headlineWeight} min={300} max={900} step={50} onChange={(v) => set('headlineWeight', v)} />
        </Field>
        <Field label="Headline size" onReset={reset('headlineSize')}>
          <Slider value={t.headlineSize} min={40} max={160} onChange={(v) => set('headlineSize', v)} />
        </Field>
        <Field label="Subtitle size" onReset={reset('subtitleSize')}>
          <Slider value={t.subtitleSize} min={20} max={80} onChange={(v) => set('subtitleSize', v)} />
        </Field>
        <Field label="Letter spacing" onReset={reset('letterSpacing')}>
          <Slider value={t.letterSpacing} min={-0.06} max={0.1} step={0.005} format={(v) => v.toFixed(3)} onChange={(v) => set('letterSpacing', v)} />
        </Field>
        <Field label="Line height" onReset={reset('lineHeight')}>
          <Slider value={t.lineHeight} min={0.85} max={1.5} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set('lineHeight', v)} />
        </Field>
      </Group>

      <Group title="Headline marks">
        <p className="group-desc">Marks on the *highlighted* words of each headline. Underlines and strikes are straight; circles, boxes, brackets and squiggles look hand-drawn.</p>
        <Field group label="Mark" onReset={reset('annotation.kind')}>
          <Segmented<AnnotationKind>
            value={t.annotation.kind}
            options={[
              { value: 'none', label: 'None' },
              { value: 'underline', label: 'Underline' },
              { value: 'double', label: 'Double' },
              { value: 'circle', label: 'Circle' },
              { value: 'box', label: 'Box' },
              { value: 'marker', label: 'Marker' },
              { value: 'strike', label: 'Strike' },
              { value: 'brackets', label: 'Brackets' },
              { value: 'squiggle', label: 'Squiggle' },
            ]}
            onChange={(v) => set('annotation.kind', v)}
          />
        </Field>
        {t.annotation.kind !== 'none' && (
          <>
            {t.annotation.kind === 'marker' ? (
              <>
                <Field label="Opacity" onReset={reset('annotation.marker.opacity')}>
                  <Slider value={t.annotation.marker.opacity} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('annotation.marker.opacity', v)} />
                </Field>
                <Field label="Height" hint="Thin stripe under the words, up to covering them." onReset={reset('annotation.marker.height')}>
                  <Slider value={t.annotation.marker.height} min={0.1} max={1.2} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('annotation.marker.height', v)} />
                </Field>
                <Field label="Position" onReset={reset('annotation.marker.lift')}>
                  <Slider value={t.annotation.marker.lift} min={-0.3} max={0.6} step={0.01} format={(v) => (Math.abs(v) < 0.005 ? 'Base' : `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`)} onChange={(v) => set('annotation.marker.lift', v)} />
                </Field>
                <Field label="Round ends" onReset={reset('annotation.marker.radius')}>
                  <Slider value={t.annotation.marker.radius} min={0} max={1} step={0.05} format={(v) => (v < 0.05 ? 'Square' : v > 0.95 ? 'Pill' : `${Math.round(v * 100)}%`)} onChange={(v) => set('annotation.marker.radius', v)} />
                </Field>
                <Field label="Tilt" onReset={reset('annotation.marker.tilt')}>
                  <Slider value={t.annotation.marker.tilt} min={-6} max={6} step={0.5} format={(v) => `${v}°`} onChange={(v) => set('annotation.marker.tilt', v)} />
                </Field>
                <Field label="Overhang" onReset={reset('annotation.padding')}>
                  <Slider value={t.annotation.padding} min={0} max={50} onChange={(v) => set('annotation.padding', v)} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Thickness" onReset={reset('annotation.width')}>
                  <Slider value={t.annotation.width} min={1} max={20} step={0.5} onChange={(v) => set('annotation.width', v)} />
                </Field>
                <Field
                  label={['underline', 'double', 'squiggle'].includes(t.annotation.kind) ? 'Gap below' : t.annotation.kind === 'strike' ? 'Overhang' : 'Spacing'}
                  onReset={reset('annotation.padding')}
                >
                  <Slider value={t.annotation.padding} min={0} max={50} onChange={(v) => set('annotation.padding', v)} />
                </Field>
              </>
            )}
            {/* Underlines and strikes are always straight; the rest can look hand-drawn. */}
            {!['underline', 'double', 'strike'].includes(t.annotation.kind) && (
              <Field label={t.annotation.kind === 'marker' ? 'Brush edges' : 'Sketchiness'} onReset={reset('annotation.roughness')}>
                <Slider value={t.annotation.roughness} min={0} max={3.5} step={0.1} format={(v) => (v < 0.3 ? 'Clean' : v.toFixed(1))} onChange={(v) => set('annotation.roughness', v)} />
              </Field>
            )}
            <label className="check">
              <input type="checkbox" checked={!t.annotation.color} onChange={(e) => set('annotation.color', e.target.checked ? '' : t.palettes.primary.textColor)} />
              Mark in the highlight color
            </label>
            {t.annotation.color && <ColorField label="Mark color" value={t.annotation.color} onChange={(v) => set('annotation.color', v)} onReset={reset('annotation.color')} />}
            <label className="check">
              <input type="checkbox" checked={t.annotation.recolor} onChange={(e) => set('annotation.recolor', e.target.checked)} />
              Also color the marked words
            </label>
          </>
        )}
      </Group>

      <Group title="Screenshot frame">
        <Field group label="Frame" onReset={reset('frame.kind')}>
          <Segmented<FrameKind>
            value={t.frame.kind}
            options={[
              { value: 'outline', label: 'Outline', title: 'Rounded screenshot with a stroke' },
              { value: 'device', label: 'Device', title: 'Drawn iPhone, iPad or Mac around the screenshot' },
            ]}
            onChange={(v) => set('frame.kind', v)}
          />
        </Field>
        {t.frame.kind === 'device' ? (
          <>
            <div className="device-colors" role="group" aria-label="Device finish">
              {DEVICE_COLORS.map((c) => (
                <button
                  key={c.value}
                  className={`device-color ${t.frame.deviceColor.toLowerCase() === c.value ? 'on' : ''}`}
                  title={c.label}
                  aria-label={c.label}
                  aria-pressed={t.frame.deviceColor.toLowerCase() === c.value}
                  style={{ background: c.value }}
                  onClick={() => set('frame.deviceColor', c.value)}
                />
              ))}
            </div>
            <ColorField label="Device color" value={t.frame.deviceColor} onChange={(v) => set('frame.deviceColor', v)} onReset={reset('frame.deviceColor')} />
          </>
        ) : (
          <>
            <ColorField label="Stroke" value={t.frame.strokeColor} onChange={(v) => set('frame.strokeColor', v)} onReset={reset('frame.strokeColor')} />
            <Field label="Stroke width" onReset={reset('frame.strokeWidth')}>
              <Slider value={t.frame.strokeWidth} min={0} max={30} step={0.5} onChange={(v) => set('frame.strokeWidth', v)} />
            </Field>
            <Field label="Corner radius" onReset={reset('frame.radius')}>
              <Slider value={t.frame.radius} min={0} max={20} step={0.25} format={(v) => `${v}%`} onChange={(v) => set('frame.radius', v)} />
            </Field>
          </>
        )}
        <Field label="Shadow" onReset={reset('frame.shadow')}>
          <Slider value={t.frame.shadow} min={0} max={0.8} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('frame.shadow', v)} />
        </Field>
      </Group>

      <Group title="Callouts">
        <p className="group-desc">How a marked part of a screenshot is lifted out. Mark it on a slide in the Slide tab.</p>
        <Field label="Size" onReset={reset('callout.scale')}>
          <Slider value={t.callout.scale} min={1} max={1.5} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('callout.scale', v)} />
        </Field>
        <Field label="Shadow" onReset={reset('callout.shadow')}>
          <Slider value={t.callout.shadow} min={0} max={0.8} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('callout.shadow', v)} />
        </Field>
        <Field label="Corner radius" onReset={reset('callout.radius')}>
          <Slider value={t.callout.radius} min={0} max={80} onChange={(v) => set('callout.radius', v)} />
        </Field>
      </Group>

      <Group title="Background effects">
        <Field group label="Panorama" onReset={reset('panorama')} hint="One background running across every slide; swiping through the set reads as one picture.">
          <label className="check">
            <input type="checkbox" checked={t.panorama} onChange={(e) => set('panorama', e.target.checked)} />
            Continue the background across slides
          </label>
        </Field>
        <Field group label="Texture" onReset={reset('texture.kind')}>
          <Segmented<TextureKind>
            value={t.texture.kind}
            options={[
              { value: 'none', label: 'None' },
              { value: 'grain', label: 'Grain' },
              { value: 'dots', label: 'Dots' },
              { value: 'grid', label: 'Grid' },
              { value: 'lines', label: 'Lines' },
            ]}
            onChange={(v) => set('texture.kind', v)}
          />
        </Field>
        {t.texture.kind !== 'none' && (
          <>
            <Field label="Texture strength" onReset={reset('texture.opacity')}>
              <Slider value={t.texture.opacity} min={0.02} max={0.6} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('texture.opacity', v)} />
            </Field>
            {t.texture.kind !== 'grain' && (
              <Field label="Spacing" onReset={reset('texture.size')}>
                <Slider value={t.texture.size} min={8} max={120} onChange={(v) => set('texture.size', v)} />
              </Field>
            )}
          </>
        )}
        <Field label="Vignette" onReset={reset('vignette')}>
          <Slider value={t.vignette} min={0} max={1} step={0.05} format={(v) => (v ? `${Math.round(v * 100)}%` : 'Off')} onChange={(v) => set('vignette', v)} />
        </Field>
        <Field label="Glow behind screenshot" onReset={reset('glow.strength')}>
          <Slider value={t.glow.strength} min={0} max={1} step={0.05} format={(v) => (v ? `${Math.round(v * 100)}%` : 'Off')} onChange={(v) => set('glow.strength', v)} />
        </Field>
        {t.glow.strength > 0 && (
          <>
            <Field label="Glow size" onReset={reset('glow.size')}>
              <Slider value={t.glow.size} min={0.6} max={2.5} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('glow.size', v)} />
            </Field>
            <label className="check">
              <input type="checkbox" checked={!t.glow.color} onChange={(e) => set('glow.color', e.target.checked ? '' : t.palettes.primary.accentColor)} />
              Use the highlight color
            </label>
            {t.glow.color && <ColorField label="Glow color" value={t.glow.color} onChange={(v) => set('glow.color', v)} onReset={reset('glow.color')} />}
          </>
        )}
      </Group>

      <Group
        title="Decorations"
        aside={
          t.decor.kind !== 'none' ? (
            <button className="btn small ghost" onClick={() => set('decor.seed', ((t.decor.seed || 1) % 997) + 1)}>
              Shuffle
            </button>
          ) : undefined
        }
      >
        <p className="group-desc">Generated shapes in your colors, behind the screenshot. With Panorama they flow across slides.</p>
        <Field group label="Shapes" onReset={reset('decor.kind')}>
          <Segmented<DecorKind>
            value={t.decor.kind}
            options={[
              { value: 'none', label: 'None' },
              { value: 'blobs', label: 'Blobs' },
              { value: 'waves', label: 'Waves' },
              { value: 'rings', label: 'Rings' },
              { value: 'sparkles', label: 'Sparkles' },
              { value: 'confetti', label: 'Confetti' },
              { value: 'bokeh', label: 'Bokeh' },
            ]}
            onChange={(v) => set('decor.kind', v)}
          />
        </Field>
        {t.decor.kind !== 'none' && (
          <>
            <Field label="Amount" onReset={reset('decor.density')}>
              <Slider value={t.decor.density} min={0.25} max={3} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('decor.density', v)} />
            </Field>
            <Field label="Size" onReset={reset('decor.scale')}>
              <Slider value={t.decor.scale} min={0.4} max={2.5} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('decor.scale', v)} />
            </Field>
            <Field label="Opacity" onReset={reset('decor.opacity')}>
              <Slider value={t.decor.opacity} min={0.05} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('decor.opacity', v)} />
            </Field>
            <label className="check">
              <input type="checkbox" checked={!t.decor.color} onChange={(e) => set('decor.color', e.target.checked ? '' : t.palettes.primary.accentColor)} />
              Use the highlight and brand colors
            </label>
            {t.decor.color && <ColorField label="Shape color" value={t.decor.color} onChange={(v) => set('decor.color', v)} onReset={reset('decor.color')} />}
          </>
        )}
      </Group>

      <Group title="Stickers">
        <p className="group-desc">Add emoji and doodles on a slide in its Slide tab.</p>
        <Field label="Sticker shadow" onReset={reset('stickerShadow')}>
          <Slider value={t.stickerShadow} min={0} max={0.8} step={0.05} format={(v) => (v ? `${Math.round(v * 100)}%` : 'Off')} onChange={(v) => set('stickerShadow', v)} />
        </Field>
      </Group>
    </>
  );
}

/** Badge, logo lockup and tilt for hero slides. Shared by every hero slide, so it lives on the app. */
function HeroSettings({ app, actions }: { app: App; actions: EditorActions }) {
  const h = app.theme.hero;
  const hero = (p: Partial<typeof h>) => actions.patchApp({ theme: { hero: p } });
  return (
    <Group title="Hero design">
      <p className="group-desc">Shared by every hero slide. Only show a rating or download count the App Store really shows.</p>
      <Field group label="Badge">
        <Segmented<BadgeKind>
          value={h.badge}
          options={[
            { value: 'none', label: 'None' },
            { value: 'rating', label: 'Rating' },
            { value: 'downloads', label: 'Downloads' },
            { value: 'custom', label: 'Custom' },
          ]}
          onChange={(v) => hero({ badge: v })}
        />
      </Field>
      {h.badge !== 'none' && (
        <>
          <Field label="Badge text">
            <TextInput
              value={h.badgeTitle}
              placeholder={h.badge === 'rating' ? '4.9 Stars' : h.badge === 'downloads' ? '1M+ Downloads' : 'Editors’ favorite'}
              onChange={(v) => hero({ badgeTitle: v })}
            />
          </Field>
          <Field label="Caption">
            <TextInput
              value={h.badgeCaption}
              placeholder={h.badge === 'rating' ? 'From 62k+ ratings' : h.badge === 'downloads' ? 'Worldwide' : 'Optional'}
              onChange={(v) => hero({ badgeCaption: v })}
            />
          </Field>
        </>
      )}
      <label className="check">
        <input type="checkbox" checked={h.lockup} onChange={(e) => hero({ lockup: e.target.checked })} />
        Show the app icon and name
      </label>
      <Field label="Device tilt">
        <Slider value={h.tilt} min={-15} max={15} step={0.5} format={(v) => `${v}°`} onChange={(v) => hero({ tilt: v })} />
      </Field>
    </Group>
  );
}

/** The language the slides are written in, and the translations exported with them. */
function LanguagesSettings({ app, actions }: { app: App; actions: EditorActions }) {
  const known = (code: string) => (LANGUAGES.some((l) => l.code === code) ? [] : [{ code, name: code }]);
  const progress = translationProgress(app);
  return (
    <Group title="Languages">
      <p className="group-desc">
        Translations get their own headlines, subtitles and (optionally) screenshots; the design is shared. Pick one in the top bar to
        edit it, or ask Claude to translate. Export makes a folder per language.
      </p>
      <Field label="Written in">
        <select value={app.baseLanguage} onChange={(e) => actions.patchApp({ baseLanguage: e.target.value, languages: app.languages.filter((l) => l !== e.target.value) })}>
          {[...LANGUAGES, ...known(app.baseLanguage)].map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
      {progress.length > 0 && (
        <ul className="lang-list">
          {progress.map((l) => (
            <li key={l.code}>
              <span className="grow">{l.name}</span>
              <span className="muted small">{l.done === l.total ? 'Translated' : `${l.done} of ${l.total} slides`}</span>
              <button
                className="icon-btn danger"
                title={`Remove ${l.name}`}
                onClick={() =>
                  confirm(`Remove ${l.name}? Its translations stay saved and come back if you add it again.`) &&
                  actions.patchApp({ languages: app.languages.filter((x) => x !== l.code) })
                }
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Field label="Add a language">
        <select value="" onChange={(e) => e.target.value && actions.patchApp({ languages: [...app.languages, e.target.value] })}>
          <option value="">Choose…</option>
          {LANGUAGES.filter((l) => l.code !== app.baseLanguage && !app.languages.includes(l.code)).map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
    </Group>
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

      <LanguagesSettings app={app} actions={actions} />

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

function PaletteEditor({ scope, k, title }: { scope: StyleScope; k: PaletteKey; title: string }) {
  const p = scope.t.palettes[k];
  const path = (sub: string) => `palettes.${k}.${sub}`;
  const set = (sub: string, v: unknown) => scope.set(path(sub), v);
  const bg = p.background;
  return (
    <Group title={title}>
      <Field group label="Background" onReset={scope.reset(path('background'))}>
        <Segmented
          value={bg.type}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'linear', label: 'Gradient' },
            { value: 'radial', label: 'Glow' },
            { value: 'mesh', label: 'Mesh', title: 'Soft blobs of three colors' },
            { value: 'image', label: 'Photo' },
            { value: 'screenshot', label: 'Frosted', title: 'The slide’s own screenshot, blurred' },
          ]}
          onChange={(v) => {
            // A gradient, glow or mesh of one color shows nothing: start it from the highlight and brand colors.
            const same = (a: string, b?: string) => !b || a.toLowerCase() === b.toLowerCase();
            if ((v === 'linear' || v === 'radial' || v === 'mesh') && same(bg.color, bg.color2)) {
              const extra = scope.brand.find((c) => !same(c, bg.color) && !same(c, p.accentColor)) ?? p.subtitleColor;
              set('background', { type: v, color2: p.accentColor, color3: extra });
            } else set('background.type', v);
          }}
        />
      </Field>
      <ColorField
        label={bg.type === 'linear' || bg.type === 'radial' ? 'From' : bg.type === 'mesh' ? 'Base' : 'Color'}
        value={bg.color}
        onChange={(v) => set('background.color', v)}
      />
      {(bg.type === 'linear' || bg.type === 'radial' || bg.type === 'mesh') && (
        <ColorField label={bg.type === 'mesh' ? 'Blob' : 'To'} value={bg.color2} onChange={(v) => set('background.color2', v)} />
      )}
      {bg.type === 'mesh' && (
        <>
          <ColorField label="Blob 2" value={bg.color3 || bg.color2} onChange={(v) => set('background.color3', v)} />
          <button className="btn small" onClick={() => set('background.seed', ((bg.seed || 1) % 997) + 1)}>
            Shuffle blobs
          </button>
        </>
      )}
      {bg.type === 'screenshot' && (
        <Field label="Darken">
          <Slider value={bg.overlay} min={0} max={0.9} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('background.overlay', v)} />
        </Field>
      )}
      {bg.type === 'linear' && (
        <Field label="Angle">
          <Slider value={bg.angle} min={0} max={360} step={5} format={(v) => `${v}°`} onChange={(v) => set('background.angle', v)} />
        </Field>
      )}
      {bg.type === 'image' && (
        <BackgroundImage appId={scope.appId} bg={bg} upload={scope.uploadBackground} onChange={(b) => set('background', b)} />
      )}
      <ColorField label="Headline" value={p.textColor} onChange={(v) => set('textColor', v)} onReset={scope.reset(path('textColor'))} />
      <ColorField label="Highlight" value={p.accentColor} onChange={(v) => set('accentColor', v)} onReset={scope.reset(path('accentColor'))} />
      <ColorField label="Subtitle" value={p.subtitleColor} onChange={(v) => set('subtitleColor', v)} onReset={scope.reset(path('subtitleColor'))} />
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
