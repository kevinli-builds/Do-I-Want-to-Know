import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

// Questions this user hasn't answered yet (excludes their own)
router.get('/feed', async (req, res) => {
  const { userId } = req.query as { userId: string }
  if (!userId) return res.status(400).json({ error: 'userId required' })

  const answered = await prisma.answer.findMany({
    where: { userId },
    select: { questionId: true },
  })
  const answeredIds = answered.map(a => a.questionId)

  const questions = await prisma.question.findMany({
    where: {
      status: 'active',
      authorId: { not: userId },
      ...(answeredIds.length > 0 && { id: { notIn: answeredIds } }),
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  res.json(questions)
})

// Questions created by this user, with live results
router.get('/mine', async (req, res) => {
  const { userId } = req.query as { userId: string }
  if (!userId) return res.status(400).json({ error: 'userId required' })

  const questions = await prisma.question.findMany({
    where: { authorId: userId },
    include: { answers: true },
    orderBy: { createdAt: 'desc' },
  })

  const result = questions.map(q => ({
    ...q,
    answers: undefined,
    answerCount: q.answers.length,
    results: tally(q.type, q.options, q.answers.map(a => a.value)),
  }))

  res.json(result)
})

// Post a new question
router.post('/', async (req, res) => {
  const { authorId, text, type, options } = req.body
  if (!authorId || !text || !type)
    return res.status(400).json({ error: 'authorId, text, type required' })

  const question = await prisma.question.create({
    data: {
      text,
      type,
      options: options ? JSON.stringify(options) : null,
      authorId,
    },
  })
  res.json(question)
})

// Submit an answer; returns aggregate results immediately
router.post('/:id/answer', async (req, res) => {
  const { userId, value } = req.body
  const { id } = req.params
  if (!userId || value === undefined)
    return res.status(400).json({ error: 'userId, value required' })

  try {
    await prisma.answer.create({ data: { questionId: id, userId, value } })
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Already answered' })
    throw e
  }

  const question = await prisma.question.findUnique({
    where: { id },
    include: { answers: true },
  })
  if (!question) return res.status(404).json({ error: 'Not found' })

  const results = tally(question.type, question.options, question.answers.map(a => a.value))
  res.json({ results, total: question.answers.length })
})

// Get results for a question
router.get('/:id/results', async (req, res) => {
  const question = await prisma.question.findUnique({
    where: { id: req.params.id },
    include: { answers: true },
  })
  if (!question) return res.status(404).json({ error: 'Not found' })

  const results = tally(question.type, question.options, question.answers.map(a => a.value))
  res.json({ results, total: question.answers.length })
})

function tally(
  type: string,
  optionsJson: string | null,
  values: string[]
): Record<string, number> {
  if (type === 'yesno') {
    return {
      yes: values.filter(v => v === 'yes').length,
      no: values.filter(v => v === 'no').length,
    }
  }
  const options: string[] = optionsJson ? JSON.parse(optionsJson) : []
  const counts: Record<string, number> = {}
  options.forEach((_, i) => { counts[String(i)] = 0 })
  values.forEach(v => { counts[v] = (counts[v] || 0) + 1 })
  return counts
}

export { router as questionsRouter }
