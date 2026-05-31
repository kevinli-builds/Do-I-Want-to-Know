import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'

const router = Router()

// GET /acceptances/:userId → { vendors: string[] }
// The set of vendors/senders this user has marked "Accepted".
router.get('/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params
  const rows = await prisma.acceptance.findMany({
    where: { userId },
    select: { vendor: true },
  })
  res.json({ vendors: rows.map(r => r.vendor) })
}))

// POST /acceptances/:userId  { vendor, accepted }
// Toggle a vendor's accepted state; returns the updated vendor list.
router.post('/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params
  const vendor = String(req.body?.vendor ?? '').trim()
  const accepted = req.body?.accepted === true
  if (!vendor) return void res.status(400).json({ error: 'vendor required' })

  if (accepted) {
    await prisma.acceptance.upsert({
      where: { userId_vendor: { userId, vendor } },
      create: { userId, vendor },
      update: {},
    })
  } else {
    await prisma.acceptance.deleteMany({ where: { userId, vendor } })
  }

  const rows = await prisma.acceptance.findMany({ where: { userId }, select: { vendor: true } })
  res.json({ vendors: rows.map(r => r.vendor) })
}))

export { router as acceptancesRouter }
