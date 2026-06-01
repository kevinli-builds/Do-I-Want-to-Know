import { google, gmail_v1 } from 'googleapis'
import { prisma } from './prisma'

// How far back to look, and the max emails to ingest per sync. Configurable via
// env so the window/volume can be tuned without a code change.
const LOOKBACK_DAYS = Number(process.env.SYNC_LOOKBACK_DAYS ?? 1095) // ~3 years
const MAX_EMAILS = Number(process.env.SYNC_MAX_EMAILS ?? 2000)
const FETCH_CONCURRENCY = 25 // metadata gets per batch — paces us under Gmail's per-user rate limit

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.BASE_URL}/auth/google/callback`
  )
}

// Classify a Gmail/OAuth error so the UI can guide the user precisely:
//   'expired' → token expired/revoked (testing-mode refresh tokens last 7 days)
//   'scope'   → user connected but didn't grant Gmail read access
// Both are fixed by reconnecting, but the message differs.
export type GmailErrorKind = 'expired' | 'scope'
export function gmailErrorKind(err: unknown): GmailErrorKind | null {
  const e = err as { response?: { status?: number; data?: { error?: string } }; code?: number | string; message?: string }
  const status = e?.response?.status ?? e?.code
  const code = e?.response?.data?.error
  const msg = String(e?.message ?? '')
  if (
    status === 401 ||
    code === 'invalid_grant' ||
    code === 'unauthorized_client' ||
    /invalid_grant|invalid_token|expired or revoked/i.test(msg)
  ) return 'expired'
  if (/insufficient permission|insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions/i.test(msg))
    return 'scope'
  return null
}

export interface RawEmail {
  id: string
  subject: string
  from: string
  date: string
  snippet: string
  senderEmail: string | null
  unsubscribe: string | null
}

// Parse the bare email address out of a From header ("Nike <news@nike.com>")
export function parseSenderEmail(from: string): string | null {
  const angled = from.match(/<([^>]+)>/)
  const raw = (angled ? angled[1] : from).trim()
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw) ? raw.toLowerCase() : null
}

// Pick the best link out of a List-Unsubscribe header (prefer https one-click,
// fall back to mailto). Header looks like: <https://...>, <mailto:...>
export function parseUnsubscribe(header: string): string | null {
  if (!header) return null
  const links = [...header.matchAll(/<([^>]+)>/g)].map(m => m[1].trim())
  const http = links.find(l => /^https?:/i.test(l))
  if (http) return http
  const mail = links.find(l => /^mailto:/i.test(l))
  return mail ?? null
}

// Build an authed Gmail client and persist refreshed access tokens.
async function authedGmail(userId: string): Promise<gmail_v1.Gmail> {
  const token = await prisma.oAuthToken.findUnique({ where: { userId } })
  if (!token) throw new Error('No OAuth token for user')

  const oauth2Client = getOAuthClient()
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiresAt.getTime(),
  })
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await prisma.oAuthToken.update({
        where: { userId },
        data: {
          accessToken: tokens.access_token,
          expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
        },
      }).catch(() => {/* token row may have been replaced; ignore */})
    }
  })
  return google.gmail({ version: 'v1', auth: oauth2Client })
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

// Page a query newest → older, collecting IDs that aren't already in `seen`
// (already processed) or `collected` (this run), until `out` reaches `need` or
// the query is exhausted. A scan cap bounds how deep we page.
async function collectNewIds(
  gmail: gmail_v1.Gmail,
  q: string,
  seen: Set<string>,
  collected: Set<string>,
  out: string[],
  need: number,
): Promise<void> {
  let pageToken: string | undefined
  let scanned = 0
  const SCAN_CAP = 8000
  while (out.length < need && scanned < SCAN_CAP) {
    const res = await gmail.users.messages.list({ userId: 'me', q, maxResults: 500, pageToken })
    for (const m of res.data.messages ?? []) {
      scanned++
      if (m.id && !seen.has(m.id) && !collected.has(m.id)) {
        collected.add(m.id)
        out.push(m.id)
        if (out.length >= need) break
      }
    }
    pageToken = res.data.nextPageToken ?? undefined
    if (!pageToken) break
  }
}

// Step 1 — list up to `maxEmails` candidate message IDs the user hasn't
// processed yet, across purchase / promotions / charity queries over the
// lookback window. Because it skips already-stored IDs (`seen`) and pages
// newest → older, calling it on successive syncs walks progressively further
// back through history — so a large backfill happens across repeatable passes,
// each bounded to `maxEmails`. Per-sync overrides are clamped to safe bounds.
export async function listNewEmailIds(
  userId: string,
  seen: Set<string>,
  opts?: { lookbackDays?: number; maxEmails?: number }
): Promise<string[]> {
  const lookbackDays = clamp(Math.round(opts?.lookbackDays ?? LOOKBACK_DAYS), 30, 3650) // up to ~10 years
  const maxEmails = clamp(Math.round(opts?.maxEmails ?? MAX_EMAILS), 10, 10000)

  const gmail = await authedGmail(userId)
  const after = Math.floor((Date.now() - lookbackDays * 24 * 60 * 60 * 1000) / 1000)

  const queries = [
    [
      `after:${after}`,
      '(subject:order OR subject:receipt OR subject:invoice OR subject:confirmation',
      'OR subject:subscription OR subject:delivery OR subject:shipped OR subject:booking)',
    ].join(' '),
    `after:${after} category:promotions`,
    [
      `after:${after}`,
      '(subject:donation OR subject:donate OR subject:"your donation"',
      'OR subject:"your gift" OR subject:"thank you for your gift"',
      'OR subject:"tax receipt" OR subject:"tax deductible" OR subject:"charitable")',
    ].join(' '),
  ]

  const collected = new Set<string>()
  const out: string[] = []
  for (const q of queries) {
    if (out.length >= maxEmails) break
    await collectNewIds(gmail, q, seen, collected, out, maxEmails)
  }
  return out
}

// Step 2 — fetch metadata for the given message IDs, in throttled batches to
// stay under Gmail's per-user rate limit.
export async function fetchMetadataForIds(userId: string, ids: string[]): Promise<RawEmail[]> {
  if (ids.length === 0) return []
  const gmail = await authedGmail(userId)
  const out: RawEmail[] = []

  for (let i = 0; i < ids.length; i += FETCH_CONCURRENCY) {
    const chunk = ids.slice(i, i + FETCH_CONCURRENCY)
    // allSettled: a single message that 404s (deleted) or errors shouldn't
    // sink the whole sync — we just skip it. (An auth/scope error on the very
    // first call still surfaces below so the caller can prompt a reconnect.)
    const settled = await Promise.allSettled(
      chunk.map(id =>
        gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date', 'List-Unsubscribe'],
        })
      )
    )
    // If everything in the first chunk failed with an auth/scope problem, rethrow
    // so the caller returns a clean reconnect prompt instead of "0 synced".
    if (i === 0 && settled.every(s => s.status === 'rejected')) {
      const firstErr = (settled[0] as PromiseRejectedResult).reason
      if (gmailErrorKind(firstErr)) throw firstErr
    }
    for (const s of settled) {
      if (s.status !== 'fulfilled') continue
      const res = s.value
      const headers = res.data.payload?.headers ?? []
      const get = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
      const from = get('From')
      out.push({
        id: res.data.id!,
        subject: get('Subject'),
        from,
        date: get('Date'),
        snippet: res.data.snippet ?? '',
        senderEmail: parseSenderEmail(from),
        unsubscribe: parseUnsubscribe(get('List-Unsubscribe')),
      })
    }
  }
  return out
}
