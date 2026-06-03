import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { logError } from './lib/log'
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
app.use(express.json())

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

app.get('/health', (_req, res) => res.json({ ok: true }))

app.get('/privacy', (_req, res) => {
  res.setHeader('Content-Type', 'text/html')
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy — Do I Want To Know</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; background: #fafafa; padding: 0 16px 60px; }
    .wrap { max-width: 680px; margin: 0 auto; }
    h1 { font-size: 28px; font-weight: 800; margin: 48px 0 4px; }
    .meta { color: #888; font-size: 14px; margin-bottom: 40px; }
    h2 { font-size: 17px; font-weight: 700; margin: 36px 0 10px; }
    p, li { font-size: 15px; line-height: 1.7; color: #444; }
    ul { padding-left: 20px; margin-top: 8px; }
    li { margin-bottom: 4px; }
    hr { border: none; border-top: 1px solid #e8e8e8; margin: 32px 0; }
    a { color: #6C63FF; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Privacy Policy</h1>
    <p class="meta">Do I Want To Know &nbsp;·&nbsp; Last updated: May 2026</p>

    <h2>What this app does</h2>
    <p>Do I Want To Know connects to your Gmail account (with your permission) to read purchase and subscription email metadata, then generates a personal "Wrapped" summary of your spending and subscriptions — like Spotify Wrapped, but for your inbox.</p>

    <hr />

    <h2>What we collect</h2>
    <ul>
      <li><strong>A random device ID</strong> — a UUID generated on your device, containing no personal information.</li>
      <li><strong>Your Gmail address</strong> — used to identify your account after you connect.</li>
      <li><strong>Email metadata only</strong> — sender, subject line, date, and a short snippet from order/subscription emails. We never read the full body of any email.</li>
      <li><strong>Extracted purchase data</strong> — vendor name, category, amount, and date parsed from the metadata above.</li>
    </ul>

    <hr />

    <h2>What we do NOT collect</h2>
    <ul>
      <li>The full text or attachments of any email</li>
      <li>Personal or non-commercial emails (we only query order/subscription subjects)</li>
      <li>Your contacts, calendar, location, or any other data</li>
    </ul>

    <hr />

    <h2>How we use your data</h2>
    <p>All data is used exclusively to generate your personal Wrapped stats. We do not sell, share, or monetize your data in any form.</p>

    <hr />

    <h2>Data deletion</h2>
    <p>Email <a href="mailto:privacy@diwtkn.com">privacy@diwtkn.com</a> to request deletion. We will remove all your data within 30 days.</p>

    <hr />

    <h2>Contact</h2>
    <p><a href="mailto:privacy@diwtkn.com">privacy@diwtkn.com</a></p>
  </div>
</body>
</html>`)
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
