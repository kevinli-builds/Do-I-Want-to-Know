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
  senderEmail: string | null
  unsubscribe: string | null
}

// Parse the bare email address out of a From header ("Nike <news@nike.com>")
export function parseSenderEmail(from: string): string | null {
  const angled = from.match(/<([^>]+)>/)
  const raw = (angled ? angled[1] : from).trim()
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw) ? raw.toLowerCase() : null
}

// Pick the best link out of a List-Unsubscribe header (prefer https one-click,
// fall back to mailto). Header looks like: <https://...>, <mailto:...>
export function parseUnsubscribe(header: string): string | null {
  if (!header) return null
  const links = [...header.matchAll(/<([^>]+)>/g)].map(m => m[1].trim())
  const http = links.find(l => /^https?:/i.test(l))
  if (http) return http
  const mail = links.find(l => /^mailto:/i.test(l))
  return mail ?? null
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

  // Run three searches in parallel then merge + deduplicate:
  //   1. Purchase/receipt emails (order confirmations, invoices, subscriptions, etc.)
  //   2. Promotional / marketing emails (Gmail's Promotions category tab)
  //   3. Charity / donation emails
  const [purchaseRes, promoRes, charityRes] = await Promise.all([
    gmail.users.messages.list({
      userId: 'me',
      maxResults: 200,
      q: [
        `after:${oneYearAgo}`,
        '(subject:order OR subject:receipt OR subject:invoice OR subject:confirmation',
        'OR subject:subscription OR subject:delivery OR subject:shipped OR subject:booking)',
      ].join(' '),
    }),
    gmail.users.messages.list({
      userId: 'me',
      maxResults: 300,
      q: `after:${oneYearAgo} category:promotions`,
    }),
    gmail.users.messages.list({
      userId: 'me',
      maxResults: 100,
      q: [
        `after:${oneYearAgo}`,
        '(subject:donation OR subject:donate OR subject:"your donation"',
        'OR subject:"your gift" OR subject:"thank you for your gift"',
        'OR subject:"tax receipt" OR subject:"tax deductible" OR subject:"charitable")',
      ].join(' '),
    }),
  ])

  // Merge all message IDs, deduplicating by id
  const seen = new Set<string>()
  const allIds: string[] = []
  for (const msg of [
    ...(purchaseRes.data.messages ?? []),
    ...(promoRes.data.messages ?? []),
    ...(charityRes.data.messages ?? []),
  ]) {
    if (msg.id && !seen.has(msg.id)) {
      seen.add(msg.id)
      allIds.push(msg.id)
    }
  }

  if (allIds.length === 0) return []

  // Fetch metadata for all messages in parallel
  const fetched = await Promise.all(
    allIds.map(id =>
      gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date', 'List-Unsubscribe'],
      })
    )
  )

  return fetched.map(res => {
    const headers = res.data.payload?.headers ?? []
    const get = (name: string) =>
      headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
    const from = get('From')
    return {
      id: res.data.id!,
      subject: get('Subject'),
      from,
      date: get('Date'),
      snippet: res.data.snippet ?? '',
      senderEmail: parseSenderEmail(from),
      unsubscribe: parseUnsubscribe(get('List-Unsubscribe')),
    }
  })
}
