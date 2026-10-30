// Applying the light/dark theme in the browser. The server renders the saved theme into
// <html>, so pages never flash the wrong one; this handles changes and "system".

import type { ThemeId } from './prefs'

/** The page background in each theme (--background), for the browser and status bar around it. */
export const THEME_COLORS = { light: '#ffffff', dark: '#09090b' } as const

/** Inline script for "system": picks light/dark before first paint and follows changes. */
export const SYSTEM_THEME_SCRIPT =
  "(function(){var m=window.matchMedia('(prefers-color-scheme: dark)');" +
  "function a(){if(document.documentElement.dataset.theme==='system')document.documentElement.classList.toggle('dark',m.matches)}" +
  "a();m.addEventListener('change',a)})()"

export function applyTheme(theme: ThemeId) {
  const root = document.documentElement
  root.dataset.theme = theme
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', dark)
  // Recolour the browser bar to match: a fixed theme has one colour, "system" one per scheme.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
  const metas =
    theme === 'system'
      ? (['light', 'dark'] as const).map((s) => ({ color: THEME_COLORS[s], media: `(prefers-color-scheme: ${s})` }))
      : [{ color: THEME_COLORS[theme], media: '' }]
  for (const { color, media } of metas) {
    const m = document.createElement('meta')
    m.name = 'theme-color'
    m.content = color
    if (media) m.media = media
    document.head.appendChild(m)
  }
}
