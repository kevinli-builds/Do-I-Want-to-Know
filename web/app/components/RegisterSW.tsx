'use client'

import { useEffect } from 'react'

// Registers the service worker so the app is installable (and survives offline
// as a shell). Fails silently where service workers aren't supported.
export function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}
