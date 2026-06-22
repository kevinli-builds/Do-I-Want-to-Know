import { Router } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { makeRateLimiter } from '../lib/rateLimit'
import { EMAIL_RE } from '../lib/validators'

const router = Router()

// Constant-time string compare so the admin key can't be recovered byte-by-byte
// via response-timing. Returns false on any length/encoding mismatch.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

// This endpoint is unauthenticated by design (people requesting access don't
// have a session yet), and each new email writes a DB row + pings the owner's
// webhook — so cap attempts per IP to stop spam/flooding.
const requestRateLimited = makeRateLimiter(5, 60 * 1000)

// Best-effort push notification to the owner. ACCESS_WEBHOOK_URL can be a
// Discord OR Slack incoming webhook — we send both `content` (Discord) and
// `text` (Slack); each platform ignores the field it doesn't use.
async function notifyOwner(email: string, note?: string | null): Promise<void> {
  const url = process.env.ACCESS_WEBHOOK_URL
  if (!url) return
  const lines = [
    '🔔 New access request for *Do I Want To Know*',
    `Email: ${email}`,
    note ? `Note: ${note}` : null,
    'Add them: https://console.cloud.google.com/auth/audience?project=do-i-want-to-know',
  ].filter(Boolean)
  const message = lines.join('\n')
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message, text: message }),
    })
  } catch {
    /* notification is best-effort — never fail the request over it */
  }
}

// POST /access/request  { email, note? }
// Records a request to be added as a test user and pings the owner.
router.post('/request', asyncHandler(async (req, res) => {
  if (requestRateLimited(req.ip ?? 'unknown')) {
    return void res.status(429).json({ error: 'Too many requests — please wait a minute and try again.' })
  }
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const note = req.body?.note ? String(req.body.note).slice(0, 200) : null
  if (!EMAIL_RE.test(email)) {
    return void res.status(400).json({ error: 'Please enter a valid email address' })
  }

  // Idempotent: only store + notify the first time we see an email
  const existing = await prisma.accessRequest.findUnique({ where: { email } })
  if (!existing) {
    await prisma.accessRequest.create({ data: { email, note } })
    await notifyOwner(email, note)
  }

  res.json({ ok: true })
}))

// GET /access/requests   (header: X-Admin-Key: <ADMIN_KEY>)
// Owner-only list of pending requests (fallback if no webhook is configured).
// The key goes in a header, not the query string, so it doesn't end up in
// access logs, browser history, or referrers.
router.get('/requests', asyncHandler(async (req, res) => {
  const key = process.env.ADMIN_KEY
  const provided = req.header('x-admin-key') ?? ''
  if (!key || !safeEqual(provided, key)) return void res.status(403).json({ error: 'Forbidden' })
  const requests = await prisma.accessRequest.findMany({ orderBy: { createdAt: 'desc' } })
  res.json({ requests })
}))

export { router as accessRouter }
