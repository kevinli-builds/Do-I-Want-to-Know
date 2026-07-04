'use client'

import { useEffect, useState } from 'react'
import type { WrappedScope } from '../lib/api'
import { money } from '../lib/format'
import { loadGuess, saveGuess, skipGuess } from '../lib/guess'

// "Guess before you look" (OPUS_BRIEF D1). Renders the Wrapped hero card. Before
// the total is shown for a given scope, the user is asked to guess it; a short
// drumroll then reveals the real number with the delta. The guess is remembered
// per scope so revisits skip straight to the reveal.
export function GuessReveal({
  userId,
  scope,
  scopeLabel,
  total,
  subtitle,
}: {
  userId: string
  scope: WrappedScope
  scopeLabel: string
  total: number
  subtitle: React.ReactNode
}) {
  // 'ask' → prompt · 'drumroll' → brief suspense · 'revealed' → show the number
  const [phase, setPhase] = useState<'ask' | 'drumroll' | 'revealed'>('revealed')
  const [guess, setGuess] = useState<number | null>(null)
  const [draft, setDraft] = useState('')

  // Re-evaluate whenever the scope changes: a scope we've already seen reveals
  // immediately; a fresh one prompts for a guess.
  useEffect(() => {
    const state = loadGuess(userId, scope)
    setGuess(state.guess)
    setPhase(state.seen ? 'revealed' : 'ask')
    setDraft('')
  }, [userId, scope])

  function submit() {
    const n = Number(draft.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(n) || n <= 0) return
    saveGuess(userId, scope, n)
    setGuess(n)
    setPhase('drumroll')
    setTimeout(() => setPhase('revealed'), 1100)
  }

  function skip() {
    skipGuess(userId, scope)
    setGuess(null)
    setPhase('revealed')
  }

  if (phase === 'ask') {
    return (
      <div className="card hero guess-hero">
        <h2>How much do you think you spent{scopeLabel}?</h2>
        <p className="guess-sub">Take a guess before the big reveal — no peeking.</p>
        <div className="guess-input-row">
          <span className="guess-currency">$</span>
          <input
            className="guess-input"
            type="text"
            inputMode="decimal"
            autoFocus
            placeholder="0"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            aria-label="Your guess"
          />
        </div>
        <div className="guess-actions">
          <button className="btn" onClick={submit} disabled={!draft.trim()}>Reveal 🥁</button>
          <button className="link-btn" onClick={skip}>Just show me</button>
        </div>
      </div>
    )
  }

  if (phase === 'drumroll') {
    return (
      <div className="card hero guess-hero">
        <h2>Net Spend{scopeLabel}</h2>
        <div className="big guess-drumroll">🥁 …</div>
        <div className="sub">You guessed {money(guess ?? 0)}</div>
      </div>
    )
  }

  // Revealed
  const delta = guess != null ? Math.round(total - guess) : null
  return (
    <div className="card hero">
      <h2>Net Spend{scopeLabel}</h2>
      <div className="big guess-pop">{money(total)}</div>
      <div className="sub">{subtitle}</div>
      {delta != null && (
        <div className={`guess-delta ${delta > 0 ? 'over' : delta < 0 ? 'under' : 'exact'}`}>
          {Math.abs(delta) < 1
            ? <>You guessed {money(guess!)} — nailed it 🎯</>
            : delta > 0
              ? <>You guessed {money(guess!)} — you were <strong>{money(Math.abs(delta))} optimistic</strong> 😬</>
              : <>You guessed {money(guess!)} — <strong>{money(Math.abs(delta))} under</strong> what you feared 😅</>}
        </div>
      )}
    </div>
  )
}
