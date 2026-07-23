# Do I Want To Know — Product / Design / Engineering Brief

_Written 2026-07-03 by a Claude portfolio review session. Audience: a future Opus
session. `CLAUDE.md` is the source of truth (auth model, sync/backfill mechanics,
currency handling, deployment). This app just completed a security-hardening +
refactor pass (branch `refactor/security-and-cleanup`) — the engineering section
below is accordingly short. Verify current state before implementing._

---

## 0. Status ledger (2026-07-05) + how to pick up

**✅ SECURITY — C1 IDOR fix VERIFIED LIVE (2026-07-18).** Checked the Render dashboard
deploy list: the running deploy is `d051f14` (deployed 2026-07-12 23:54 EDT), which
contains the fix. ⚠️ Note: the 2026-07-18 manual deploy re-ran `d051f14`, NOT the
latest commit — so `5744e12`+ (zombie unsubscribe links in the monitor payload, and
anything after) awaits the next **"Deploy latest commit"** click on Render.

**Shipped ✓** — demo mode, share card, guess-before-you-look (D1); first-visit tour (§5);
OAuth/CASA verification pack (§7, `docs/OAUTH_VERIFICATION.md`); web-client type/ScopePicker refactor;
**§9 A1 + A4 backend (2026-07-11)** — `lib/subhealth.ts`: plateau-based price-step detection (FX/tax-jitter
tolerant, promo-month outliers absorbed, `confirmed` labelling), price-driven monthly-burn delta vs a year
ago, zombie-sub finder. Wired into `computeMonitor` (replaces the noisy last-two-amounts price check;
`subscriptions.health` in the payload) and the flag strip — **user-visible today via Monitor flags with no
web changes**. First backend tests landed with it (vitest, `src/lib/__tests__/`; `npm test`).
**Subscription-health panel SHIPPED (2026-07-13)** — MonitorView renders `subscriptions.health`:
burn-delta headline, price-step list (confirmed / seen-N× badges, pct, date), zombie cards with
Unsubscribe deep-links (`ZombieSub.unsubscribe` added backend-side, tested); demo-mode monitor
port mirrors `health`. Verified visually in demo mode.
**§8 mobile fixes SHIPPED (2026-07-18)** — tab bar now signals its offscreen tabs
(CSS scrolling-shadows on `.view-tabs`: the shadow appears only on the side that
actually overflows) and the active tab auto-scrolls into view on change (instant, not
smooth — smooth scroll silently no-ops in throttled tabs); tabs are 44px touch targets
and the ? tour button 40px on phones. Hero number was already 40px (fixed earlier).
Verified on a production build at 375×812 (dev-server HMR is unreliable in this repo —
Turbopack + the spaces in the folder name; use the `diwtk-web-prod` launch config).
**§9 A2 cashflow calendar SHIPPED (2026-07-18)** — Monitor card between Budgets and
Analytics: Sunday-first month grid, past days heat-mapped by net daily spend (SPEND
categories − refunds; net-refund days tinted green, excluded from the heat scale),
future days carry predicted renewals (🔁 with count), "≈ $X hits in the next 7 days"
headline, month nav + tap-a-day detail. Pure `lib/cashflow.ts` (12 vitest tests —
vitest now wired in `web/`, `npm test`); verified in demo mode desktop + 375px.
**Date-parsing bug FIXED with it**: bare `YYYY-MM-DD` renewal dates were parsed as UTC
midnight by `lib/dates.ts`, so every renewal displayed a day early in US timezones
(UpcomingFloater + Monitor "renewing soon" affected too) — `toDate` now parses bare
dates as local calendar dates (regression-tested).
**§9 A5 what-if simulator SHIPPED (2026-07-18) — "Plan ahead" release complete (A2+A5).**
Monitor "💡 What If?" card after the calendar: tick subscriptions to cancel (per-sub
burn now in the monitor payload as `subscriptions.items`, backend + demo mirror; sums
to monthlyBurn so numbers stay consistent) and/or cap a category (avg monthly from
analytics, subscription category excluded to avoid double-counting) → live
"$X/mo · $Y/yr" recompute + the §4 D5 hook: "subscriptions cost ≈ $N over 5 years"
with the drop-on-cancel. Pure `lib/whatif.ts` (8 tests). `items` is optional in the
web type so the card degrades gracefully until the Render deploy. Verified in demo
mode desktop + 375px (44px-ish touch rows via mobile padding bump).
**§3 backend tests SHIPPED (2026-07-18)** — extractor parse path (extracted as pure
`parseBatchResponse`, now scans for the FIRST text block per §10 instead of
`content[0]`), fx conversion/normalization, renewals prediction: 20 new tests, 57
total. **Hardening found by the tests:** a max_tokens-truncated Claude response could
regex-parse cleanly (or to `{}`) and silently mark a whole batch not-relevant —
permanent email loss; `extractEntries` now throws on `stop_reason === 'max_tokens'`
so truncated batches retry next sync.
**§9 A3 vendor drilldown SHIPPED (2026-07-23) — "Power reader" release started.**
Tap the 📊 next to a vendor name anywhere (Wrapped top vendors / biggest purchase /
top senders / subscription radar, Monitor top senders + renewals + price steps +
zombie cards, every Audit row) → a modal reader for that vendor: net spend with the
refund split, typical order, days since last, buying rhythm, monthly spend line chart,
order-size histogram, longest dry spell, refunds recovered, category mix, and the
full record list with per-email Gmail links. Pure `lib/vendorStats.ts`
(`buildVendorProfile` + `listVendors`, 13 vitest tests, 32 total in `web/`); zero
backend work — it reuses the `/transactions` list the app already fetches, fetched
once on first open and reused for every later vendor. Promo-only senders get a
"no purchases on record" variant. Verified in demo mode on a production build at
desktop + 375px; the 📊 opener is 44×44 and always visible (never a hover reveal).
Note: the `diwtk-web-prod` launch config (`:3011`, `npm run start -- -p 3011`) this brief
kept referencing did not actually exist — recreated it, but `.claude/` is gitignored, so a
fresh clone has to add it again.
**§9 A7 ledger workbench SHIPPED (2026-07-23).** The Audit tab grew a filters row
rather than a new tab (IA is full, per §9): multi-term text search over vendor+
description, category chips (canonical order, multi-select), USD amount range, date
range, hide-accepted, five sorts (recent / oldest / highest / lowest / vendor A–Z),
named **saved views** (localStorage per user — stores the filter+sort, not records,
and normalizes anything corrupt on read), a live summary line ("Showing 148 of 379 ·
14 vendors · $3,016.74 net") with Clear, and **CSV of exactly the filtered set**
(the Wrapped ⬇ Export stays the full-ledger xlsx). Pure `lib/ledgerFilter.ts`
(23 vitest tests, **55 total in `web/`**); `filterTxns`/`sortTxns` are generic over
`T extends LedgerTxn` so the Audit rows keep their full `Transaction` type.
**The CSV mirrors the backend export's `safeText` formula-injection guard** — a
vendor/description beginning `= + - @` or tab/CR is apostrophe-prefixed, since that
text is email-derived (tested). Verified in demo mode on a production build: filters
compose (379 → 148 → 17 → 3), a saved view round-trips exactly, the CSV blob carries
only the filtered rows, all 44px touch targets and no overflow at 375px.
**Next → (highest value first)** — §9 A8 anomaly feedback loop closes the "Power
reader" release; it is the only §9 item that touches schema (one small table:
userId, vendor, toleranceMultiplier + a threshold-math change), so it needs a
migration + a Render deploy, unlike A2/A3/A5/A7. After that §9 is down to A6
(promise tracker, explicitly "prototype before promising precision") and A9
(print-CSS annual report), or §6 W2 the weekly digest email for retention. **Delete-my-data SHIPPED (2026-07-11)** — `DELETE /users/me`
(session-authed, transactional erasure of ledger/processed/acceptances/budgets/codes/sessions/tokens/user
+ best-effort Google revoke) + double-confirmed "Delete my data" button in WrappedView + privacy-policy
retention section updated. **Privacy policy REWRITTEN (2026-07-18)** — `PRIVACY_POLICY.md` + the served
`/privacy` page (`backend/src/lib/pages.ts`) now match and cover verification blocker 2 in full: exact
scopes + why, Limited Use disclosure, Anthropic-as-processor with no-training statement, storage/encryption
posture, subprocessor table, disconnect-vs-delete distinction, demo-mode note; contact switched from the
unowned `diwtkn.com` to the `snowwarrior1+diwtk@gmail.com` alias (swap to the custom domain when bought).
Content pinned by `src/lib/__tests__/pages.test.ts`. ConnectView also gained the footer privacy-policy
link (blocker 4). Remaining CASA blocker: the custom domain (user task).
**Usability pass (2026-07-12)** — Audit rows now have a per-record **Remove** button
(`DELETE /transactions/:userId/:id`, ownership-scoped, tested) so a bogus extraction can be
deleted; the ✏️ vendor-rename button was hover-revealed (`opacity: 0`) and therefore invisible
on touch screens — now visible under `@media (hover: none)`. Both live after the next
Render + Vercel deploys.
**Needs the user** — buy a custom domain (CASA blocker); set the Anthropic spend cap.
**Parked** — new-growth features (breadth is not the bottleneck; depth is, per §9).

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

