import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { google } from 'googleapis'
import { getOAuthClient } from '../lib/gmail'
import { prisma } from '../lib/prisma'
import { logError } from '../lib/log'
import { newToken, createSession, requireSession, revokeUserSessions } from '../lib/session'
import { encryptSecret, decryptSecret } from '../lib/crypto'
import { makeRateLimiter } from '../lib/rateLimit'

const router = Router()

// One-time handoff codes expire quickly — they only need to survive the redirect
// back to the frontend and the immediate exchange call.
const LOGIN_CODE_TTL_MS = 10 * 60 * 1000

// Per-IP rate limit for the unauthenticated /auth/exchange endpoint (defense in
// depth — the codes are already unguessable).
const exchangeRateLimited = makeRateLimiter(20, 60 * 1000)

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
]

// OAuth `state` carries the device UUID + where to send the browser afterwards.
// Encoded as base64url JSON so it survives the round-trip through Google.
function encodeState(data: { userId: string; redirect?: string }): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url')
}

function decodeState(state: string): { userId: string; redirect?: string } {
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'))
    if (parsed && typeof parsed.userId === 'string') return parsed
  } catch {
    /* fall through */
  }
  // Backward compat: the old mobile app sent the raw userId as state
  return { userId: state }
}

// Only allow redirecting back to known frontends — prevents open-redirect abuse.
// We permit the configured web origin, localhost (dev), and the Expo app's own
// deep-link schemes (diwtkn:// in a standalone build, exp:// under Expo Go).
// The redirect only ever carries a single-use, short-lived handoff code, never a
// durable secret.
function safeRedirect(redirect?: string): string | null {
  if (!redirect) return null
  if (process.env.FRONTEND_URL && redirect === process.env.FRONTEND_URL) return redirect
  if (/^http:\/\/localhost(:\d+)?$/.test(redirect)) return redirect
  if (/^diwtkn:\/\//.test(redirect)) return redirect
  if (/^exp:\/\/[\w.\-:/]*$/.test(redirect)) return redirect
  return null
}

// Resolve the canonical user for a verified Gmail address. Identity is keyed by
// the Gmail address (not the per-device UUID) so the same person sees the same
// data on every device/browser without re-syncing.
//
//   - If a user already owns this email  → use it (cross-device convergence).
//   - Else if the requesting device id is free (new, or already this email)
//                                         → claim it for this email.
//   - Else (device id belongs to another email) → mint a fresh canonical id.
async function resolveCanonicalUser(requestedId: string, email: string | null): Promise<string> {
  if (email) {
    const owner = await prisma.user.findUnique({ where: { email } })
    if (owner) return owner.id
  }

  const requested = await prisma.user.findUnique({ where: { id: requestedId } })
  if (!requested || requested.email == null || requested.email === email) {
    await prisma.user.upsert({
      where:  { id: requestedId },
      create: { id: requestedId, email: email ?? undefined },
      update: { email: email ?? undefined },
    })
    return requestedId
  }

  // Requested device id is already tied to a different email — don't clobber it.
  const freshId = randomUUID()
  await prisma.user.create({ data: { id: freshId, email: email ?? undefined } })
  return freshId
}

// Step 1 — redirect the user to Google's consent screen.
// Web app opens: GET /auth/google?userId=<uuid>&redirect=<frontend origin>
router.get('/google', (req, res) => {
  const userId = req.query.userId as string
  if (!userId) return void res.status(400).send('userId required')
  const redirect = req.query.redirect as string | undefined

  const oauth2Client = getOAuthClient()
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: encodeState({ userId, redirect }),
    prompt: 'consent', // always show consent so we get a refresh token
  })

  res.redirect(url)
})

