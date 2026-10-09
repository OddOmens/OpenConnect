import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Group({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="group">
      <header className="group-head">
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** Text input that keeps local state while focused so remote refreshes don't fight the cursor. */
export function TextInput({
  value,
  onChange,
  multiline,
  placeholder,
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  const [local, setLocal] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);
  const props = {
    value: local,
    placeholder,
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      setLocal(value);
    },
    onChange: (e: { target: { value: string } }) => {
      setLocal(e.target.value);
      onChange(e.target.value);
    },
  };
  return multiline ? <textarea rows={rows} {...props} /> : <input type="text" {...props} />;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(v),
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{format(value)}</output>
    </div>
  );
}

function toHex(c: string) {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + [...c.slice(1)].map((x) => x + x).join('');
  const m = c.match(/rgba?\((\d+)\D+(\d+)\D+(\d+)/);
  if (m) return '#' + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  return '#000000';
}

/** Swatch picker plus a free text field, so rgba() values with alpha stay editable. */
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="color-field">
      <span className="swatch" style={{ background: value }}>
        <input
          type="color"
          aria-label={label}
          value={toHex(value)}
          onChange={(e) => {
            // Keep any alpha the user had set.
            const alpha = value.match(/rgba\(.*,\s*([\d.]+)\)/)?.[1];
            if (alpha) {
              const h = e.target.value;
              const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
              onChange(`rgba(${r},${g},${b},${alpha})`);
            } else onChange(e.target.value);
          }}
        />
      </span>
      <span className="color-label">{label}</span>
      <TextInput value={value} onChange={onChange} />
    </div>
  );
}

export function FilePick({
  accept = 'image/*',
  multiple,
  onFiles,
  children,
  className = 'btn',
}: {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.click()}>
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}
