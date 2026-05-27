import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

router.post('/', async (req, res) => {
  const { id } = req.body
  if (!id) return void res.status(400).json({ error: 'id required' })

  const user = await prisma.user.upsert({
    where: { id },
    create: { id },
    update: {},
  })
  res.json(user)
})

router.get('/:id/stats', async (req, res) => {
  const { id } = req.params

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return void res.status(404).json({ error: 'Not found' })

  const [answeredCount, askedCount, myQuestions] = await Promise.all([
    prisma.answer.count({ where: { userId: id } }),
    prisma.question.count({ where: { authorId: id } }),
    prisma.question.findMany({
      where: { authorId: id },
      include: { _count: { select: { answers: true } } },
    }),
  ])

  const totalResponsesReceived = myQuestions.reduce((sum, q) => sum + q._count.answers, 0)

  res.json({
    answeredCount,
    askedCount,
    totalResponsesReceived,
    memberSince: user.createdAt,
  })
})

export { router as usersRouter }
