import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { fetchEmailsForUser } from '../lib/gmail'
import { extractEntries } from '../lib/extractor'

const router = Router()

// POST /emails/sync  { userId }
// Fetches new emails, runs Claude extraction, stores LedgerEntries
router.post('/sync', async (req, res) => {
  const { userId } = req.body
  if (!userId) return void res.status(400).json({ error: 'userId required' })

  const token = await prisma.oAuthToken.findUnique({ where: { userId } })
  if (!token) return void res.status(403).json({ error: 'Gmail not connected — please connect first' })

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

  const total = await prisma.ledgerEntry.count({ where: { userId } })
  res.json({ synced: rows.length, total })
})

export { router as emailsRouter }
