import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { requireSession, enforceOwnership } from '../lib/session'
import { nextMultiplier, DEFAULT_MULTIPLIER } from '../lib/tolerance'

const router = Router()
router.use(requireSession)
router.param('userId', enforceOwnership) // 403 unless :userId matches the token's user

// Vendor names come from email metadata, so bound what we'll store.
const MAX_VENDOR_LEN = 120

// GET /tolerances/:userId → { tolerances: { [vendor]: multiplier } }
router.get('/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params
  const rows = await prisma.vendorTolerance.findMany({ where: { userId } })
  const tolerances: Record<string, number> = {}
  for (const r of rows) tolerances[r.vendor] = r.multiplier
  res.json({ tolerances })
}))

// PUT /tolerances/:userId  { vendor, expected, ratio? }
// Record the user's judgement of an unusual-charge alert (§9 A8). `expected`
// raises this vendor's bar above the charge they just accepted; `false`
// tightens it so smaller spikes from them also surface.
router.put('/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params
  const vendor = String(req.body?.vendor ?? '').trim().slice(0, MAX_VENDOR_LEN)
  const expected = req.body?.expected === true
  const rawRatio = Number(req.body?.ratio)
  const ratio = Number.isFinite(rawRatio) && rawRatio > 0 ? rawRatio : NaN

  if (!vendor) return void res.status(400).json({ error: 'Invalid vendor' })

  const existing = await prisma.vendorTolerance.findUnique({
    where: { userId_vendor: { userId, vendor } },
  })
  const multiplier = nextMultiplier(existing?.multiplier ?? null, ratio, expected)

  await prisma.vendorTolerance.upsert({
    where: { userId_vendor: { userId, vendor } },
    create: { userId, vendor, multiplier },
    update: { multiplier },
  })
  res.json({ ok: true, vendor, multiplier })
}))

// DELETE /tolerances/:userId/:vendor — back to the default sensitivity.
router.delete('/:userId/:vendor', asyncHandler(async (req, res) => {
  const { userId } = req.params
  const vendor = String(req.params.vendor ?? '').slice(0, MAX_VENDOR_LEN)
  await prisma.vendorTolerance.deleteMany({ where: { userId, vendor } })
  res.json({ ok: true, vendor, multiplier: DEFAULT_MULTIPLIER })
}))

export { router as tolerancesRouter }
