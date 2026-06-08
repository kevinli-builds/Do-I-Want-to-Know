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
  eventDate?: string  // future date: delivery ETA / departure / check-in / event, or promo expiry
  promoCode?: string  // coupon/promo code (marketing)
  discount?: string   // short offer text e.g. "20% off" (marketing)
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
  "category": "order" | "clothes" | "shipping" | "subscription" | "travel" | "food" | "entertainment" | "charity" | "marketing" | "refund" | "other",
  "vendor": "<clean brand name, e.g. 'Amazon' not 'noreply@amazon.com'>",
  "amount": <number in the email's OWN currency — do NOT convert; omit if unknown/not a financial transaction>,
  "currency": "<ISO 4217 code inferred from the symbol/locale: ¥→JPY, €→EUR, £→GBP, ₹→INR, ₩→KRW, A$→AUD, C$→CAD, R$→BRL, CHF, kr→SEK/NOK/DKK; default USD if no other currency is indicated>",
  "date": "<YYYY-MM-DD>",
  "description": "<one short line, e.g. 'Nike summer sale promo' or 'Donation to Red Cross'>",
  "termMonths": <number, ONLY if the charge explicitly covers a multi-month term paid upfront>,
  "eventDate": "<YYYY-MM-DD, ONLY if the email states a future date: a delivery/arrival estimate, flight departure, hotel check-in, event/ticket date, OR (for marketing) the offer's expiry. Omit if none.>",
  "promoCode": "<the coupon/promo code to enter at checkout, e.g. 'SAVE20', ONLY if one is shown; omit otherwise>",
  "discount": "<short offer text, e.g. '20% off' or '$15 off $50', ONLY for a promotional offer; omit otherwise>"
}

Category guide:
- order: physical or digital product purchase that ISN'T clothing (Amazon, eBay, Best Buy, Etsy, electronics, home goods, etc.)
- clothes: apparel, footwear, and fashion accessories (Nike, Zara, H&M, Uniqlo, Lululemon, shoes, jackets, a clothing order from any retailer, etc.)
- shipping: a shipping/delivery STATUS update for an order already placed ("your order has shipped", "out for delivery", "delivered", "tracking update", "arriving Tuesday"). This is a notification, NOT a new purchase — omit amount. If a future delivery date is stated, set eventDate to it.
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
- Real purchase receipts or order confirmations are NEVER marketing — classify them by type (order, clothes, food, etc.)
- A purchase of apparel/footwear/fashion is "clothes", not "order" — even from a general retailer like Amazon (e.g. a t-shirt order → clothes)
- A shipping/delivery/tracking status update is "shipping", NEVER "order". It refers to an order already placed, so counting it as a purchase would double-count one order across its "ordered" / "shipped" / "delivered" emails. Only the ORIGINAL order confirmation or receipt (the one that represents the actual purchase/charge) is "order" (or "clothes"); every later status update for that same order is "shipping".
- A refund / return / money-back / credit email is "refund", NOT "order" — even if it's from a store. Only classify as a purchase when money went OUT.
- Charity thank-you / receipt emails ARE charity, not marketing
- If unsure between marketing and null, pick marketing for any brand promotional email

eventDate / promo rules:
- eventDate is a FUTURE-relevant date pulled from the email text when present: "arriving Jun 5", "departs Aug 12", "check-in Sep 1", "event on Oct 3" → that date. For a marketing/promo email, eventDate is the offer EXPIRY ("ends Sunday", "valid through 6/30"). Resolve relative dates (e.g. "Sunday") against the email Date when you can; otherwise omit. Omit entirely if no such date is stated.
- promoCode + discount apply to marketing/promo emails only: extract the literal code and a short offer description when shown. Omit when not a promo.
- free trials: an email saying a FREE TRIAL is ending / converting to paid ("your free trial ends on …", "trial ends in 3 days", "you'll be charged on …") is category "subscription" with NO amount yet, eventDate = the date the trial ends / first charge hits, vendor = the service, and description noting "free trial ends".

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
