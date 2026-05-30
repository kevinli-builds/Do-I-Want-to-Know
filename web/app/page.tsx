'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getUserId, setUserId as persistUserId } from './lib/userId'
import { upsertUser, getWrapped, type WrappedData } from './lib/api'
import { loadWrappedCache, saveWrappedCache, clearWrappedCache } from './lib/cache'
import { ConnectView } from './components/ConnectView'
import { WrappedView } from './components/WrappedView'

export default function Home() {
  const [userId,    setUserId]    = useState('')
  const [connected, setConnected] = useState(false)
  const [wrapped,   setWrapped]   = useState<WrappedData | null>(null)
  const [cachedAt,  setCachedAt]  = useState<number | null>(null)
  const [loading,   setLoading]   = useState(true)
  // True while the initial status check is still in-flight but we've already
  // shown the Connect screen (Render free-tier cold-start can take 30-50 s).
  const [slowStart, setSlowStart] = useState(false)
  const slowStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch fresh data from the backend and update both state + local cache.
  const loadWrapped = useCallback(async (id: string) => {
    const data = await getWrapped(id)
    setWrapped(data)
    setConnected(data.connected)
    saveWrappedCache(id, data)
    setCachedAt(Date.now())
  }, [])

  useEffect(() => {
    async function init() {
      let id = getUserId()

      // Returning from the OAuth flow: adopt the canonical user id the backend
      // resolved from the Gmail address, so this device converges onto the same
      // identity (and data) as any other device that connected this Gmail.
      if (typeof window !== 'undefined' && window.location.search.includes('connected=1')) {
        const uid = new URLSearchParams(window.location.search).get('uid')
        if (uid && uid !== id) {
          persistUserId(uid)
          id = uid
        }
        window.history.replaceState({}, '', window.location.pathname)
      }

      setUserId(id)

      // 1. Instant render from local cache, if we have prior results.
      const cached = loadWrappedCache(id)
      const haveCache = !!cached?.data?.connected
      if (haveCache) {
        setWrapped(cached!.data)
        setConnected(true)
        setCachedAt(cached!.cachedAt)
        setLoading(false)
      } else {
        // No cache: only then do we need the cold-start fallback timer so we
        // don't spin forever while Render wakes up.
        slowStartTimerRef.current = setTimeout(() => {
          setLoading(false)
          setSlowStart(true)
        }, 8000)
      }

      // 2. Refresh from the backend in the background (stale-while-revalidate).
      try {
        const status = await upsertUser(id)
        if (slowStartTimerRef.current) clearTimeout(slowStartTimerRef.current)
        setSlowStart(false)

        if (status.connected) {
          await loadWrapped(id)
        } else {
          // Server authoritatively says not connected (e.g. Gmail disconnected
          // or token revoked) — drop any stale cache and show Connect.
          setConnected(false)
          clearWrappedCache(id)
          setWrapped(null)
          setCachedAt(null)
        }
      } catch {
        // Backend unreachable / cold. Keep showing cached data if we have it;
        // otherwise fall back to the Connect screen.
        if (slowStartTimerRef.current) clearTimeout(slowStartTimerRef.current)
        setSlowStart(false)
        if (!haveCache) setConnected(false)
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
    return (
      <WrappedView
        userId={userId}
        data={wrapped}
        cachedAt={cachedAt}
        onRefresh={() => loadWrapped(userId)}
      />
    )
  }

  return <ConnectView userId={userId} slowStart={slowStart} />
}
