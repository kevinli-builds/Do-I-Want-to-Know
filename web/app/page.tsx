'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getUserId, setUserId as persistUserId } from './lib/userId'
import { upsertUser, getWrapped, syncEmails, startConnect, exchangeCode, disconnectGmail, deleteMyData, setDemoMode, isDemoMode, ReauthError, type WrappedData, type WrappedScope } from './lib/api'
import { DEMO_USER_ID } from './lib/demo'
import { loadWrappedCache, saveWrappedCache, clearWrappedCache } from './lib/cache'
import { monthYear } from './lib/dates'
import { ConnectView } from './components/ConnectView'
import { DemoBanner } from './components/DemoBanner'
import { WrappedView } from './components/WrappedView'
import { MonitorView } from './components/MonitorView'
import { TransactionsView } from './components/TransactionsView'
import { UnsubscribeView } from './components/UnsubscribeView'
import { PromotionsView } from './components/PromotionsView'
import { UpcomingFloater } from './components/UpcomingFloater'
import { IntroTour } from './components/IntroTour'
import { VendorPanel } from './components/VendorPanel'

export default function Home() {
  const [userId,    setUserId]    = useState('')
  const [connected, setConnected] = useState(false)
  const [wrapped,   setWrapped]   = useState<WrappedData | null>(null)
  const [cachedAt,  setCachedAt]  = useState<number | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [scope,        setScope]        = useState<WrappedScope>({ mode: 'total' })
  const [scopeLoading, setScopeLoading] = useState(false)
  const [view, setView] = useState<'wrapped' | 'monitor' | 'audit' | 'promotions' | 'unsubscribe'>('wrapped')
  // On phones the tab bar scrolls horizontally — keep the active tab visible.
  // Instant (not smooth): smooth scroll animations are rAF-driven and silently
  // no-op in throttled/background tabs, leaving the tab offscreen.
  const tabsRef = useRef<HTMLElement>(null)
  useEffect(() => {
    tabsRef.current
      ?.querySelector('.view-tab.active')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [view])
  const [demo, setDemo] = useState(false)
  // Global sync state (the floating button works on every tab)
  const [syncing, setSyncing] = useState(false)
  const [syncNotice, setSyncNotice] = useState<{ text: string; error?: boolean; reauth?: boolean } | null>(null)
  // Bumped after a sync so the data-fetching tabs (Monitor/Audit/Unsubscribe) reload
  const [refreshKey, setRefreshKey] = useState(0)
  // Sync customization + progress
  const [syncYears, setSyncYears] = useState(3)
  const [syncMax, setSyncMax] = useState(500)
  const [showSyncOpts, setShowSyncOpts] = useState(false)
  const [progress, setProgress] = useState<{ count: number; examined: number; oldest: string | null }>({ count: 0, examined: 0, oldest: null })
  const [caughtUp, setCaughtUp] = useState(true)
  // True while the initial status check is still in-flight but we've already
  // shown the Connect screen (Render free-tier cold-start can take 30-50 s).
  const [slowStart, setSlowStart] = useState(false)
  const slowStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // First-visit tour of the dashboard (also reopenable via the ? tab button)
  const [showTour, setShowTour] = useState(false)
  // Vendor drilldown (§9 A3) — opened from a vendor name on any tab
  const [vendor, setVendor] = useState<string | null>(null)

  const closeTour = useCallback(() => {
    setShowTour(false)
    try { localStorage.setItem('diwtkn_tour_seen', '1') } catch {}
  }, [])

  // Restore + persist sync settings on this device
  useEffect(() => {
    const y = Number(localStorage.getItem('diwtkn_sync_years'))
    const m = Number(localStorage.getItem('diwtkn_sync_max'))
    if (y) setSyncYears(y)
    if (m) setSyncMax(m)
  }, [])
  useEffect(() => { localStorage.setItem('diwtkn_sync_years', String(syncYears)) }, [syncYears])
  useEffect(() => { localStorage.setItem('diwtkn_sync_max', String(syncMax)) }, [syncMax])

  // First time the dashboard renders on this device (real or demo), open the
  // quick tour. closeTour sets the flag, so this never re-fires afterwards.
  useEffect(() => {
    if (!connected || !wrapped) return
    try {
      if (!localStorage.getItem('diwtkn_tour_seen')) setShowTour(true)
    } catch {}
  }, [connected, wrapped])

  // Fetch fresh data from the backend and update both state + local cache.
  // Only the all-time ("total") view is cached, so the instant-load dashboard
  // always reflects the full picture.
  const loadWrapped = useCallback(async (id: string, s: WrappedScope = { mode: 'total' }) => {
    const data = await getWrapped(id, s)
    setWrapped(data)
    setConnected(data.connected)
    if (s.mode === 'total') {
      saveWrappedCache(id, data)
      setCachedAt(Date.now())
    }
  }, [])

  // Scope picker — re-fetch stats for the chosen window (pure DB read, no Claude).
  const handleScopeChange = useCallback(async (s: WrappedScope) => {
    setScope(s)
    setScopeLoading(true)
    try {
      await loadWrapped(userId, s)
    } catch {
      /* keep showing whatever we have */
    } finally {
      setScopeLoading(false)
    }
  }, [userId, loadWrapped])

  // Global sync — triggered by the floating button on any tab.
  const handleSync = useCallback(async () => {
    if (!userId) return
    setSyncing(true)
    setSyncNotice(null)
    try {
      const result = await syncEmails(userId, { lookbackDays: syncYears * 365, maxEmails: syncMax })
      const done = result.caughtUp ?? true
      setCaughtUp(done)
      setSyncNotice({
        text: result.synced > 0
          ? (done
              ? `Synced ${result.synced} new email${result.synced === 1 ? '' : 's'} — all caught up ✓`
              : `Synced ${result.synced} — tap Sync again to load older mail.`)
          : (result.message ?? "You're all caught up."),
      })
      setProgress({ count: result.total, examined: result.examinedCount ?? 0, oldest: result.oldestDate ?? null })
      setRefreshKey(k => k + 1)        // reload Monitor/Audit/Unsubscribe
      await loadWrapped(userId, scope) // reload Wrapped in the current scope
    } catch (e) {
      if (e instanceof ReauthError) setSyncNotice({ text: e.message, error: true, reauth: true })
      else setSyncNotice({ text: e instanceof Error ? e.message : 'Sync failed', error: true })
    } finally {
      setSyncing(false)
    }
  }, [userId, scope, loadWrapped, syncYears, syncMax])

  // Disconnect Gmail: revoke server-side, drop local token + cache, show Connect.
  const handleDisconnect = useCallback(async () => {
    if (!window.confirm('Disconnect Gmail? Your token is revoked and you’ll need to reconnect to sync again. Your existing data is kept.')) return
    try {
      await disconnectGmail()
    } catch {
      /* even if the server call fails, fall through and reset locally */
    }
    clearWrappedCache(userId)
    setWrapped(null)
    setCachedAt(null)
    setConnected(false)
    setView('wrapped')
  }, [userId])

  // Delete my data: full, irreversible server-side erasure (CASA requirement) —
  // double-confirmed, and local state is wiped only after the server confirms.
  const handleDeleteData = useCallback(async () => {
    if (!window.confirm('Delete ALL your data? This permanently erases every extracted record, budget, and setting on our servers. This cannot be undone.')) return
    if (!window.confirm('Last check: this is permanent. Your Gmail access is revoked and your entire history here is erased. Delete everything?')) return
    try {
      await deleteMyData()
    } catch (e) {
      setSyncNotice({ text: e instanceof Error ? e.message : 'Deletion failed — please try again.', error: true })
      return
    }
    clearWrappedCache(userId)
    setWrapped(null)
    setCachedAt(null)
    setConnected(false)
    setView('wrapped')
    setSyncNotice({ text: 'All your data has been deleted.', error: false })
  }, [userId])

  // Enter demo mode: flip the API into fixture mode and render the connected UI
  // from sample data — no OAuth, no backend, no Claude.
  const handleTryDemo = useCallback(async () => {
    setDemoMode(true)
    setDemo(true)
    setUserId(DEMO_USER_ID)
    setScope({ mode: 'total' })
    setView('wrapped')
    setCachedAt(null)
    try { await loadWrapped(DEMO_USER_ID) } catch { /* fixtures never fail, but be safe */ }
    setConnected(true)
  }, [loadWrapped])

  // Leave demo mode and return to the Connect screen with the real device id.
  const handleExitDemo = useCallback(() => {
    setDemoMode(false)
    setDemo(false)
    setConnected(false)
    setWrapped(null)
    setCachedAt(null)
    setView('wrapped')
    setUserId(getUserId())
  }, [])

  useEffect(() => {
    async function init() {
      // If the user is exploring the demo, don't let a (re-)run of init clobber
      // the demo identity/state (e.g. its synchronous setUserId below).
      if (isDemoMode()) return
      let id = getUserId()

      // Returning from the OAuth flow: trade the one-time code for a session
      // token + the canonical user id (keyed by the Gmail address), so this
      // device converges onto the same identity/data as any other device that
      // connected this Gmail — and is authenticated for it.
      if (typeof window !== 'undefined' && window.location.search.includes('connected=1')) {
        const code = new URLSearchParams(window.location.search).get('code')
        // Strip the code from the URL immediately so it never lingers in history.
        window.history.replaceState({}, '', window.location.pathname)
        if (code) {
          try {
            const { userId: canonicalId } = await exchangeCode(code)
            if (canonicalId && canonicalId !== id) {
              persistUserId(canonicalId)
              id = canonicalId
            }
          } catch {
            // Code expired or already used — fall through to the normal status
            // check; the user will land on Connect and can reconnect.
          }
        }
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
        // The user may have entered demo mode while this was in flight — if so,
        // don't clobber the demo view with the real (unconnected) status.
        if (isDemoMode()) return
        if (slowStartTimerRef.current) clearTimeout(slowStartTimerRef.current)
        setSlowStart(false)
        setProgress({ count: status.entryCount ?? 0, examined: status.examinedCount ?? 0, oldest: status.oldestDate ?? null })
        setCaughtUp(status.caughtUp ?? true)

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
        if (isDemoMode()) return
        if (slowStartTimerRef.current) clearTimeout(slowStartTimerRef.current)
        setSlowStart(false)
        if (!haveCache) setConnected(false)
      } finally {
        if (!isDemoMode()) setLoading(false)
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
        {demo && <DemoBanner userId={getUserId()} onExit={handleExitDemo} />}
        {showTour && <IntroTour demo={demo} onClose={closeTour} />}
        <nav className="view-tabs no-print" ref={tabsRef}>
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
            className={`view-tab${view === 'promotions' ? ' active' : ''}`}
            onClick={() => setView('promotions')}
          >
            Promotions
          </button>
          <button
            className={`view-tab${view === 'unsubscribe' ? ' active' : ''}`}
            onClick={() => setView('unsubscribe')}
          >
            Unsubscribe
          </button>
          <button className="tour-help" onClick={() => setShowTour(true)} title="Quick tour" aria-label="Quick tour">
            ?
          </button>
        </nav>
        {view === 'wrapped' ? (
          <WrappedView
            userId={userId}
            data={wrapped}
            cachedAt={cachedAt}
            scope={scope}
            onScopeChange={handleScopeChange}
            scopeLoading={scopeLoading}
            onOpenUnsubscribe={() => setView('unsubscribe')}
            onOpenAudit={() => setView('audit')}
            onDisconnect={handleDisconnect}
            onDeleteData={handleDeleteData}
            onOpenVendor={setVendor}
            demo={demo}
          />
        ) : view === 'monitor' ? (
          <MonitorView userId={userId} refreshKey={refreshKey} onOpenVendor={setVendor} />
        ) : view === 'audit' ? (
          <TransactionsView
            userId={userId}
            refreshKey={refreshKey}
            onChanged={() => { loadWrapped(userId, scope).catch(() => {}) }}
            onOpenVendor={setVendor}
          />
        ) : view === 'promotions' ? (
          <PromotionsView userId={userId} refreshKey={refreshKey} />
        ) : (
          <UnsubscribeView userId={userId} refreshKey={refreshKey} />
        )}

        {/* Vendor drilldown — stays mounted so its ledger fetch is reused */}
        <VendorPanel
          userId={userId}
          vendor={vendor}
          onClose={() => setVendor(null)}
          onOpenAudit={() => setView('audit')}
        />

        {/* Upcoming deliveries / flights / events — top-right floater */}
        <UpcomingFloater userId={userId} refreshKey={refreshKey} />

        {/* Floating sync — available on every tab (hidden in demo mode) */}
        {!demo && (
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

          {showSyncOpts && (
            <div className="sync-opts">
              <label>
                History
                <select value={syncYears} onChange={e => setSyncYears(Number(e.target.value))}>
                  <option value={1}>1 year</option>
                  <option value={2}>2 years</option>
                  <option value={3}>3 years</option>
                  <option value={4}>4 years</option>
                  <option value={5}>5 years</option>
                </select>
              </label>
              <label>
                Per sync
                <select value={syncMax} onChange={e => setSyncMax(Number(e.target.value))}>
                  <option value={100}>100 emails</option>
                  <option value={250}>250 emails</option>
                  <option value={500}>500 emails</option>
                  <option value={1000}>1,000 emails</option>
                  <option value={2000}>2,000 emails</option>
                  <option value={5000}>5,000 emails</option>
                  <option value={10000}>10,000 emails</option>
                </select>
              </label>
              <p className="sync-opts-hint">Bigger syncs take longer; if one stops early, just sync again — it picks up where it left off.</p>
              {syncMax >= 5000 && (
                <p className="sync-opts-hint warn">⚠️ Large syncs run across several passes — they won’t all land in one go. Keep syncing and the “back to” date marches earlier.</p>
              )}
            </div>
          )}

          {(progress.examined > 0 || progress.count > 0) && (
            <div className={`fab-progress${!caughtUp ? ' more' : ''}`}>
              {progress.examined.toLocaleString()} evaluated · {progress.count.toLocaleString()} stored{progress.oldest ? ` · back to ${monthYear(progress.oldest)}` : ''}
              <span className="fab-progress-state">
                {caughtUp ? ' · ✓ up to date' : ' · more to load — keep syncing'}
              </span>
            </div>
          )}

          <div className="fab-row">
            <button className="fab-gear" onClick={() => setShowSyncOpts(s => !s)} title="Sync settings" aria-label="Sync settings">⚙</button>
            <button className="fab" onClick={handleSync} disabled={syncing}>
              {syncing ? '⏳ Syncing…' : '🔄 Sync Emails'}
            </button>
          </div>
        </div>
        )}
      </>
    )
  }

  return <ConnectView userId={userId} slowStart={slowStart} onTryDemo={handleTryDemo} />
}
