import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import type { Router } from 'express'

// Mock the Prisma singleton so no real DB is needed. Any Bearer token resolves to
// a valid, unexpired session for 'userA'. The handlers that the positive-control
// test reaches (wrapped) get just enough data to return cleanly.
vi.mock('../../lib/prisma', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(async () => ({ id: 's1', userId: 'userA', expiresAt: new Date(Date.now() + 3_600_000) })),
      delete: vi.fn(async () => {}),
    },
    user: {
      findUnique: vi.fn(async () => ({ id: 'userA', email: 'a@example.com', oauthToken: null })),
    },
    ledgerEntry: { findMany: vi.fn(async () => []) },
    budget: { findMany: vi.fn(async () => []) },
    acceptance: { findMany: vi.fn(async () => []) },
    vendorTolerance: { findMany: vi.fn(async () => []) },
  },
}))

import { enforceOwnership } from '../../lib/session'
import { wrappedRouter } from '../wrapped'
import { monitorRouter } from '../monitor'
import { transactionsRouter } from '../transactions'
import { budgetsRouter } from '../budgets'
import { upcomingRouter } from '../upcoming'
import { promotionsRouter } from '../promotions'
import { acceptancesRouter } from '../acceptances'
import { exportRouter } from '../export'
import { tolerancesRouter } from '../tolerances'

// Spin up a throwaway server mounting one router, make one request, return status.
async function hit(router: Router, path: string, token = 'any-token'): Promise<number> {
  const app = express()
  app.use(express.json())
  app.use('/r', router)
  // Error handler so a thrown handler yields 500 (never a hung request).
  app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (!res.headersSent) res.status(500).json({ error: 'err' })
  })
  const server = app.listen(0)
  await new Promise<void>(r => server.once('listening', () => r()))
  try {
    const { port } = server.address() as { port: number }
    const res = await fetch(`http://127.0.0.1:${port}/r${path}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    return res.status
  } finally {
    server.close()
  }
}

const ALL_ROUTERS: [string, Router][] = [
  ['wrapped', wrappedRouter],
  ['monitor', monitorRouter],
  ['transactions', transactionsRouter],
  ['budgets', budgetsRouter],
  ['upcoming', upcomingRouter],
  ['promotions', promotionsRouter],
  ['acceptances', acceptancesRouter],
  ['export', exportRouter],
  ['tolerances', tolerancesRouter],
]

describe('enforceOwnership (param guard unit)', () => {
  const makeRes = () => {
    const res: { statusCode: number; body: unknown; status: (c: number) => typeof res; json: (b: unknown) => typeof res } = {
      statusCode: 0,
      body: null,
      status(c) { this.statusCode = c; return this },
      json(b) { this.body = b; return this },
    }
    return res
  }

  it('calls next() when the path id matches the authenticated user', () => {
    const res = makeRes()
    let nexted = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enforceOwnership({ authUserId: 'userA' } as any, res as any, () => { nexted = true }, 'userA', 'userId')
    expect(nexted).toBe(true)
    expect(res.statusCode).toBe(0)
  })

  it('403s when the path id does not match the authenticated user', () => {
    const res = makeRes()
    let nexted = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enforceOwnership({ authUserId: 'userA' } as any, res as any, () => { nexted = true }, 'userB', 'userId')
    expect(nexted).toBe(false)
    expect(res.statusCode).toBe(403)
  })
})

describe('IDOR regression: cross-user :userId is rejected on every data router', () => {
  // The bug (C1): requireSession's ownership check never fired on router.use-mounted
  // routes because req.params is empty in `use` middleware. A valid session for
  // userA could read/write userB's data. These assert the fix holds.
  it.each(ALL_ROUTERS)('%s: GET /:userId=userB with userA session → 403', async (_name, router) => {
    expect(await hit(router, '/userB')).toBe(403)
  })

  it('positive control: wrapped GET /:userId=userA with userA session is NOT 403', async () => {
    const status = await hit(wrappedRouter, '/userA')
    expect(status).not.toBe(403)
    expect(status).toBe(200)
  })
})
