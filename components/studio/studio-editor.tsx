'use client'

import dynamic from 'next/dynamic'

// The editor works with the browser from its first render (URL, storage, pointer, live
// updates), so it only renders there. Its API stays in the studio container, at /studio/api.
export const StudioEditor = dynamic(() => import('@studio/Editor').then((m) => m.Editor), { ssr: false })
