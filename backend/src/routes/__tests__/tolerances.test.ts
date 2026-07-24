import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'

// Mock Prisma: any Bearer token → a session for 'userA'. The VendorTolerance
// upsert/find/delete are spies we assert against.
const findUnique = vi.fn()
const upsert = vi.fn(async () => ({}))
const deleteMany = vi.fn(async () => ({ count: 1 }))

vi.mock('../../lib/prisma', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(async () => ({ id: 's1', userId: 'userA', expiresAt: new Date(Date.now() + 3_600_000) })),
    },
    vendorTolerance: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      upsert: (...a: unknown[]) => upsert(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
    },
  },
}))

import { tolerancesRouter } from '../tolerances'

async function req(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const app = express()
  app.use(express.json())
  app.use('/tolerances', tolerancesRouter)
  app.use((_e: unknown, _req: express.Request, res: express.Response, _n: express.NextFunction) => {
    if (!res.headersSent) res.status(500).json({ error: 'err' })
  })
  const server = app.listen(0)
  await new Promise<void>(r => server.once('listening', () => r()))
  try {
    const { port } = server.address() as { port: number }
    const res = await fetch(`http://127.0.0.1:${port}/tolerances${path}`, {
      method,
      headers: { authorization: 'Bearer any-token', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, json: res.status === 200 ? await res.json() : null }
  } finally {
    server.close()
  }
}

beforeEach(() => { findUnique.mockReset(); upsert.mockReset(); upsert.mockResolvedValue({}); deleteMany.mockReset(); deleteMany.mockResolvedValue({ count: 1 }) })

describe('PUT /tolerances/:userId', () => {
  it('stores a bar just above the accepted charge on "Expected"', async () => {
    findUnique.mockResolvedValue(null) // no prior setting
    const { status, json } = await req('PUT', '/userA', { vendor: 'Amazon', expected: true, ratio: 6 })
    expect(status).toBe(200)
    expect(json.multiplier).toBe(7.5) // 6 * 1.25
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_vendor: { userId: 'userA', vendor: 'Amazon' } },
      create: { userId: 'userA', vendor: 'Amazon', multiplier: 7.5 },
      update: { multiplier: 7.5 },
    }))
  })

  it('tightens to WATCH on "Not expected"', async () => {
    findUnique.mockResolvedValue({ multiplier: 9 })
    const { json } = await req('PUT', '/userA', { vendor: 'Amazon', expected: false, ratio: 6 })
    expect(json.multiplier).toBe(2)
  })

  it('rejects an empty vendor', async () => {
    const { status } = await req('PUT', '/userA', { vendor: '   ', expected: true, ratio: 6 })
    expect(status).toBe(400)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('403s when the path userId is not the session user', async () => {
    const { status } = await req('PUT', '/userB', { vendor: 'Amazon', expected: true, ratio: 6 })
    expect(status).toBe(403)
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('DELETE /tolerances/:userId/:vendor', () => {
  it('clears a vendor back to the default', async () => {
    const { status, json } = await req('DELETE', '/userA/Amazon')
    expect(status).toBe(200)
    expect(json.multiplier).toBe(3)
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'userA', vendor: 'Amazon' } })
  })

  it('403s for another user', async () => {
    const { status } = await req('DELETE', '/userB/Amazon')
    expect(status).toBe(403)
    expect(deleteMany).not.toHaveBeenCalled()
  })
})
