// "Guess before you look" — the on-brand flagship delight (see OPUS_BRIEF D1).
// Before revealing the (scary) yearly total, we ask the user to guess it, then
// stage a reveal with the delta. The guess is remembered per scope so re-visits
// skip straight to the number, and the share card can print the guess-vs-actual.

import type { WrappedScope } from './types'

const PREFIX = 'diwtkn_guess_'

// A stable key for a scope, so each window (total / a year / a month / custom)
// gets its own remembered guess.
export function scopeKey(scope: WrappedScope): string {
  switch (scope.mode) {
    case 'year':   return `year:${scope.year}`
    case 'month':  return `month:${scope.month}`
    case 'custom': return `custom:${scope.from}:${scope.to}`
    default:       return 'total'
  }
}

// Sentinel stored when the user chose to skip guessing — we still record that
// they've "seen" this scope (so we don't re-prompt) but show no delta.
const SKIPPED = '__skip__'

function key(userId: string, scope: WrappedScope): string {
  return `${PREFIX}${userId}_${scopeKey(scope)}`
}

export interface GuessState {
  seen: boolean          // has the user acted on this scope's prompt?
  guess: number | null   // their numeric guess, or null if skipped
}

export function loadGuess(userId: string, scope: WrappedScope): GuessState {
  if (typeof window === 'undefined') return { seen: false, guess: null }
  try {
    const raw = window.localStorage.getItem(key(userId, scope))
    if (raw == null) return { seen: false, guess: null }
    if (raw === SKIPPED) return { seen: true, guess: null }
    const n = Number(raw)
    return { seen: true, guess: Number.isFinite(n) ? n : null }
  } catch {
    return { seen: false, guess: null }
  }
}

export function saveGuess(userId: string, scope: WrappedScope, guess: number): void {
  try { window.localStorage.setItem(key(userId, scope), String(guess)) } catch { /* ignore */ }
}

export function skipGuess(userId: string, scope: WrappedScope): void {
  try { window.localStorage.setItem(key(userId, scope), SKIPPED) } catch { /* ignore */ }
}
