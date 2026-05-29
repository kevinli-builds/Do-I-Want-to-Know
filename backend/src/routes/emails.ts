import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { fetchEmailsForUser } from '../lib/gmail'
import { extractEntries } from '../lib/extractor'

const router = Router()

// Each sync hits Gmail + the Claude API, so cap how often a single user can run one.
// Configurable via env; defaults to once every 24 hours.
const RATE_LIMIT_HOURS = Number(process.env.SYNC_RATE_LIMIT_HOURS ?? 24)

function formatWait(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  if (rem === 0) return `${hours} hour${hours === 1 ? '' : 's'}`
  return `${hours}h ${rem}m`
}

// POST /emails/sync  { userId }
// Fetches new emails, runs Claude extraction, stores LedgerEntries
router.post('/sync', async (req, res) => {
  const { userId } = req.body
  if (!userId) return void res.status(400).json({ error: 'userId required' })

  const token = await prisma.oAuthToken.findUnique({ where: { userId } })
  if (!token) return void res.status(403).json({ error: 'Gmail not connected — please connect first' })

  // Rate limit: reject if the user synced too recently
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (user?.lastSyncedAt && RATE_LIMIT_HOURS > 0) {
    const limitMs = RATE_LIMIT_HOURS * 3600 * 1000
    const elapsed = Date.now() - user.lastSyncedAt.getTime()
    if (elapsed < limitMs) {
      const retryAfterMinutes = Math.ceil((limitMs - elapsed) / 60000)
      return void res.status(429).json({
        error: `You can sync once every ${RATE_LIMIT_HOURS} hours. Try again in ${formatWait(retryAfterMinutes)}.`,
        retryAfterMinutes,
      })
    }
  }

  // Fetch all relevant emails from Gmail
  const allEmails = await fetchEmailsForUser(userId)

  // Skip emails we have already processed
  const existing = await prisma.ledgerEntry.findMany({
    where: { userId },
    select: { emailId: true },
  })
  const seen = new Set(existing.map(e => e.emailId))
  const newEmails = allEmails.filter(e => !seen.has(e.id))

  if (newEmails.length === 0) {
    await prisma.user.update({ where: { id: userId }, data: { lastSyncedAt: new Date() } })
    const total = await prisma.ledgerEntry.count({ where: { userId } })
    return void res.json({ synced: 0, total, message: 'Already up to date' })
  }

  // Claude extracts structured data in batches
  const extracted = await extractEntries(newEmails)

  // Persist only non-null results
  const rows = Array.from(extracted.entries())
    .filter((pair): pair is [string, NonNullable<(typeof extracted extends Map<string, infer V> ? V : never)>] =>
      pair[1] !== null
    )
    .map(([emailId, entry]) => ({
      userId,
      emailId,
      category: entry.category,
      vendor: entry.vendor,
      amount: entry.amount ?? null,
      currency: entry.currency ?? 'USD',
      date: new Date(entry.date),
      description: entry.description,
    }))

  await prisma.ledgerEntry.createMany({ data: rows, skipDuplicates: true })
  await prisma.user.update({ where: { id: userId }, data: { lastSyncedAt: new Date() } })

  const total = await prisma.ledgerEntry.count({ where: { userId } })
  res.json({ synced: rows.length, total })
})

export { router as emailsRouter }
