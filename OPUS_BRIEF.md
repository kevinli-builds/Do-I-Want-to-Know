# Do I Want To Know — Product / Design / Engineering Brief

_Written 2026-07-03 by a Claude portfolio review session. Audience: a future Opus
session. `CLAUDE.md` is the source of truth (auth model, sync/backfill mechanics,
currency handling, deployment). This app just completed a security-hardening +
refactor pass (branch `refactor/security-and-cleanup`) — the engineering section
below is accordingly short. Verify current state before implementing._

---

## 1. Product roadmap (PM)

The product is feature-rich but **gated**: Google OAuth is in Testing mode
(≤100 invited test users, ~weekly token expiry). Until verification lands, growth
features should work *without* requiring a Gmail connection.

### P1 — Demo mode (the growth unlock while OAuth is invite-only)
A visitor who can't connect Gmail currently sees a wall. Give them the full
Wrapped experience on fictional data.
**Instructions for Opus:**
- Build a realistic sample dataset (~300 ledger entries across 2 years: orders,
  subs, travel, refunds, multi-currency) as a static JSON fixture in `web/`.
- "Try the demo" button on `ConnectView` → renders `WrappedView` (and Monitor/
  Audit read-only) from the fixture entirely client-side — no backend calls, no
  Claude cost. Banner: "Sample data — connect Gmail to see yours" + the access-
  request form (backend `/access/request` already exists).
- This also becomes the screenshot/marketing surface.

### P1 — Downloadable share card (already the named "main word-of-mouth play")
1080×1920 year-in-review image: total spend, top vendor, subscription count,
biggest purchase, one Wrapped Moment.
**Instructions for Opus:** client-side canvas render from existing
`/wrapped` data (no backend). "Share my Wrapped" button in `WrappedView`;
default to numbers-visible-but-vendor-names-optional (privacy toggle) since
people post these publicly. Works in demo mode too — demo shares are ads.

### P2 — Weekly/monthly email digest (retention)
The Monitor content (MoM trend, renewals due, unusual charges) is perfect
pull-back material, but there's no channel. Needs an email provider (Resend free
tier) + a cron on Render + an opt-in flag on `User`. Keep it plain-text-ish,
PII-minimal, with a one-click disable link (signed token).

### P2 — OAuth verification / CASA assessment (the real unlock)
Not a coding task; a process task (restricted-scope review for
`gmail.readonly`). An Opus session can: write the required privacy/security
documentation drafts, verify the privacy policy covers Limited Use disclosures,
and produce the demo video script. Track as a project, start after demo mode
ships (reviewers will use the demo too).

### P3 — Category budgets push alerts (extend existing budgets to notify via the
PWA service worker when a monthly budget crosses 80%/100% — needs web-push infra
similar to PersonalAssist's).

### Explicitly not now
More analytics tabs. The app already has Wrapped/Monitor/Audit/Promotions/
Unsubscribe/Upcoming — breadth is no longer the bottleneck; distribution is.

---

## 2. Design audit

Strengths: strong purple identity, instant cached dashboard render
(stale-while-revalidate), 429 cooldown surfaced in friendly language, PWA.

Issues:
1. **Tab sprawl.** Six surfaces (Wrapped, Monitor, Audit, Promotions,
   Unsubscribe, Upcoming floater) — the IA has outgrown its nav. Group as three:
   **Wrapped** (the show), **Monitor** (budgets/trends/renewals), **Inbox tools**
   (Audit + Promotions + Unsubscribe). Upcoming stays a floater.
2. **Connect screen must sell trust.** It's asking for Gmail read access — the
   single highest-friction ask in the portfolio. The screen should state, above
   the fold: metadata only (subject/sender/snippet — never full body), read-only
   scope, disconnect anytime + what disconnect does. All true; say it there, not
   only in the privacy policy.
3. **Sync feedback**: multi-pass backfill ("more to load — keep syncing") is
   honest but manual. Show progress framing: "examined 1,400 emails · back to
   Mar 2024" (the data exists: `examinedCount`, `oldestDate`) so repeated taps
   feel like progress, not nagging.
