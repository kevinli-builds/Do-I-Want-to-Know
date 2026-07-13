import { describe, it, expect, vi } from 'vitest'
import express from 'express'

// Mock the Prisma singleton — any Bearer token resolves to a session for
// 'userA'. deleteMany honors the ownership scope: only userA's row 't1' exists.
vi.mock('../../lib/prisma', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(async () => ({ id: 's1', userId: 'userA', expiresAt: new Date(Date.now() + 3_600_000) })),
    },
    ledgerEntry: {
      deleteMany: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => ({
        count: where.id === 't1' && where.userId === 'userA' ? 1 : 0,
      })),
    },
  },
}))

import { prisma } from '../../lib/prisma'
import { transactionsRouter } from '../transactions'

async function del(path: string): Promise<{ status: number }> {
  const app = express()
  app.use(express.json())
  app.use('/transactions', transactionsRouter)
  app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (!res.headersSent) res.status(500).json({ error: 'err' })
  })
  const server = app.listen(0)
  await new Promise<void>(r => server.once('listening', () => r()))
  try {
    const { port } = server.address() as { port: number }
    const res = await fetch(`http://127.0.0.1:${port}/transactions${path}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer any-token' },
    })
    return { status: res.status }
  } finally {
    server.close()
  }
}

describe('DELETE /transactions/:userId/:id', () => {
  it('deletes the caller\'s own record', async () => {
    const { status } = await del('/userA/t1')
    expect(status).toBe(200)
    expect(prisma.ledgerEntry.deleteMany).toHaveBeenCalledWith({
      where: { id: 't1', userId: 'userA' },
    })
  })

  it('404s on a record that does not exist (or belongs to someone else)', async () => {
    const { status } = await del('/userA/t-other')
    expect(status).toBe(404)
  })

  it('403s when the path userId is not the session user', async () => {
    const { status } = await del('/userB/t1')
    expect(status).toBe(403)
  })
})
