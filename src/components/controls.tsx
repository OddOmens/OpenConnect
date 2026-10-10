import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Shown next to a setting a slide overrides; goes back to the app's style. */
export function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      className="reset-override"
      title="Changed on this slide — click to use the app style"
      aria-label="Use the app style"
      onClick={(e) => {
        e.preventDefault();
        onReset();
      }}
    >
      ↺
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  onReset,
  group,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  /** children are buttons (e.g. Segmented), not one input */
  group?: boolean;
  /** set when a slide overrides this setting */
  onReset?: () => void;
}) {
  const inner = (
    <>
      <span className="field-label">
        {label}
        {onReset && <ResetButton onReset={onReset} />}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </>
  );
  // A <label> would hand its text to the first button inside (e.g. "Layout Text on top"), so a row of
  // buttons gets a named group instead.
  return group ? (
    <div className={`field ${onReset ? 'overridden' : ''}`} role="group" aria-label={label}>
      {inner}
    </div>
  ) : (
    <label className={`field ${onReset ? 'overridden' : ''}`}>{inner}</label>
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
  commitOnBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  rows?: number;
  /** only report the value on blur or Enter (e.g. names that must stay unique) */
  commitOnBlur?: boolean;
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
      if (commitOnBlur && local !== value) onChange(local);
      else setLocal(value);
    },
    onKeyDown: (e: { key: string; currentTarget: { blur: () => void } }) => {
      if (commitOnBlur && e.key === 'Enter') e.currentTarget.blur();
      if (commitOnBlur && e.key === 'Escape') {
        setLocal(value);
        focused.current = false;
      }
    },
    onChange: (e: { target: { value: string } }) => {
      setLocal(e.target.value);
      if (!commitOnBlur) onChange(e.target.value);
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
export function ColorField({
  label,
  value,
  onChange,
  onReset,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onReset?: () => void;
}) {
  return (
    <div className={`color-field ${onReset ? 'overridden' : ''}`}>
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
      <span className="color-label">
        {label}
        {onReset && <ResetButton onReset={onReset} />}
      </span>
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
