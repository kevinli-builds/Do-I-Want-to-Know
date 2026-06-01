import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { listNewEmailIds, fetchMetadataForIds, gmailErrorKind } from '../lib/gmail'
import { extractEntries } from '../lib/extractor'
import { asyncHandler } from '../lib/asyncHandler'

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

// Return the first parseable date among candidates, else now — prevents an
// "Invalid Date" from Claude's output blowing up the createMany insert.
function safeDate(...candidates: (string | undefined)[]): Date {
  for (const c of candidates) {
    if (!c) continue
    const d = new Date(c)
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

// POST /emails/sync  { userId }
// Fetches new emails, runs Claude extraction, stores LedgerEntries
router.post('/sync', asyncHandler(async (req, res) => {
  const { userId } = req.body
  if (!userId) return void res.status(400).json({ error: 'userId required' })

  // Optional per-sync customization (clamped in listEmailIds)
  const lookbackDays = Number(req.body?.lookbackDays) || undefined
  const maxEmails = Number(req.body?.maxEmails) || undefined

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

  // Everything below can hit Gmail, Claude, or the DB. Wrap it so a failure
  // returns a clean error instead of throwing out of the async handler — an
  // unhandled rejection would terminate the Node process and restart the
  // whole server (taking every other request down with it).
  try {
    // 1. Pull the next batch of UNprocessed candidate IDs (skips already-stored
    //    ones and pages newest → older), so successive syncs walk further back.
    const existing = await prisma.ledgerEntry.findMany({
      where: { userId },
      select: { emailId: true },
    })
    const seen = new Set(existing.map(e => e.emailId))
    const wantMax = Math.min(Math.round(maxEmails ?? 2000) || 2000, 10000)
    const newIds = await listNewEmailIds(userId, seen, { lookbackDays, maxEmails })

    if (newIds.length === 0) {
      await prisma.user.update({ where: { id: userId }, data: { lastSyncedAt: new Date() } })
      const total = await prisma.ledgerEntry.count({ where: { userId } })
      const oldest = await prisma.ledgerEntry.findFirst({ where: { userId }, orderBy: { date: 'asc' }, select: { date: true } })
      return void res.json({ synced: 0, total, oldestDate: oldest?.date ?? null, caughtUp: true, message: "You're all caught up" })
    }

    // 2. Fetch metadata only for the new IDs, then extract with Claude.
    const newEmails = await fetchMetadataForIds(userId, newIds)
    const extracted = await extractEntries(newEmails)

    // Look up raw email metadata (sender / unsubscribe) by id when persisting
    const rawById = new Map(newEmails.map(e => [e.id, e]))

    // Persist only non-null results
    const rows = Array.from(extracted.entries())
      .filter((pair): pair is [string, NonNullable<(typeof extracted extends Map<string, infer V> ? V : never)>] =>
        pair[1] !== null
      )
      .map(([emailId, entry]) => {
        // Coerce Claude's output defensively — a string amount, NaN, or a
        // non-string field would otherwise fail the Prisma insert and sink the
        // whole sync (the cause of the PrismaClientValidationError in the logs).
        const amt = typeof entry.amount === 'number' ? entry.amount : Number(entry.amount)
        const term = Number(entry.termMonths)
        return {
          userId,
          emailId,
          category: String(entry.category ?? 'other'),
          vendor: String(entry.vendor ?? 'Unknown'),
          amount: Number.isFinite(amt) && amt >= 0 ? amt : null,
          currency: String(entry.currency ?? 'USD').slice(0, 8),
          date: safeDate(entry.date, rawById.get(emailId)?.date),
          description: String(entry.description ?? ''),
          senderEmail: rawById.get(emailId)?.senderEmail ?? null,
          unsubscribe: rawById.get(emailId)?.unsubscribe ?? null,
          termMonths: Number.isFinite(term) && term > 1 ? Math.round(term) : null,
        }
      })

    // createMany throws on an empty array, so only insert when there's data
    if (rows.length > 0) {
      await prisma.ledgerEntry.createMany({ data: rows, skipDuplicates: true })
    }

    // "Caught up" when we stored nothing new (incl. all batches skipped) OR
    // pulled less than a full batch (reached the tail of available mail). Only
    // then do we start the cooldown — so a productive backfill can continue
    // back-to-back, while a finished/empty sync is rate-limited normally.
    const caughtUp = rows.length === 0 || newIds.length < wantMax
    if (caughtUp) {
      await prisma.user.update({ where: { id: userId }, data: { lastSyncedAt: new Date() } })
    }

    const total = await prisma.ledgerEntry.count({ where: { userId } })
    const oldest = await prisma.ledgerEntry.findFirst({ where: { userId }, orderBy: { date: 'asc' }, select: { date: true } })
    return void res.json({ synced: rows.length, total, oldestDate: oldest?.date ?? null, caughtUp })
  } catch (err) {
    const kind = gmailErrorKind(err)
    if (kind === 'expired') {
      return void res.status(401).json({
        error: 'Your Gmail session expired — tap Connect Gmail to refresh.',
        reauth: true,
      })
    }
    if (kind === 'scope') {
      return void res.status(403).json({
        error: 'Gmail read access wasn’t granted. Tap Connect Gmail and keep the “Read your email” box checked.',
        reauth: true,
      })
    }
    console.error('[emails/sync] failed:', err)
    return void res.status(500).json({ error: 'Sync failed — please try again in a bit.' })
  }
}))

export { router as emailsRouter }
