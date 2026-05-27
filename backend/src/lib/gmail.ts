import { google } from 'googleapis'
import { prisma } from './prisma'

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.BASE_URL}/auth/google/callback`
  )
}

export interface RawEmail {
  id: string
  subject: string
  from: string
  date: string
  snippet: string
}

export async function fetchEmailsForUser(userId: string): Promise<RawEmail[]> {
  const token = await prisma.oAuthToken.findUnique({ where: { userId } })
  if (!token) throw new Error('No OAuth token for user')

  const oauth2Client = getOAuthClient()
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiresAt.getTime(),
  })

  // Persist refreshed access tokens automatically
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await prisma.oAuthToken.update({
        where: { userId },
        data: {
          accessToken: tokens.access_token,
          expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
        },
      })
    }
  })

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  const oneYearAgo = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000)
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: [
      `after:${oneYearAgo}`,
      '(subject:order OR subject:receipt OR subject:invoice OR subject:confirmation',
      'OR subject:subscription OR subject:delivery OR subject:shipped OR subject:booking)',
    ].join(' '),
    maxResults: 200,
  })

  const messages = listRes.data.messages ?? []
  if (messages.length === 0) return []

  const fetched = await Promise.all(
    messages.map(({ id }) =>
      gmail.users.messages.get({
        userId: 'me',
        id: id!,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      })
    )
  )

  return fetched.map(res => {
    const headers = res.data.payload?.headers ?? []
    const get = (name: string) => headers.find(h => h.name === name)?.value ?? ''
    return {
      id: res.data.id!,
      subject: get('Subject'),
      from: get('From'),
      date: get('Date'),
      snippet: res.data.snippet ?? '',
    }
  })
}
