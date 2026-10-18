import { Plus, X } from 'lucide-react';
import type { App, Background, Creative, CreativeId, CreativeShot, DeviceId } from '../shared/types';
import { CREATIVES, creativeShots } from '../shared/creatives';
import { DEVICES } from '../shared/devices';
import type { EditorActions } from '../Editor';
import { ColorField, Field, Group, Segmented, Slider, TextInput } from './controls';
import { BackgroundImage } from './Inspector';
import { checkCreative } from '../shared/guidelines';
import { CircleAlert, TriangleAlert } from 'lucide-react';

/** Content of one creative asset. Colors, type and frame come from Style, like the slides. */
export function CreativePanel({ app, id, actions }: { app: App; id: CreativeId; actions: EditorActions }) {
  const spec = CREATIVES[id];
  const c = app.creatives[id];
  const set = (p: Partial<Creative>) => actions.patchApp({ creatives: { [id]: p } });
  const plain = (s: string) => s.replace(/\*/g, '').replace(/\n/g, ' / ');

  // Every slide screenshot that can be picked, labeled by slide and device.
  const options: (CreativeShot & { label: string })[] = app.slides.flatMap((s, i) =>
    (Object.keys(s.shots) as DeviceId[])
      .filter((d) => s.shots[d])
      .map((d) => ({ slideId: s.id, device: d, label: `Slide ${i + 1} · ${DEVICES[d].label} — ${plain(s.headline).slice(0, 28)}` })),
  );
  const keyOf = (s: CreativeShot) => `${s.slideId}:${s.device}`;
  const fromKey = (k: string): CreativeShot => {
    const [slideId, device] = k.split(':');
    return { slideId, device: device as DeviceId };
  };
  // Show the automatic picks as real rows once someone starts editing them.
  const shots = c.shots.length ? c.shots : creativeShots(app, c).map(({ slideId, device }) => ({ slideId, device }));
  const setShots = (next: CreativeShot[]) => set({ shots: next });
  const bg = c.background;
  const setBg = (p: Partial<Background>) => set({ background: { ...(bg ?? app.theme.palettes.primary.background), ...p } });

  return (
    <>
      <Group title={spec.label}>
        <p className="group-desc">
          {spec.note} Export size {Object.keys(spec.sizes).join(' or ')}; the dashed box is Apple’s art safe area.
        </p>
        <label className="check">
          <input type="checkbox" checked={c.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          Include in export
        </label>
        <Field label="Headline" hint="One short phrase. Wrap words in *asterisks* to color them; Return for a new line.">
          <TextInput multiline rows={2} value={c.headline} placeholder={id === 'header' ? 'Speak. *It writes.*' : 'Voice notes that *organize themselves*'} onChange={(v) => set({ headline: v })} />
        </Field>
        <Field label="Subtitle">
          <TextInput value={c.subtitle} placeholder="Optional" onChange={(v) => set({ subtitle: v })} />
        </Field>
        {checkCreative(c).length > 0 && (
          <ul className="issues" aria-label="App Store guideline checks">
            {checkCreative(c).map((i) => (
              <li key={i.message} className={i.level}>
                {i.level === 'error' ? <CircleAlert size={14} /> : <TriangleAlert size={14} />}
                {i.message}
              </li>
            ))}
          </ul>
        )}
        <label className="check">
          <input type="checkbox" checked={c.lockup} onChange={(e) => set({ lockup: e.target.checked })} />
          Show the app icon and name
        </label>
        <Field group label="Text">
          <Segmented
            value={c.textPosition}
            options={[
              { value: 'left', label: 'Left', title: 'Text on the left, screenshots on the right' },
              { value: 'center', label: 'Center', title: 'Text in the middle, screenshots either side' },
              { value: 'none', label: 'None', title: 'Screenshots only' },
            ]}
            onChange={(v) => set({ textPosition: v })}
          />
        </Field>
      </Group>

      <Group
        title="Screenshots"
        aside={
          shots.length < 4 && options.length ? (
            <button className="btn small ghost" onClick={() => setShots([...shots, options.find((o) => !shots.some((s) => keyOf(s) === keyOf(o))) ?? options[0]])}>
              <Plus size={14} /> Add
            </button>
          ) : undefined
        }
      >
        <p className="group-desc">
          {c.shots.length ? 'Up to four, from your slides.' : 'Using your first slides’ iPhone screenshots. Change or add any to pick your own.'}
        </p>
        {shots.map((s, i) => (
          <div key={i} className="row tight">
            <select
              className="grow"
              value={keyOf(s)}
              onChange={(e) => setShots(shots.map((x, j) => (j === i ? fromKey(e.target.value) : x)))}
            >
              {options.map((o) => (
                <option key={keyOf(o)} value={keyOf(o)}>
                  {o.label}
                </option>
              ))}
            </select>
            <button className="icon-btn" title="Remove" onClick={() => setShots(shots.filter((_, j) => j !== i))}>
              <X size={14} />
            </button>
          </div>
        ))}
        <Field label="Size">
          <Slider value={c.shotScale} min={0.6} max={2} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ shotScale: v })} />
        </Field>
      </Group>

      <Group title="Background">
        <label className="check">
          <input type="checkbox" checked={!bg} onChange={(e) => set({ background: e.target.checked ? null : { ...app.theme.palettes.primary.background } })} />
          Use the app’s colors from Style
        </label>
        {bg && (
          <>
            <Field group label="Fill">
              <Segmented
                value={bg.type}
                options={[
                  { value: 'solid', label: 'Solid' },
                  { value: 'linear', label: 'Gradient' },
                  { value: 'radial', label: 'Glow' },
                  { value: 'mesh', label: 'Mesh' },
                  { value: 'image', label: 'Photo' },
                ]}
                onChange={(v) => setBg({ type: v })}
              />
            </Field>
            <ColorField label={bg.type === 'solid' || bg.type === 'image' ? 'Color' : 'From'} value={bg.color} onChange={(v) => setBg({ color: v })} />
            {(bg.type === 'linear' || bg.type === 'radial' || bg.type === 'mesh') && (
              <ColorField label={bg.type === 'mesh' ? 'Blob' : 'To'} value={bg.color2} onChange={(v) => setBg({ color2: v })} />
            )}
            {bg.type === 'mesh' && (
              <>
                <ColorField label="Blob 2" value={bg.color3 || bg.color2} onChange={(v) => setBg({ color3: v })} />
                <button className="btn small" onClick={() => setBg({ seed: ((bg.seed || 1) % 997) + 1 })}>
                  Shuffle blobs
                </button>
              </>
            )}
            {bg.type === 'linear' && (
              <Field label="Angle">
                <Slider value={bg.angle} min={0} max={360} step={5} format={(v) => `${v}°`} onChange={(v) => setBg({ angle: v })} />
              </Field>
            )}
            {bg.type === 'image' && <BackgroundImage appId={app.id} bg={bg} upload={actions.uploadBackground} onChange={setBg} />}
          </>
        )}
      </Group>
    </>
  );
}
