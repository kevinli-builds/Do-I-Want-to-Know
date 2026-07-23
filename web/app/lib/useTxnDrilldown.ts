import { useCallback, useState } from 'react'
import { getTransactions, type Transaction } from './api'

export type TxnLoadState = 'idle' | 'loading' | 'error' | 'done'

/**
 * Shared state machine for expandable "drill-down" rows (used by both the
 * Wrapped sections and the Monitor Top-Senders list). The full transaction list
 * is fetched lazily ONCE on the first expand, then reused; `open` tracks which
 * row keys are expanded. Components render their own detail markup from `txns`.
 */
export function useTxnDrilldown(userId: string) {
  const [txns, setTxns] = useState<Transaction[] | null>(null)
  const [state, setState] = useState<TxnLoadState>('idle')
  const [open, setOpen] = useState<Set<string>>(new Set())

  const ensure = useCallback(async () => {
    if (state === 'loading' || state === 'done') return
    setState('loading')
    try {
      setTxns(await getTransactions(userId))
      setState('done')
    } catch {
      setState('error')
    }
  }, [state, userId])

  const toggle = useCallback((key: string) => {
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    void ensure()
  }, [ensure])

  const retry = useCallback(() => { setState('idle'); void ensure() }, [ensure])

  return { txns, state, open, toggle, retry }
}
