import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

// POST /users  { id }
// Creates or finds the user for this device UUID, returns connection status
router.post('/', async (req, res) => {
  const { id } = req.body
  if (!id) return void res.status(400).json({ error: 'id required' })

  const user = await prisma.user.upsert({
    where: { id },
    create: { id },
    update: {},
    include: { oauthToken: { select: { id: true } } },
  })

  res.json({
    id: user.id,
    email: user.email,
    connected: !!user.oauthToken,
    createdAt: user.createdAt,
  })
})

export { router as usersRouter }
