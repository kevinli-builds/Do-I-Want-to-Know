import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { google } from 'googleapis'
import { getOAuthClient } from '../lib/gmail'
import { prisma } from '../lib/prisma'

const router = Router()

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
function safeRedirect(redirect?: string): string | null {
  if (!redirect) return null
  if (process.env.FRONTEND_URL && redirect === process.env.FRONTEND_URL) return redirect
  if (/^http:\/\/localhost(:\d+)?$/.test(redirect)) return redirect
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
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
    },
    update: {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token ?? existing?.refreshToken ?? '',
      expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
    },
  })

  // Web flow: redirect back to the frontend with the canonical id so the device
  // adopts it (and thereby sees this Gmail's data on every device).
  const target = safeRedirect(redirect) ?? safeRedirect(process.env.FRONTEND_URL)
  if (target) {
    return void res.redirect(`${target}/?connected=1&uid=${encodeURIComponent(canonicalId)}`)
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
    console.error('[auth/callback] failed:', err)
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

export { router as authRouter }
