import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

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
router.post('/request', async (req, res) => {
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
})

// GET /access/requests?key=<ADMIN_KEY>
// Owner-only list of pending requests (fallback if no webhook is configured).
router.get('/requests', async (req, res) => {
  const key = process.env.ADMIN_KEY
  if (!key || req.query.key !== key) return void res.status(403).json({ error: 'Forbidden' })
  const requests = await prisma.accessRequest.findMany({ orderBy: { createdAt: 'desc' } })
  res.json({ requests })
})

export { router as accessRouter }
