import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { logError } from './lib/log'
import { privacyPage } from './lib/pages'
import { usersRouter } from './routes/users'
import { authRouter } from './routes/auth'
import { emailsRouter } from './routes/emails'
import { wrappedRouter } from './routes/wrapped'
import { exportRouter } from './routes/export'
import { accessRouter } from './routes/access'
import { monitorRouter } from './routes/monitor'
import { transactionsRouter } from './routes/transactions'
import { acceptancesRouter } from './routes/acceptances'
import { upcomingRouter } from './routes/upcoming'
import { promotionsRouter } from './routes/promotions'
import { budgetsRouter } from './routes/budgets'

// Safety net: never let a stray async error terminate the whole server (Node
// crashes the process on unhandled rejections by default, which on Render means
// a restart that takes every in-flight request down). Log and stay up instead.
process.on('unhandledRejection', reason => {
  logError('[unhandledRejection]', reason)
})
process.on('uncaughtException', err => {
  logError('[uncaughtException]', err)
})

const app = express()

// We run behind Render's proxy. Trust the first proxy hop so `req.ip` reflects
// the real client (X-Forwarded-For) — otherwise every request looks like it
// comes from the proxy and the per-IP rate limiters bucket all users together.
app.set('trust proxy', 1)

// Security headers (clickjacking, MIME sniffing, referrer leakage, HSTS, etc.).
// The self-served HTML pages (/privacy, OAuth result screens) use inline <style>,
// so the CSP allows inline styles; everything else is locked to 'self'. This is
// an API consumed cross-origin by the Vercel frontend, so resources are marked
// cross-origin (CORS still governs who can actually read responses).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))

// CORS: only allow the known web frontend (and localhost for dev) to call the
// API from a browser, and only the headers we actually use. A wide-open `*`
// let any site script the API on a visitor's behalf.
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:8081',
].filter(Boolean) as string[]

app.use(cors({
  origin(origin, cb) {
    // Allow non-browser clients / same-origin requests (no Origin header) and
    // any explicitly allow-listed frontend origin.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    cb(null, false)
  },
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
// Cap request bodies — this API only ever receives small JSON payloads, so a
// tight limit blunts memory-exhaustion attempts.
app.use(express.json({ limit: '64kb' }))

app.use('/users', usersRouter)
app.use('/auth', authRouter)
app.use('/emails', emailsRouter)
app.use('/wrapped', wrappedRouter)
app.use('/export', exportRouter)
app.use('/access', accessRouter)
app.use('/monitor', monitorRouter)
app.use('/transactions', transactionsRouter)
app.use('/acceptances', acceptancesRouter)
app.use('/upcoming', upcomingRouter)
app.use('/promotions', promotionsRouter)
app.use('/budgets', budgetsRouter)

app.get('/health', (_req, res) => res.json({ ok: true }))

app.get('/privacy', (_req, res) => {
  res.setHeader('Content-Type', 'text/html')
  res.send(privacyPage())
})

// Central error handler — guarantees every failed request gets a response
// (an unhandled rejection in a route would otherwise leave the client hanging).
// Must be registered last and take 4 args for Express to treat it as an error handler.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logError('[error]', err)
  if (res.headersSent) return // response already streaming (e.g. export) — can't change it
  res.status(500).json({ error: 'Something went wrong — please try again.' })
})

const PORT = process.env.PORT ?? 3000
app.listen(PORT, () => console.log(`DIWTKN backend running on http://localhost:${PORT}`))
