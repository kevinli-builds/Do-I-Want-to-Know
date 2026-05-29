'use client'

import { useCallback, useEffect, useState } from 'react'
import { getUserId } from './lib/userId'
import { upsertUser, getWrapped, type WrappedData } from './lib/api'
import { ConnectView } from './components/ConnectView'
import { WrappedView } from './components/WrappedView'

export default function Home() {
  const [userId, setUserId] = useState('')
  const [connected, setConnected] = useState(false)
  const [wrapped, setWrapped] = useState<WrappedData | null>(null)
  const [loading, setLoading] = useState(true)

  const loadWrapped = useCallback(async (id: string) => {
    const data = await getWrapped(id)
    setWrapped(data)
    setConnected(data.connected)
  }, [])

  useEffect(() => {
    async function init() {
      const id = getUserId()
      setUserId(id)

      // If we just came back from the OAuth flow, clean the URL
      if (typeof window !== 'undefined' && window.location.search.includes('connected=1')) {
        window.history.replaceState({}, '', window.location.pathname)
      }

      try {
        const status = await upsertUser(id)
        if (status.connected) {
          await loadWrapped(id)
        } else {
          setConnected(false)
        }
      } catch {
        // Backend unreachable (e.g. Render cold start) — show connect screen
        setConnected(false)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [loadWrapped])

  if (loading) {
    return (
      <div className="center-spin">
        <div className="spinner" />
      </div>
    )
  }

  if (connected && wrapped) {
    return <WrappedView userId={userId} data={wrapped} onRefresh={() => loadWrapped(userId)} />
  }

  return <ConnectView userId={userId} />
}
