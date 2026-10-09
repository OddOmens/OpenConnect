import type { Metadata } from 'next'
import './globals.css'
import { SessionWatcher } from '@/components/auth/session-watcher'
import { getUiPrefs } from '@/lib/config'
import { SYSTEM_THEME_SCRIPT } from '@/lib/theme'
import type { ThemeId } from '@/lib/prefs'

export const metadata: Metadata = {
  title: 'OpenConnect',
  description: 'Self-hosted App Store Connect analytics',
}

// The saved theme is read per request so the page arrives already in the right colours.
export const dynamic = 'force-dynamic'

function savedTheme(): ThemeId {
  try {
    return getUiPrefs().theme
  } catch {
    return 'dark'
  }
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
        {children}
      </body>
    </html>
  )
}
