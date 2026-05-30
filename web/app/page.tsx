'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getUserId } from './lib/userId'
import { upsertUser, getWrapped, type WrappedData } from './lib/api'
import { ConnectView } from './components/ConnectView'
import { WrappedView } from './components/WrappedView'

export default function Home() {
  const [userId,    setUserId]    = useState('')
  const [connected, setConnected] = useState(false)
  const [wrapped,   setWrapped]   = useState<WrappedData | null>(null)
  const [loading,   setLoading]   = useState(true)
  // True while the initial status check is still in-flight but we've already
  // shown the Connect screen (Render free-tier cold-start can take 30-50 s).
  const [slowStart, setSlowStart] = useState(false)
  const slowStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadWrapped = useCallback(async (id: string) => {
    const data = await getWrapped(id)
    setWrapped(data)
    setConnected(data.connected)
  }, [])

  useEffect(() => {
    async function init() {
      const id = getUserId()
      setUserId(id)

      if (typeof window !== 'undefined' && window.location.search.includes('connected=1')) {
        window.history.replaceState({}, '', window.location.pathname)
      }

      // After 8 s with no backend response, stop blocking the UI and show the
      // Connect screen. The fetch stays in-flight — if the server eventually
      // wakes up and the user is already connected, the app auto-transitions.
      slowStartTimerRef.current = setTimeout(() => {
        setLoading(false)
        setSlowStart(true)
      }, 8000)

      try {
        const status = await upsertUser(id)

        // Backend responded — clear the fallback timer and proceed normally
        if (slowStartTimerRef.current) clearTimeout(slowStartTimerRef.current)
        setSlowStart(false)

        if (status.connected) {
          await loadWrapped(id)
        } else {
          setConnected(false)
        }
      } catch {
        if (slowStartTimerRef.current) clearTimeout(slowStartTimerRef.current)
        setSlowStart(false)
        setConnected(false)
      } finally {
        setLoading(false)
      }
    }

    init()

    return () => {
      if (slowStartTimerRef.current) clearTimeout(slowStartTimerRef.current)
    }
  }, [loadWrapped])

  if (loading) {
    return (
      <div className="center-spin">
        <div className="spinner" />
        <p style={{ marginTop: 16, color: 'var(--muted)', fontSize: 14 }}>
          Connecting to server…
        </p>
      </div>
    )
  }

  if (connected && wrapped) {
    return <WrappedView userId={userId} data={wrapped} onRefresh={() => loadWrapped(userId)} />
  }

  return <ConnectView userId={userId} slowStart={slowStart} />
}
