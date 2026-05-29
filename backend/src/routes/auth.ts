import { Router } from 'express'
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

  const { userId, redirect } = decodeState(state)

  const oauth2Client = getOAuthClient()
  const { tokens } = await oauth2Client.getToken(code)
  oauth2Client.setCredentials(tokens)

  // Fetch the user's Gmail address
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
  const { data } = await oauth2.userinfo.get()

  // Upsert user record (device UUID is already the PK)
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, email: data.email ?? undefined },
    update: { email: data.email ?? undefined },
  })

  // Upsert OAuth tokens — on re-auth, Google may not return a new refresh token,
  // so we fall back to the existing one if absent
  const existing = await prisma.oAuthToken.findUnique({ where: { userId } })
  await prisma.oAuthToken.upsert({
    where: { userId },
    create: {
      userId,
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

  // Web flow: redirect back to the frontend so it can show the dashboard.
  const target = safeRedirect(redirect) ?? safeRedirect(process.env.FRONTEND_URL)
  if (target) {
    return void res.redirect(`${target}/?connected=1`)
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
})

export { router as authRouter }
