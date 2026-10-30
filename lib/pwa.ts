// What makes OpenConnect install and launch like an app: the home screen title, the status bar,
// the colour around the page, and the viewport reaching under the notch and home indicator.
// Both root layouts (dashboard and studio) use these.

import type { Metadata, Viewport } from 'next'
import type { ThemeId } from './prefs'
import { THEME_COLORS } from './theme'

export function pwaMetadata(theme: ThemeId): Pick<Metadata, 'applicationName' | 'appleWebApp' | 'formatDetection'> {
  return {
    applicationName: 'OpenConnect',
    appleWebApp: {
      capable: true,
      title: 'OpenConnect',
      // Translucent puts the page under the status bar with white text, which only reads on the
      // dark theme; "default" gives a status bar of its own that follows the system's light/dark.
      statusBarStyle: theme === 'dark' ? 'black-translucent' : 'default',
    },
    // Figures like downloads and proceeds aren't phone numbers.
    formatDetection: { telephone: false, date: false, address: false, email: false },
  }
}

export function pwaViewport(theme: ThemeId): Viewport {
  return {
    width: 'device-width',
    initialScale: 1,
    // Fill the screen; the top bar and tab bar pad themselves with the safe-area insets.
    viewportFit: 'cover',
    themeColor:
      theme === 'system'
        ? [
            { media: '(prefers-color-scheme: light)', color: THEME_COLORS.light },
            { media: '(prefers-color-scheme: dark)', color: THEME_COLORS.dark },
          ]
        : THEME_COLORS[theme],
  }
}
