import type { Metadata, Viewport } from 'next'
// The studio's own look (its CSS sets html, body and form controls), kept apart from the
// dashboard's: a separate root layout means a full page load between the two.
import '@studio/fonts'
import '@studio/styles.css'
import { SessionWatcher } from '@/components/auth/session-watcher'
import { AppShell } from '@/components/nav/app-shell'
import { getUiPrefs } from '@/lib/config'
import { pwaMetadata, pwaViewport } from '@/lib/pwa'

// The theme is read per request so the page arrives in the right colours.
export const dynamic = 'force-dynamic'

/** OpenConnect's light/dark setting, which the studio follows until it's changed there. */
function dashboardTheme() {
  try {
    return getUiPrefs().theme
  } catch {
    return 'system'
  }
}

export function generateMetadata(): Metadata {
  return {
    title: 'Studio · OpenConnect',
    description: 'App Store screenshot studio',
    ...pwaMetadata(dashboardTheme()),
  }
}

export function generateViewport(): Viewport {
  return pwaViewport(dashboardTheme())
}

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const theme = dashboardTheme()
  return (
    <html lang="en" data-oc-theme={theme} data-theme={theme === 'light' ? 'light' : theme === 'dark' ? 'dark' : undefined} suppressHydrationWarning>
      <body>
        <SessionWatcher />
        <AppShell />
        {children}
      </body>
    </html>
  )
}
