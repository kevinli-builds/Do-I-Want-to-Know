'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getUserId, setUserId as persistUserId } from './lib/userId'
import { upsertUser, getWrapped, syncEmails, startConnect, ReauthError, type WrappedData } from './lib/api'
import { loadWrappedCache, saveWrappedCache, clearWrappedCache } from './lib/cache'
import { ConnectView } from './components/ConnectView'
import { WrappedView } from './components/WrappedView'
import { MonitorView } from './components/MonitorView'
import { TransactionsView } from './components/TransactionsView'
import { UnsubscribeView } from './components/UnsubscribeView'

export default function Home() {
  const [userId,    setUserId]    = useState('')
  const [connected, setConnected] = useState(false)
  const [wrapped,   setWrapped]   = useState<WrappedData | null>(null)
  const [cachedAt,  setCachedAt]  = useState<number | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [yearLoading,  setYearLoading]  = useState(false)
  const [view, setView] = useState<'wrapped' | 'monitor' | 'audit' | 'unsubscribe'>('wrapped')
  // Global sync state (the floating button works on every tab)
  const [syncing, setSyncing] = useState(false)
  const [syncNotice, setSyncNotice] = useState<{ text: string; error?: boolean; reauth?: boolean } | null>(null)
  // Bumped after a sync so the data-fetching tabs (Monitor/Audit/Unsubscribe) reload
  const [refreshKey, setRefreshKey] = useState(0)
  // True while the initial status check is still in-flight but we've already
  // shown the Connect screen (Render free-tier cold-start can take 30-50 s).
  const [slowStart, setSlowStart] = useState(false)
  const slowStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch fresh data from the backend and update both state + local cache.
  // Only the all-time view (year === null) is cached, so the instant-load
  // dashboard always reflects the full picture.
  const loadWrapped = useCallback(async (id: string, year: number | null = null) => {
    const data = await getWrapped(id, year)
    setWrapped(data)
    setConnected(data.connected)
    if (year === null) {
      saveWrappedCache(id, data)
      setCachedAt(Date.now())
    }
  }, [])

  // Year toggle — re-fetch scoped stats (pure DB read, no Claude cost).
  const handleSelectYear = useCallback(async (year: number | null) => {
    setSelectedYear(year)
    setYearLoading(true)
    try {
      await loadWrapped(userId, year)
    } catch {
      /* keep showing whatever we have */
    } finally {
      setYearLoading(false)
    }
  }, [userId, loadWrapped])

  // Global sync — triggered by the floating button on any tab.
  const handleSync = useCallback(async () => {
    if (!userId) return
    setSyncing(true)
    setSyncNotice(null)
    try {
      const result = await syncEmails(userId)
      setSyncNotice({
        text: result.synced > 0
          ? `Synced ${result.synced} new email${result.synced === 1 ? '' : 's'}.`
          : (result.message ?? "You're already up to date."),
      })
      setRefreshKey(k => k + 1)              // reload Monitor/Audit/Unsubscribe
      await loadWrapped(userId, selectedYear) // reload Wrapped
    } catch (e) {
      if (e instanceof ReauthError) setSyncNotice({ text: e.message, error: true, reauth: true })
      else setSyncNotice({ text: e instanceof Error ? e.message : 'Sync failed', error: true })
    } finally {
      setSyncing(false)
    }
  }, [userId, selectedYear, loadWrapped])

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
      <>
        <nav className="view-tabs no-print">
          <button
            className={`view-tab${view === 'wrapped' ? ' active' : ''}`}
            onClick={() => setView('wrapped')}
          >
            Wrapped
          </button>
          <button
            className={`view-tab${view === 'monitor' ? ' active' : ''}`}
            onClick={() => setView('monitor')}
          >
            Monitor
          </button>
          <button
            className={`view-tab${view === 'audit' ? ' active' : ''}`}
            onClick={() => setView('audit')}
          >
            Audit
          </button>
          <button
            className={`view-tab${view === 'unsubscribe' ? ' active' : ''}`}
            onClick={() => setView('unsubscribe')}
          >
            Unsubscribe
          </button>
        </nav>
        {view === 'wrapped' ? (
          <WrappedView
            userId={userId}
            data={wrapped}
            cachedAt={cachedAt}
            selectedYear={selectedYear}
            onSelectYear={handleSelectYear}
            yearLoading={yearLoading}
            onOpenUnsubscribe={() => setView('unsubscribe')}
          />
        ) : view === 'monitor' ? (
          <MonitorView userId={userId} refreshKey={refreshKey} />
        ) : view === 'audit' ? (
          <TransactionsView userId={userId} refreshKey={refreshKey} />
        ) : (
          <UnsubscribeView userId={userId} refreshKey={refreshKey} />
        )}

        {/* Floating sync — available on every tab */}
        <div className="fab-wrap no-print">
          {syncNotice && (
            <div className={`fab-toast${syncNotice.error ? ' error' : ''}`}>
              <span>{syncNotice.text}</span>
              {syncNotice.reauth && (
                <button className="link-btn" onClick={() => startConnect(userId)}>Connect</button>
              )}
              <button className="fab-toast-x" onClick={() => setSyncNotice(null)} aria-label="Dismiss">×</button>
            </div>
          )}
          <button className="fab" onClick={handleSync} disabled={syncing}>
            {syncing ? '⏳ Syncing…' : '🔄 Sync Emails'}
          </button>
        </div>
      </>
    )
  }

  return <ConnectView userId={userId} slowStart={slowStart} />
}
