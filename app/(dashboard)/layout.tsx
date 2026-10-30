import type { Metadata, Viewport } from 'next'
import './globals.css'
import { SessionWatcher } from '@/components/auth/session-watcher'
import { AppShell } from '@/components/nav/app-shell'
import { getUiPrefs } from '@/lib/config'
import { pwaMetadata, pwaViewport } from '@/lib/pwa'
import { SYSTEM_THEME_SCRIPT } from '@/lib/theme'
import type { ThemeId } from '@/lib/prefs'

// The saved theme is read per request so the page arrives already in the right colours.
export const dynamic = 'force-dynamic'

function savedTheme(): ThemeId {
  try {
    return getUiPrefs().theme
  } catch {
    return 'dark'
  }
}

export function generateMetadata(): Metadata {
  return {
    title: 'OpenConnect',
    description: 'Self-hosted App Store Connect analytics',
    ...pwaMetadata(savedTheme()),
  }
}

export function generateViewport(): Viewport {
  return pwaViewport(savedTheme())
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const theme = savedTheme()
  return (
    <html lang="en" className={theme === 'dark' ? 'dark' : undefined} data-theme={theme} suppressHydrationWarning>
      <head>
        {/* "System" can only be decided in the browser; do it before the first paint. */}
        {theme === 'system' && <script dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />}
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <SessionWatcher />
        <AppShell />
        {children}
      </body>
    </html>
  )
}
