import Anthropic from '@anthropic-ai/sdk'
import type { Category } from './categories'

// maxRetries lets the SDK back off and retry transient 429/5xx (honoring
// retry-after) instead of failing immediately.
const anthropic = new Anthropic({ maxRetries: 4 })

export interface ExtractedEntry {
  category: Category
  vendor: string
  amount?: number
  currency: string
  date: string       // ISO date string e.g. "2025-11-03"
  description: string
  termMonths?: number // months covered by an upfront charge (6-month plan → 6, annual → 12)
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

    try {
      const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      // System prompt is identical across batches → mark it cacheable so the
      // backend reuses it instead of re-billing it on every batch.
      system: [{ type: 'text', cache_control: { type: 'ephemeral' }, text: `You classify emails into structured records for an inbox analytics dashboard.

Return null ONLY for: personal emails, replies, calendar invites, password resets, login codes, or other emails with no category below.

For every other email, return a structured object.

Respond ONLY with a JSON object mapping the email index (as a string) to either null or:
{
  "category": "order" | "subscription" | "travel" | "food" | "entertainment" | "charity" | "marketing" | "refund" | "other",
  "vendor": "<clean brand name, e.g. 'Amazon' not 'noreply@amazon.com'>",
  "amount": <number in the email's OWN currency — do NOT convert; omit if unknown/not a financial transaction>,
  "currency": "<ISO 4217 code inferred from the symbol/locale: ¥→JPY, €→EUR, £→GBP, ₹→INR, ₩→KRW, A$→AUD, C$→CAD, R$→BRL, CHF, kr→SEK/NOK/DKK; default USD if no other currency is indicated>",
  "date": "<YYYY-MM-DD>",
  "description": "<one short line, e.g. 'Nike summer sale promo' or 'Donation to Red Cross'>",
  "termMonths": <number, ONLY if the charge explicitly covers a multi-month term paid upfront>
}

Category guide:
- order: physical or digital product purchase (Amazon, eBay, Best Buy, Etsy, etc.)
- subscription: recurring service charge (Netflix, Spotify, iCloud, gym, SaaS, etc.)
- travel: flights, hotels, car rentals, rideshare (Uber, Lyft, Airbnb, etc.)
- food: restaurants, food delivery (Uber Eats, DoorDash, Grubhub, etc.)
- entertainment: event tickets, games, streaming one-offs
- charity: donations to nonprofits, charities, crowdfunding (GoFundMe, etc.) — use amount if present
- marketing: promotional newsletters, deals, sales announcements, coupon emails, brand updates — use vendor = the sending brand; omit amount
- refund: a refund, return completed, money back, or credit issued by a merchant ("we've refunded", "your refund is on its way", "return processed", "credit applied"). Set amount = the refunded amount (positive). This is money coming BACK, so it's tracked as negative spend.
- other: any other confirmed purchase or financial notification not covered above

Key rules:
- "marketing" is for bulk/promotional email from businesses (newsletters, flash sales, "we miss you", coupon codes, etc.)
- Real purchase receipts or order confirmations are NEVER marketing — classify them by type (order, food, etc.)
- A refund / return / money-back / credit email is "refund", NOT "order" — even if it's from a store. Only classify as a purchase when money went OUT.
- Charity thank-you / receipt emails ARE charity, not marketing
- If unsure between marketing and null, pick marketing for any brand promotional email

termMonths rule:
- Set termMonths ONLY when a single charge clearly covers a fixed multi-month term paid upfront, e.g. "6-month plan" → 6, "annual"/"1-year"/"yearly" → 12, "quarterly"/"3 months" → 3, "biannual"/"2 years" → 24.
- This lets us show the monthly-equivalent cost. OMIT termMonths for ordinary one-off purchases and normal monthly charges.` }],
      messages: [{ role: 'user', content: prompt }],
      })

      const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      const parsed: BatchResult = JSON.parse(jsonMatch?.[0] ?? '{}')
      batch.forEach((e, idx) => results.set(e.id, parsed[String(idx)] ?? null))
    } catch (err) {
      // API error (rate limit after retries) or unparseable JSON: leave this
      // batch's ids OUT of the results map entirely, so they're neither stored
      // nor marked processed — the next sync retries them. (Setting them to null
      // would mean "examined, not relevant" and would wrongly mark them done.)
      console.error('[extractor] batch skipped:', (err as Error)?.message)
    }

    // Gentle pacing to ease Claude's per-minute token limit on big backfills
    if (i + BATCH_SIZE < emails.length) await new Promise(r => setTimeout(r, 1200))
  }

  return results
}