---

## 6. Wave 2 — after the cold open (written 2026-07-04)

_State at writing: demo mode, share card, guess-before-reveal (D1), and the
first-visit tour are LIVE. Security hardening done. The bottleneck is now
distribution + retention, in that order. Verify state before building._

### W1 — OAuth verification / CASA (the only real unlock; process > code)
**Drafted: see `docs/OAUTH_VERIFICATION.md`** (gap analysis, demo-video
script, CASA crib sheet, order of operations). Two blockers surfaced there
need action before submission: (1) a custom domain — `*.onrender.com` /
`*.vercel.app` can't pass Search Console verification (user buys the domain;
a session re-points env vars + callback URIs); (2) a **delete-my-data**
endpoint + UI (spec in the doc — buildable by any session today). Until this
lands, every other growth feature is capped at 100 test users.

### W2 — Weekly digest email (retention channel; no push infra needed)
Resend free tier + a Render cron (or node-cron in-process — single instance,
fine). Content = the Monitor trend block: MoM spend, renewals due in 14d,
unusual charges, budget status. Opt-in flag on User, one-click unsubscribe
via signed token link. Plain HTML, PII-minimal.

### W3 — Remaining delights, in value order
D5 subscription time machine (multiplication with drama; data exists) →
D3 vendor relationship cards (deep-links the Unsubscribe tab) →
D2 spending personas (share-card fodder) → D4 refund wins.