// Step 2 — Google redirects here after the user approves
router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query as { code: string; state: string }
  if (!code || !state) return void res.status(400).send('Invalid callback parameters')

  const { userId: requestedId, redirect } = decodeState(state)

  try {
  const oauth2Client = getOAuthClient()
  const { tokens } = await oauth2Client.getToken(code)
  oauth2Client.setCredentials(tokens)

  // Google's granular consent lets users uncheck the Gmail permission. If they
  // did, every Gmail call would later 403 ("Insufficient Permission"), so catch
  // it now with a clear message instead of a confusing failure on first sync.
  if (!String(tokens.scope ?? '').includes('gmail.readonly')) {
    const back = safeRedirect(redirect) ?? safeRedirect(process.env.FRONTEND_URL)
    return void res.status(400).send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gmail access needed</title>
<style>body{font-family:system-ui,sans-serif;background:#f7f7ff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{text-align:center;padding:48px 32px;max-width:440px}.x{font-size:56px}h1{color:#1a1a2e;margin:16px 0 8px;font-size:23px}
p{color:#666;font-size:16px;line-height:1.5}a{display:inline-block;margin-top:18px;background:#6c63ff;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700}</style></head>
<body><div class="card"><div class="x">📭</div><h1>One more permission needed</h1>
<p>To build your inbox insights, the app needs permission to <strong>read your Gmail</strong>. On the Google screen, please keep the <em>"Read your email messages and settings"</em> box checked.</p>
${back ? `<a href="${back}">Try connecting again</a>` : ''}</div></body></html>`)
  }

  // Fetch the user's verified Gmail address
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
  const { data } = await oauth2.userinfo.get()
  const email = data.email ?? null

  // Identity is keyed by Gmail address, so the same person converges to one
  // canonical user across every device.
  const canonicalId = await resolveCanonicalUser(requestedId, email)

  // Upsert OAuth tokens under the canonical user — on re-auth Google may not
  // return a new refresh token, so fall back to the existing one if absent.
  const existing = await prisma.oAuthToken.findUnique({ where: { userId: canonicalId } })
  await prisma.oAuthToken.upsert({
    where: { userId: canonicalId },
    create: {
      userId: canonicalId,
      accessToken: encryptSecret(tokens.access_token!),
      refreshToken: encryptSecret(tokens.refresh_token!),
      expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
    },
    update: {
      accessToken: encryptSecret(tokens.access_token!),
      // Google may omit the refresh token on re-auth — keep the stored one
      // (already encrypted) rather than re-encrypting it.
      refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : existing?.refreshToken ?? '',
      expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
    },
  })

  // Web flow: issue a single-use handoff code and redirect back with THAT — not
  // the durable user id or token. The frontend exchanges it (POST /auth/exchange)
  // for a session token + its canonical id. Keeping secrets out of the URL means
  // nothing reusable leaks via browser history, referrers, or access logs.
  const target = safeRedirect(redirect) ?? safeRedirect(process.env.FRONTEND_URL)
  if (target) {
    const code = newToken()
    await prisma.loginCode.create({
      data: { code, userId: canonicalId, expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MS) },
    })
    // Web origins get the trailing-slash form they expect; app deep links append
    // the query directly to the scheme path.
    const sep = target.startsWith('http') ? '/?' : '?'
    return void res.redirect(`${target}${sep}connected=1&code=${encodeURIComponent(code)}`)
  }

  // Fallback (mobile / no frontend configured): show a "close this tab" page
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Connected!</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f7f7ff;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; }
    .card { text-align: center; padding: 48px 32px; }
    .check { font-size: 64px; line-height: 1; }
    h1 { color: #1a1a2e; margin: 16px 0 8px; font-size: 26px; }
    p { color: #666; font-size: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">✓</div>
    <h1>Gmail Connected!</h1>
    <p>You can close this tab and return to the app.</p>
  </div>
</body>
</html>`)
  } catch (err) {
    // OAuth exchange / userinfo / DB failure — show a friendly page with a way
    // back, rather than a blank screen or raw stack trace.
    logError('[auth/callback] failed:', err)
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    // invalid_grant = the one-time auth code expired or was already used (a
    // refresh / back-button / double-load). Guide a fresh sign-in.
    const expiredCode = /invalid_grant/i.test(String(e?.response?.data?.error ?? e?.message ?? ''))
    const back = safeRedirect(redirect) ?? safeRedirect(process.env.FRONTEND_URL)
    // A relative link back to the OAuth start re-initiates a clean sign-in.
    const retry = `/auth/google?userId=${encodeURIComponent(requestedId)}${back ? `&redirect=${encodeURIComponent(back)}` : ''}`
    const heading = expiredCode ? 'This sign-in link expired' : "Couldn't connect Gmail"
    const body = expiredCode
      ? 'Sign-in links work only once and expire after a few minutes — a page refresh or the back button can use them up. Start a fresh sign-in below.'
      : 'Something went wrong during sign-in. This is usually temporary — please try again.'
    const linkHref = expiredCode ? retry : (back ?? retry)
    const linkText = expiredCode ? 'Connect Gmail again' : 'Back to the app'
    res.status(expiredCode ? 400 : 500).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Connection failed</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f7f7ff;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; }
    .card { text-align: center; padding: 48px 32px; max-width: 420px; }
    .x { font-size: 56px; line-height: 1; }
    h1 { color: #1a1a2e; margin: 16px 0 8px; font-size: 24px; }
    p { color: #666; font-size: 16px; line-height: 1.5; }
    a { display: inline-block; margin-top: 18px; background: #6c63ff; color: #fff;
        text-decoration: none; padding: 12px 22px; border-radius: 12px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <div class="x">${expiredCode ? '⏳' : '⚠️'}</div>
    <h1>${heading}</h1>
    <p>${body}</p>
    <a href="${linkHref}">${linkText}</a>
  </div>
</body>
</html>`)
  }
})

// POST /auth/exchange  { code }
// Trade a one-time handoff code (from the OAuth redirect) for a durable session
// token. The code is single-use and short-lived; we delete it immediately.
router.post('/exchange', async (req, res) => {
  const ip = req.ip ?? 'unknown'
  if (exchangeRateLimited(ip)) {
    return void res.status(429).json({ error: 'Too many attempts — please wait a minute and try again.' })
  }

  const code = String(req.body?.code ?? '').trim()
  if (!code) return void res.status(400).json({ error: 'code required' })

  // Opportunistic cleanup so expired handoff codes don't accumulate.
  prisma.loginCode.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {})

  const row = await prisma.loginCode.findUnique({ where: { code } })
  if (!row || row.expiresAt.getTime() < Date.now()) {
    if (row) await prisma.loginCode.delete({ where: { code } }).catch(() => {})
    return void res.status(400).json({ error: 'This sign-in link expired. Please connect Gmail again.' })
  }

  // Burn the code first so a replay can't mint a second session.
  await prisma.loginCode.delete({ where: { code } }).catch(() => {})
  const token = await createSession(row.userId)
  res.json({ userId: row.userId, token })
})

// POST /auth/disconnect   (requires a valid session)
// Disconnects Gmail: deletes the stored OAuth tokens and revokes ALL of the
// user's sessions (logs them out everywhere). Ledger data is left intact, so a
// later reconnect shows it again without re-syncing. Best-effort token
// revocation at Google is attempted but never blocks the response.
router.post('/disconnect', requireSession, async (req, res) => {
  const userId = req.authUserId!
  try {
    const token = await prisma.oAuthToken.findUnique({ where: { userId } })
    if (token) {
      // Best-effort: ask Google to revoke the refresh token too.
      try {
        const oauth2Client = getOAuthClient()
        oauth2Client.setCredentials({ refresh_token: decryptSecret(token.refreshToken) })
        await oauth2Client.revokeCredentials()
      } catch { /* revocation is best-effort */ }
      await prisma.oAuthToken.delete({ where: { userId } }).catch(() => {})
    }
    await revokeUserSessions(userId)
    res.json({ ok: true })
  } catch (err) {
    logError('[auth/disconnect] failed:', err)
    res.status(500).json({ error: 'Could not disconnect — please try again.' })
  }
})

export { router as authRouter }
