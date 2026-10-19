import { useEffect, useState } from 'react';

export type ColorTheme = 'light' | 'dark' | 'system';

const valid = (v: unknown): v is ColorTheme => v === 'light' || v === 'dark' || v === 'system';
const read = (): ColorTheme => {
  try {
    const v = localStorage.getItem('appshot.theme');
    if (valid(v)) return v;
  } catch {}
  // Inside OpenConnect: its light/dark setting, until one is picked here.
  const oc = typeof document !== 'undefined' ? document.documentElement.dataset.ocTheme : undefined;
  return valid(oc) ? oc : 'system';
};

function apply(theme: ColorTheme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/** Editor light/dark mode (the slides themselves are never affected). */
export function useColorTheme(): [ColorTheme, (t: ColorTheme) => void] {
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    apply(theme);
    try {
      localStorage.setItem('appshot.theme', theme);
    } catch {}
    if (theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);
  return [theme, setTheme];
}

apply(read());

export type UiScale = 'auto' | 1 | 1.25 | 1.5 | 1.75;
export const UI_SCALES: UiScale[] = ['auto', 1, 1.25, 1.5, 1.75];

/**
 * A large screen with no display scaling (common on Linux with a 4K monitor) draws the interface at 1:1,
 * which makes it tiny; pick a bigger size there. Elsewhere the OS already scales.
 */
export function autoUiScale(): number {
  const physical = screen.width * devicePixelRatio;
  if (devicePixelRatio >= 1.5) return 1;
  if (physical >= 3400) return 1.5;
  if (physical >= 2500) return 1.25;
  return 1;
}

const readScale = (): UiScale => {
  try {
    const v = localStorage.getItem('appshot.uiScale');
    if (v === 'auto' || v === null) return 'auto';
    const n = Number(v);
    if (UI_SCALES.includes(n as UiScale)) return n as UiScale;
  } catch {}
  return 'auto';
};

/** Interface size for the editor's panels (not the canvas): the root font size every rem hangs off. */
export function useUiScale(): [UiScale, (s: UiScale) => void, number] {
  const [scale, setScale] = useState(readScale);
  const value = scale === 'auto' ? autoUiScale() : scale;
  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * value}px`;
    document.documentElement.style.setProperty('--ui-scale', String(value));
    try {
      localStorage.setItem('appshot.uiScale', String(scale));
    } catch {}
  }, [scale, value]);
  return [scale, setScale, value];
}
