import type { Response } from 'express'
import { prisma } from './prisma'

// Counts that describe a user's ledger state. Used by /users (status) and
// /emails/sync (post-sync response) — previously duplicated in both.
export interface LedgerSummary {
  entryCount: number       // stored LedgerEntry rows (records)
  examinedCount: number    // ProcessedEmail rows (emails evaluated by Claude)
  oldestDate: Date | null  // earliest ledger entry date, or null if none
}

export async function getLedgerSummary(userId: string): Promise<LedgerSummary> {
  const [entryCount, examinedCount, oldest] = await Promise.all([
    prisma.ledgerEntry.count({ where: { userId } }),
    prisma.processedEmail.count({ where: { userId } }),
    prisma.ledgerEntry.findFirst({
      where: { userId },
      orderBy: { date: 'asc' },
      select: { date: true },
    }),
  ])
  return { entryCount, examinedCount, oldestDate: oldest?.date ?? null }
}

// Fetch a user (with a lightweight oauthToken presence flag) or send a 404 and
// return null. Lets a route bail with `if (!user) return` and drops the repeated
// findUnique + 404 boilerplate. requireSession has already proven the caller owns
// this :userId, so this only guards the "row doesn't exist" case.
export async function findUserOr404(res: Response, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { oauthToken: { select: { id: true } } },
  })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return null
  }
  return user
}
