import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export interface ExtractedEntry {
  category: 'order' | 'subscription' | 'travel' | 'food' | 'entertainment' | 'other'
  vendor: string
  amount?: number
  currency: string
  date: string       // ISO date string e.g. "2025-11-03"
  description: string
}

type BatchResult = Record<string, ExtractedEntry | null>

export async function extractEntries(
  emails: { id: string; subject: string; from: string; date: string; snippet: string }[]
): Promise<Map<string, ExtractedEntry | null>> {
  const results = new Map<string, ExtractedEntry | null>()
  const BATCH_SIZE = 25

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE)

    const prompt = batch
      .map(
        (e, idx) =>
          `[${idx}] From: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\nSnippet: ${e.snippet}`
      )
      .join('\n\n---\n\n')

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      system: `You extract structured purchase/subscription/travel data from email metadata.
For each email, return null if it is NOT a purchase, subscription, booking, or delivery confirmation.
Otherwise return a structured object.

Respond ONLY with a JSON object mapping the email index (as a string) to either null or:
{
  "category": "order" | "subscription" | "travel" | "food" | "entertainment" | "other",
  "vendor": "<brand name, e.g. Amazon>",
  "amount": <number or omit if unknown>,
  "currency": "<ISO code, default USD>",
  "date": "<YYYY-MM-DD>",
  "description": "<one short line describing the transaction>"
}

Category guide:
- order: physical or digital product purchase (Amazon, Best Buy, etc.)
- subscription: recurring service charge (Netflix, Spotify, iCloud, gym, etc.)
- travel: flights, hotels, car rentals, rideshare
- food: restaurants, food delivery (Uber Eats, DoorDash, Grubhub, etc.)
- entertainment: tickets, games, streaming one-offs
- other: any other confirmed purchase`,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)

    try {
      const parsed: BatchResult = JSON.parse(jsonMatch?.[0] ?? '{}')
      batch.forEach((e, idx) => {
        results.set(e.id, parsed[String(idx)] ?? null)
      })
    } catch {
      // If Claude's JSON is unparseable, skip the whole batch safely
      batch.forEach(e => results.set(e.id, null))
    }
  }

  return results
}