4. **First-sync dead time** (30–120s): show a staged progress narrative (listing
   → reading → extracting) rather than a spinner, if not already.
5. Number formatting: ensure large totals and multi-currency hints (`≈ $X`)
   use consistent tabular formatting across cards.

---

## 3. Engineering audit

Recent hardening covered the big items (bearer sessions, hashed tokens, encrypted
OAuth tokens at rest, locked CORS, helmet, trust proxy, constant-time admin key,
proxy-aware rate limiting, PII-safe logs, formula-injection-safe export).
Remaining, smaller:

1. **Test coverage**: the backend has effectively no automated tests. Highest-
   value targets: `extractor.ts` prompt-output parsing (feed it canned Claude
   responses incl. malformed JSON), `fx.ts` conversion + fallback, `renewals.ts`
   prediction logic, and the `/wrapped` date-scoping math. Vitest + a few fixture
   files; no network.
2. **In-memory rate limiter + sessions on a single Render instance** — fine
   today; if Render ever scales to 2+ instances the limiter and LoginCode
   single-use guarantees need a shared store. Leave a comment/doc note, don't
   build it.
3. **Anthropic spend cap** — still listed as outstanding ops in CLAUDE.md; it's
   a dashboard task for the user, but any Opus session touching sync should
   re-check batch sizes and the prompt-cache marker are intact (cost regression
   is the main operational risk).
4. **Render free-tier cold start** (~50s) hits the first API call of a session;
   the web client's cached-render already masks it — verify the connect + sync
   paths surface a "waking the server" message on timeout rather than an error.
5. Refactor: `WrappedView.tsx` and `wrapped.ts`/`monitor` route logic are the
   growth areas — if the P1 features land, extract the stat-card components and
   keep `computeStats`/`computeMonitor` pure and unit-tested (they already
   normalize USD up front — good seam).

---

## 4. Surprise & delight (unbuilt ideas — cherry-pick)

_The app is named "Do I Want To Know" — the delight register is **dread-comedy**:
brace-yourself reveals, playful self-recognition, small wins celebrated. All of
these compute client-side from data `/wrapped` and `/transactions` already
return, and all work in demo mode (see P1), where they double as marketing._

### D1 — Guess before you look ⭐ (the on-brand flagship)
Before revealing the yearly total, ask: "How much do you *think* you spent this
year?" — slider or input — then a staged reveal: guess … drumroll … actual, with
the delta ("You were $2,647 optimistic 😬"). It converts the scariest number in
the app into a game, and the guess-vs-actual card is the most shareable artifact
the app could produce (include it in the share card). Pure `WrappedView` UI;
store the guess in localStorage per scope so re-visits skip it.

### D2 — Spending personas
A playful archetype computed from category mix + timing patterns: "The
Subscription Collector" (subs > 30% of spend), "The Midnight Snacker" (food
orders clustering late), "The Loyal Regular" (one vendor dominates), "The
Refund Ninja" (high refund recovery). Pure function over existing stats with
tested criteria; revealed as the Wrapped finale card. People share what
describes *them* — this is the horoscope mechanic, backed by real data.

### D3 — Vendor relationship cards
"You and DoorDash: 47 orders · $1,204 · longest gap 11 days 💔" — framed as a
relationship. Each card gets a gentle CTA: "taking a break?" deep-links the
existing Unsubscribe tab for that sender. Humor that lands directly on the
app's most virtuous action.

### D4 — Refund wins
"You got **$214 back** this year 🎉" — refunds are already netted in the math;
nobody celebrates them. A small confetti stat card in Wrapped + a Monitor
callout when a new refund lands in a sync. Positive reinforcement in an app
that's otherwise bad news.

### D5 — Subscription time machine
From the subscription monitor: "Your current subscriptions cost **$8,940 over
the next 5 years**" with a per-sub contribution bar and a "cancel one, watch
the number drop" interaction. Amortized monthly costs already exist
(`termMonths` logic); this is multiplication with drama. The single most
action-driving number the app can show.
