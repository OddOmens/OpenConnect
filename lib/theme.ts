// Applying the light/dark theme in the browser. The server renders the saved theme into
// <html>, so pages never flash the wrong one; this handles changes and "system".

import type { ThemeId } from './prefs'

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
}
