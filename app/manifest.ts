import type { MetadataRoute } from 'next'
import { THEME_COLORS } from '@/lib/theme'

/** Installing OpenConnect to the home screen or dock: it opens on its own, without browser bars. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'OpenConnect',
    short_name: 'OpenConnect',
    description: 'Self-hosted App Store Connect analytics',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: THEME_COLORS.dark,
    theme_color: THEME_COLORS.dark,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'ASO', url: '/aso' },
      { name: 'Marketing', url: '/marketing' },
      { name: 'Studio', url: '/studio' },
    ],
  }
}