### W4 — Per-user extraction learning (quiet quality moonshot)
`categoryLocked` edits are training signal. At sync time, inject the user's
last ~20 corrections into the extraction system prompt as few-shot pairs
(vendor/subject → corrected category). No model training, just prompting;
measure: % of new rows later re-corrected. Keep the cache-marked system
prompt static and append corrections as a second block so caching still works.

### W5 — Travel Wrapped (new surface, tentative)
`travel` category + `eventDate` already capture flights/hotels/check-ins.
A map view of the year's trips (Leaflet, client-side) + "miles flown"
estimates from city pairs. Big wow, moderate lift; could later be its own
share card. Do after W1-W3.

### Tentative / parked
- **Plaid/bank import**: changes the privacy story fundamentally ("we read
  email metadata" → "we read your bank"). Park until Wrapped-from-email
  saturates.
- **Mobile app revival**: the PWA covers it; revisit only on user pull.
- **January "Wrapped drop"**: seasonal campaign mechanics (year-lock default
  scope + confetti + share prompts each January). Cheap; build in December.

---

## 8. Mobile & web experience scan (measured 2026-07-05, 375x812 viewport)

_Live-tested in demo mode. Web/desktop is clean; mobile is sound with three
fixes worth shipping:_

1. **Tab bar overflows with no affordance** ⭐ — the 5 tabs + ? exceed the
   viewport by ~138px; it scrolls (`overflow-x: auto`) but nothing signals
   that, so Promotions / Unsubscribe / the ? button (offscreen at x=499) are
   undiscoverable. Fix: either the section-2 IA regroup (5 tabs → 3), or
   cheap version now — edge fade-out gradients on `.view-tabs` + scroll the
   active tab into view on change.
2. **Tabs are 34px tall** — under the 44px touch minimum. Bump mobile
   padding (`py-2.5` equivalent) in `.view-tab`.
3. **Hero number is 22px** on mobile — the yearly total is the product; let
   it breathe (28-32px at <640px, tabular-nums).
- Verify on a real device (demo hides the sync FAB, untestable here): the
  Upcoming floater renders bottom-left at 375w — confirm it does not collide
  with the FAB stack in connected mode.
- Landing page measured clean: no horizontal overflow, 50px+ buttons.

---

## 9. Depth roadmap — serving the current user (2026-07-05)

_Direction change from the user: depth for the connected user over growth.
The ledger already holds everything needed — these are analytics features,
nearly all computable from existing `/wrapped` + `/transactions` data.
House rules: compare the user only to THEMSELVES (never cohorts), always
offer click-through provenance to the source emails, label estimates._

### A1 — Price-increase detector (M) ⭐ (the killer depth feature)
Subscriptions are repeated (vendor, ~amount) charges: detect steps in the
per-vendor amount series → "Netflix: $15.49 → $17.99 in March (+16%). Your
subscriptions cost $31/mo more than a year ago." Surface in Monitor + a
line in Wrapped. Pure function over the ledger; fixture-tested (step
detection needs a tolerance band for FX/tax jitter).

### A2 — Cashflow calendar (M)
Month-grid heatmap of daily spend (past) + predicted renewals plotted
forward (renewals.ts already predicts) = "what hits next week." The single
most requested view in any finance tool; here it needs zero new data.

### A3 — Vendor drilldown pages (M)
Tap any vendor anywhere → full analytics: monthly trend, order-size
distribution, longest gap, category mix, refund history, first/last
purchase. The Audit table is the editor; this is the reader.

### A4 — Zombie subscription finder (S)
Active subscription charges with no other vendor activity in 90d (no
orders, no shipping, no marketing opens tracked — frame carefully as "you
have not gotten mail from them besides the bill"). CTA into Unsubscribe /
cancellation. Pairs with A1 as a "subscriptions health" panel.

### A5 — What-if simulator (M) ⭐
Interactive scenario builder: toggle off subscriptions, cap a category →
live "saves $X/yr" recompute. Client-side over existing stats; the number
that changes as you toggle is the persuasion mechanic. Feeds §4 D5.

### A6 — Promise tracker (M, tentative)
Match refund-promised emails to refund-received, delivery ETA (eventDate)
to delivery-confirmed → per-vendor "keeps promises" score. Extraction
already captures the halves; the join logic is new and fuzzy — prototype
against real data before promising precision.

### A7 — Ledger workbench (M)
Power-user query bar over /transactions: free text + amount range + date
range + category chips, saved views, column sort, CSV of the filtered set.
The Audit tab grows a "filters" row rather than a new tab (IA is full).

### A8 — Anomaly feedback loop (S)
Unusual-charge alerts exist; add "expected" / "not expected" buttons that
persist per-vendor tolerance so alerts get personal over time. One small
table (userId, vendor, toleranceMultiplier) + threshold math change.

### A9 — Annual report (S)
Print-CSS typeset year report (all the Wrapped + Monitor content, formal
layout) → "Save as PDF". The private, in-depth cousin of the share card.

### Sequencing
A1 + A4 together = "Subscription health" release; A2 + A5 = "Plan ahead"
release; A3 + A7 + A8 = "Power reader" release. All backend-light; only
A8 touches schema.

---

## 10. Code-quality audit (2026-07-12, Fable portfolio pass)

_This repo is PUBLIC. Sensitive/exploitable security findings from this audit are
**not** written here — they live in `C:\Users\snoww\PORTFOLIO_SECURITY_AUDIT.md`
(home dir, not a git repo). **There is a top-priority OPEN security item for this
app there — read it before any roadmap work.** Below are the non-sensitive
code-quality notes only._

- ✅ **Authorization matrix — SHIPPED (2026-07-12).** `backend/src/routes/__tests__/authz.test.ts`
  now asserts a token minted for user A is rejected (403) for user B's id across all 8
  `:userId` routers, plus a unit test of the `enforceOwnership` guard and an owner
  positive control. Landed alongside the security fix (see the sensitive audit file).
  Test coverage is still the next-biggest gap otherwise (§3.1: extractor parsing, fx,
  renewals) — this suite is the template for the rest.
- ✅ **`:userId` ownership wiring — FACTORED (2026-07-12).** The shared guard now lives
  once in `lib/session.ts` (`enforceOwnership`), registered per router via
  `router.param('userId', …)`. The remaining per-router boilerplate
  (`router.use(requireSession)` + `findMany({ where: { userId } })`) is still
  repetitive but no longer security-sensitive; factor further only if it earns its keep.
- ✅ **Category validation on the extraction path — SHIPPED (2026-07-12).**
  `lib/categories.ts` `normalizeCategory()` coerces any value outside `CATEGORIES` to
  `other`; `emails.ts` persist path uses it instead of trusting Claude's raw string
  (email content is attacker-influenceable). Matches how `budgets`/`transactions`
  already validate. Test: `lib/__tests__/categories.test.ts`.
- **`extractor.ts:98` reads only `msg.content[0]`** — fine for Haiku today, brittle
  if a future model prepends a block. Scan for the first `type === 'text'` block.
- **`extractor.ts` JSON parse** greedily regexes `\{[\s\S]*\}` then `JSON.parse`s —
  robust enough with the try/catch, but a canned-response test fixture (incl.
  malformed JSON, already noted in §3.1) would lock the behavior in.
