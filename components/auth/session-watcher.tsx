'use client'

import { useEffect } from 'react'

/** When an API call says the session is gone (expired, signed out elsewhere), go to sign-in. */
export function SessionWatcher() {
  useEffect(() => {
    const original = window.fetch
    window.fetch = async (...args) => {
      const res = await original(...args)
      const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof Request ? args[0].url : String(args[0])
      if (res.status === 401 && url.includes('/api/') && !url.includes('/api/auth') && location.pathname !== '/login') {
        location.href = '/login'
      }
      return res
    }
    return () => {
      window.fetch = original
    }
  }, [])
  return null
}
