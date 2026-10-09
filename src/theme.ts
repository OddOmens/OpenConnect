import { useEffect, useState } from 'react';

export type ColorTheme = 'light' | 'dark' | 'system';

const read = (): ColorTheme => {
  try {
    const v = localStorage.getItem('appshot.theme');
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {}
  return 'system';
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
