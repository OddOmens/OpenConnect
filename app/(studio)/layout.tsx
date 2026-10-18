import type { Metadata } from 'next'
// The studio's own look (its CSS sets html, body and form controls), kept apart from the
// dashboard's: a separate root layout means a full page load between the two.
import '@studio/fonts'
import '@studio/styles.css'
import { SessionWatcher } from '@/components/auth/session-watcher'

export const metadata: Metadata = {
  title: 'Studio · OpenConnect',
  description: 'App Store screenshot studio',
}

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionWatcher />
        {children}
      </body>
    </html>
  )
}
