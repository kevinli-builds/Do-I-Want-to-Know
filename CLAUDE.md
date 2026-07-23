# Do I Want To Know — Claude Context

## Notes & handoff — READ FIRST when told to "go through your notes"
**`OPUS_BRIEF.md`** (repo root) is the forward roadmap of record: PM/design/security
audits (sections 1-3), delight ideas (4), first-visit cold opens (5, shipped), wave-2 (6),
Fable design notes (7), mobile/web scan (8), and the depth roadmap (9) — plus a **status
ledger at the very top** marking what has shipped vs. what is next. When asked to pick up
the next enhancement: (1) read the brief; (2) run `git log --oneline -20` + `git status` —
a dirty working tree means another agent is mid-flight, so choose a different area or write
specs rather than edit the same files; (3) confirm the item is not already built; (4) build
it with the house conventions (tests, then commit + push).
Other notes: `docs/OAUTH_VERIFICATION.md` (verification gap analysis, demo-video script, CASA crib sheet).

## Concept
"Spotify Wrapped, but for your Gmail inbox."

The app connects to the user's Gmail account via Google OAuth, reads metadata
from order/subscription/travel/food emails (subject, sender, date, snippet —
never full body), runs Claude AI extraction to pull out structured purchase
records, and displays a "Wrapped"-style year-in-review dashboard: total spend,
top vendors, subscription count, biggest purchase, category breakdown.

The user is **snowwarrior1-alt** (GitHub handle). All work has been done in
Claude Code sessions — no external team.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Mobile app | React Native + Expo SDK 51 |
| Language | TypeScript throughout |
| Backend | Node.js + Express |
| ORM | Prisma v5 |
| Database | PostgreSQL (Neon.tech free tier) |
| AI extraction | Anthropic Claude API (`claude-haiku-4-5`) |
| Auth | Google OAuth 2.0 (gmail.readonly + userinfo.email scopes) |
| Hosting | Render.com (free web service) |
| Secrets | `.env` file (never committed — gitignored) |

---

## Repository Structure

```
Do I Want To Know/
├── app/                        React Native / Expo app
│   ├── App.tsx                 Root: conditional render ConnectScreen vs WrappedScreen
│   ├── app.json                Expo config (slug, bundleId, extra.apiUrl)
│   ├── package.json
│   └── src/
│       ├── api/client.ts       Axios instance + all API call functions + type defs
│       ├── lib/userId.ts       Generates/persists device UUID via expo-secure-store + expo-crypto
│       └── screens/
│           ├── ConnectScreen.tsx   "Connect Gmail" onboarding — opens OAuth URL in browser
│           └── WrappedScreen.tsx   Main dashboard — Sync button + all stat cards
├── backend/
│   ├── src/
│   │   ├── index.ts            Express app setup, route mounting
│   │   ├── lib/
│   │   │   ├── prisma.ts       Prisma client singleton
│   │   │   ├── gmail.ts        Gmail API helper — fetches email metadata, handles token refresh
│   │   │   └── extractor.ts    Claude batch extraction — emails → structured LedgerEntry data
│   │   └── routes/
│   │       ├── users.ts        POST /users — upsert device user, return connection status
│   │       ├── auth.ts         GET /auth/google, GET /auth/google/callback — full OAuth flow
│   │       ├── emails.ts       POST /emails/sync — fetch new emails, extract, persist
│   │       └── wrapped.ts      GET /wrapped/:userId — aggregate LedgerEntry into Wrapped stats
│   ├── prisma/
│   │   ├── schema.prisma       Models: User, OAuthToken, LedgerEntry
│   │   └── migrations/
│   │       ├── 20260526013950_init/           Original migration (survey platform tables)
│   │       ├── 20260527000000_gmail_wrapped/  Drops survey tables, adds email/OAuth/ledger
│   │       ├── 20260529000000_rate_limit/     Adds User.lastSyncedAt for sync rate limiting
│   │       ├── 20260530000000_unsubscribe/     Adds LedgerEntry.senderEmail + unsubscribe
│   │       ├── 20260530100000_access_requests/ Adds AccessRequest table (invite requests)
│       ├── 20260601000000_session_auth/     Adds Session (hashed bearer tokens) + LoginCode (one-time OAuth handoff)
│       ├── 20260602000000_session_expiry/   Adds Session.expiresAt (sessions expire, default 90d)
│       ├── 20260603000000_processed_emails/  Adds ProcessedEmail (examined-email dedup; backfilled from LedgerEntry)
│       ├── 20260604000000_upcoming_promos/    Adds LedgerEntry.eventDate + promoCode + discount
│       └── 20260605000000_category_lock/       Adds LedgerEntry.categoryLocked (manual category override)
│   └── package.json            Deps: @anthropic-ai/sdk, googleapis, @prisma/client, express, cors, dotenv
├── web/                        Next.js web app (PRIMARY client) — deploys to Vercel
│   ├── app/
│   │   ├── layout.tsx          Root layout + metadata
│   │   ├── page.tsx            Client page: init UUID, upsert user, render Connect vs Wrapped
│   │   ├── globals.css         All styling (purple #6c63ff theme)
│   │   ├── lib/
│   │   │   ├── userId.ts       Device UUID via crypto.randomUUID() + localStorage
│   │   │   └── api.ts          fetch() client for the Render backend + type defs
│   │   └── components/
│   │       ├── ConnectView.tsx "Connect Gmail" landing — full-page redirect to OAuth
│   │       └── WrappedView.tsx Dashboard — Sync button + all stat cards, handles 429 rate-limit
│   ├── next.config.js
│   ├── tsconfig.json
│   └── package.json            Next 16 + React 19 (App Router, static export)
├── render.yaml                 Render deployment config (service: diwtkn-backend)
├── PRIVACY_POLICY.md
└── .gitignore                  Excludes: node_modules, dist, .env, *.db, .expo, .claude
```

---

## How the App Works (full flow)

1. **App launch** → `getUserId()` reads or creates a UUID stored in `expo-secure-store`
2. **POST /users** → upserts user row; returns `{ connected: bool, email }` 
3. If `connected === false` → show **ConnectScreen**
4. User taps **"Connect Gmail"** → `expo-web-browser` opens `GET /auth/google?userId=<uuid>`
5. Backend redirects to Google consent screen (gmail.readonly + userinfo.email)
6. Google redirects to `GET /auth/google/callback` → tokens stored in `OAuthToken` table, Gmail address stored in `User.email`
7. Browser shows "Connected! Close this tab." page
8. User closes browser → `onConnected()` called → re-fetches user status → shows **WrappedScreen**
9. User taps **"Sync Emails"** → `POST /emails/sync`:
   - Lists candidate message IDs over the lookback window (default 3 years, up to `SYNC_MAX_EMAILS`=2000) across purchase/promotions/charity queries
   - Drops emailIds already in `ProcessedEmail` (every email previously **examined**, not just stored purchases) **before** fetching metadata, so repeat syncs only pull genuinely new/unexamined mail and never re-classify non-relevant emails
   - Fetches metadata for new IDs in throttled batches (`gmail.ts`: `listEmailIds` + `fetchMetadataForIds`)
   - Sends new emails to Claude in batches of 25 for extraction (system prompt is cache-marked)
   - Persists structured `LedgerEntry` rows (vendor, category, amount, currency, date)
10. `GET /wrapped/:userId` aggregates all LedgerEntry rows into stats

### Web app flow (`web/`, primary client)
1. **Page load** → `getUserId()` reads/creates a UUID in `localStorage`. If a local cache of the Wrapped data exists, the dashboard renders **instantly** from it; the backend is then refreshed in the background (stale-while-revalidate, see `lib/cache.ts`)
2. `POST /users` checks connection status
3. Not connected → **ConnectView**. "Connect Gmail" does a full-page redirect to `GET /auth/google?userId=<uuid>&redirect=<web origin>`
4. After Google consent, the callback resolves the **canonical user** (by Gmail address) and **redirects back to `<web origin>/?connected=1&uid=<canonicalId>`**
5. The page adopts `uid` into `localStorage` (so this device converges onto the Gmail-keyed identity), cleans the URL, re-fetches status, and renders **WrappedView**
6. "Sync Emails" → `POST /emails/sync`. If the user synced within `SYNC_RATE_LIMIT_HOURS`, the backend returns **429** with a friendly message that the UI surfaces

### Identity model (cross-device)
- A device starts with an anonymous UUID in `localStorage`. On OAuth, the backend (`resolveCanonicalUser` in `auth.ts`) keys identity by the **verified Gmail address**:
  - If a user already owns that email → converge to it (so any device that connects the same Gmail sees the same data, no re-sync, no extra Claude cost)
  - Else the requesting device id claims the email (or a fresh id is minted if that device id is already tied to a different email)
- The callback returns `uid=<canonicalId>`; the web app stores it, so all subsequent calls use the canonical id.
- **No schema change** was needed — `User.email` was already `@unique`. Viewing/aggregation (`/wrapped`, `/export`) never calls Claude; only `/emails/sync` does.

### Rate limiting & progressive backfill
- A sync pulls up to `maxEmails` UNexamined emails (`listNewEmailIds` skips ids in `ProcessedEmail`, pages newest→older), so repeated syncs walk progressively further back through history — a big backfill happens across passes, each bounded to `maxEmails`. Newest-first ordering means new mail that arrived since the last sync is always picked up first; the `after:` window also slides with "now". Emails Claude classifies (record **or** explicit not-relevant) are recorded in `ProcessedEmail`; batch failures are left unrecorded so they retry next sync
- `User.lastSyncedAt` is stamped **only when a sync is `caughtUp`** (stored 0 new, or pulled less than a full batch). So a productive backfill can run back-to-back; the cooldown only applies once caught up
- `/emails/sync` rejects with 429 if cooling down within `SYNC_RATE_LIMIT_HOURS` (env, default 24; set `0` to disable). Bounds cost while letting users complete a backfill
- The floating Sync button surfaces `caughtUp` as "✓ up to date" vs "more to load — keep syncing"

### Currency
- `LedgerEntry` stores the **original** `amount` + `currency` (extractor infers the ISO code from the symbol/locale and never converts). The app reports in **USD**.
- `lib/fx.ts` (`getUsdRates`, `toUsd`) converts to USD at **read time**: live rates from Frankfurter (keyless, ECB), cached 12h in-process, with a static fallback table if the fetch fails. No FX API key needed.
- `computeStats` and `computeMonitor` normalize every amount to USD up front (one `.map` at the top), so all aggregates are single-currency. `/transactions` returns both `amount` (original, in `currency`) and `amountUsd`; the Audit + Wrapped detail views show the native amount with a "≈ $X" USD hint and sort/total by `amountUsd`. (Fixes foreign purchases — e.g. ¥10,000 — being summed as if USD.)

---

## Database Schema

```prisma
model User {
  id           String        @id          // device UUID (anonymous)
  email        String?       @unique      // Gmail address, populated after OAuth
  createdAt    DateTime      @default(now())
  lastSyncedAt DateTime?                  // last successful /emails/sync — drives rate limiting
  oauthToken   OAuthToken?
  ledger       LedgerEntry[]
}

model OAuthToken {
  id           String   @id @default(cuid())
  userId       String   @unique
  accessToken  String
  refreshToken String
  expiresAt    DateTime
  updatedAt    DateTime @updatedAt      // auto-updates on token refresh
}

model LedgerEntry {
  id          String   @id @default(cuid())
  userId      String
  category    String   // order | clothes | shipping | subscription | travel | food | entertainment | charity | marketing | refund | other
                       // (shipping = delivery status update, NOT spend — excluded from vendor/spend totals; refund nets against spend)
  vendor      String
  amount      Float?
  currency    String   @default("USD")
  date        DateTime
  description String
  emailId     String   // Gmail message ID — unique per user for deduplication
  senderEmail String?  // parsed From address — powers the unsubscribe helper
  unsubscribe String?  // List-Unsubscribe link (https preferred, else mailto)
  termMonths  Int?     // months an upfront charge covers (6 = 6-month plan) — amortized to monthly
  eventDate   DateTime? // future date: delivery ETA / departure / check-in / event (powers Upcoming); for marketing = promo expiry
  promoCode   String?  // coupon/promo code (marketing) — surfaced in the Promotions tab
  discount    String?  // short offer text, e.g. "20% off" (marketing)
  categoryLocked Boolean @default(false) // user manually corrected the category (Audit) — never auto-reclassify
  createdAt   DateTime @default(now())
  @@unique([userId, emailId])
}

model AccessRequest {              // invite requests from non-test-users
  id        String   @id @default(cuid())
  email     String   @unique
  note      String?
  createdAt DateTime @default(now())
}

model ProcessedEmail {            // every email EXAMINED by sync (not just stored purchases)
  userId    String                // → dedup source for /emails/sync, so non-relevant mail isn't re-classified
  emailId   String
  createdAt DateTime @default(now())
  @@id([userId, emailId])
}

model Acceptance {                 // vendors/senders the user marked "Accepted" (cross-device)
  id        String   @id @default(cuid())
  userId    String
  vendor    String
  createdAt DateTime @default(now())
  @@unique([userId, vendor])
}

model Budget {                     // monthly spending budget, per category or 'overall' (USD)
  id        String   @id @default(cuid())
  userId    String
  category  String                 // a CATEGORY value, or 'overall'
  amount    Float                  // monthly budget in USD
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([userId, category])
}

model Session {                    // bearer session granted after OAuth — only the token HASH is stored
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique       // sha256(token); raw token lives only in the client + Authorization header
  expiresAt DateTime               // sessions expire (default 90d, SESSION_TTL_DAYS)
  createdAt DateTime @default(now())
}

model LoginCode {                  // single-use, short-lived handoff code (OAuth redirect → /auth/exchange)
  code      String   @id
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

---

## Authentication / authorization
- **Data endpoints require a bearer session token** (`Authorization: Bearer <token>`), enforced by `requireSession` (`lib/session.ts`): `/wrapped`, `/monitor`, `/transactions`, `/export`, `/acceptances`, `/emails/sync`. The **token** (not the userId) is the credential; if a route also carries a userId it must match the session's user.
- A token is minted **only after Gmail OAuth proves ownership**. The callback can't safely put a token in the redirect URL (URLs leak via history/referrer/logs), so it issues a **one-time `LoginCode`**; the frontend trades it via `POST /auth/exchange` for `{userId, token}` and stores the token in `localStorage`.
- Only the **sha256 hash** of a token is stored (`Session.tokenHash`) — a DB leak can't be replayed. Sessions **expire** (`Session.expiresAt`, default 90d); expired tokens are rejected and cleaned up.
- **Gmail OAuth tokens are encrypted at rest** (AES-256-GCM via `lib/crypto.ts`) when `TOKEN_ENCRYPTION_KEY` is set — backward-compatible with existing plaintext rows. `POST /auth/disconnect` revokes the OAuth tokens + all of the user's sessions.
- `POST /users` is the unauthenticated bootstrap: it returns full status **only** when a valid token is presented; otherwise it always answers `connected:false` (a guessed userId alone reveals nothing).
- On a 401 `{reauth:true}` the web client drops the dead token and shows Connect.
- **CORS is locked** to `FRONTEND_URL` (+ localhost), not `*`. The admin list uses an `X-Admin-Key` **header** (not a query param), compared in constant time (`crypto.timingSafeEqual`). Errors log via `lib/log.ts` (error name + truncated message only — never full objects / PII).
- **HTTP hardening** (`index.ts`): `helmet` sets security headers (CSP that allows the self-served HTML pages' inline styles, `frame-ancestors 'none'` anti-clickjacking, `X-Content-Type-Options`, `Referrer-Policy`, HSTS); `app.set('trust proxy', 1)` so `req.ip` is the real client behind Render's proxy (otherwise the per-IP limiters bucket everyone together); `express.json` is capped at 64kb.
- **Rate limiting** (`lib/rateLimit.ts`): in-memory per-key limiter on `/auth/exchange` + `/access/request`; expired buckets are swept so the Map stays bounded.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/users` | Bootstrap/status. With a valid `Authorization: Bearer` token → `{id, email, connected, lastSyncedAt, entryCount, examinedCount, oldestDate, caughtUp}` (`entryCount`=stored records, `examinedCount`=emails evaluated); without one → always `connected:false` (reveals nothing) |
| GET | `/auth/google?userId=&redirect=` | Start OAuth — redirects to Google. `redirect` (optional) is the frontend origin to return to |
| GET | `/auth/google/callback` | OAuth callback — stores Gmail tokens, mints a one-time `LoginCode`, redirects to `<redirect>/?connected=1&code=<code>` (web) or shows a "close tab" page (mobile) |
| POST | `/auth/exchange` | `{code}` → trades the one-time handoff code for `{userId, token}` (the durable session token). Code is single-use + expires in 10 min; rate-limited per IP |
| POST | `/auth/disconnect` | Requires session. Revokes Gmail (deletes OAuth tokens, best-effort Google revoke) + all of the user's sessions. Ledger data is kept |
| POST | `/emails/sync` | `{userId, lookbackDays?, maxEmails?}` → pull the next batch of UNprocessed emails (walks older across passes), extract, persist. Returns `{synced, total, examinedCount, oldestDate, caughtUp}`. Cooldown only once `caughtUp`; 429 if cooling down; 401/403 `{reauth}` on expired token / missing Gmail scope |
| GET | `/wrapped/:userId?year=&from=&to=` | Full Wrapped stats, scoped to all-time (default), a calendar `year`, or a custom `from`/`to` window (inclusive ISO dates; takes precedence over `year`). Returns `availableYears` + `availableMonths` for the scope picker |
| GET | `/export/:userId` | Streams an `.xlsx` workbook (Transactions, Subscriptions, Marketing, Summary sheets) |
| GET | `/monitor/:userId?period=month\|year` | Period-over-period monitoring deck: KPI deltas, 12-month trends, subscription/inbox monitors, auto-flags, plus a plain-language `trend` block (MoM + YoY spend change, independent of the toggle) |
| GET | `/transactions/:userId` | All extracted records (newest first) incl. `emailId` + `categoryLocked`, for the Audit view + Gmail deep links |
| PATCH | `/transactions/:userId/:id` | `{category?, vendor?}` → manually correct a record's category and/or vendor (ownership-scoped). Category is validated against `CATEGORIES` and sets `categoryLocked`; vendor is trimmed + capped at 120 chars |
| POST | `/transactions/:userId/rename-vendor` | `{from, to}` → rename every record with vendor `from` to `to` (ownership-scoped). Powers the Audit "rename all" prompt |
| GET | `/upcoming/:userId` | `{upcoming, renewals}`: future-dated non-promo events (`eventDate` ≥ today: deliveries, flights, check-ins, tickets, trial-end dates) + predicted subscription renewals (next charge per active sub within ~45d, `lib/renewals.ts`). Powers the Upcoming floater |
| GET | `/promotions/:userId` | Active marketing offers (have a promo code, discount, or future expiry; expired ones dropped), soonest-expiry first — powers the Promotions tab |
| GET | `/budgets/:userId` | `{budgets: {category: amount}}` — the user's monthly budgets (per category or `overall`, USD) |
| PUT | `/budgets/:userId` | `{category, amount}` → upsert a monthly budget (amount ≤ 0 removes it; category validated against `CATEGORIES`+`overall`). The Monitor computes this-month progress + over/near-budget flags |
| GET | `/acceptances/:userId` | Vendors the user marked "Accepted" → `{vendors: string[]}` |
| POST | `/acceptances/:userId` | `{vendor, accepted}` → toggle, returns updated `{vendors}` (cross-device) |
| POST | `/access/request` | `{email}` → records an access request, pings owner via `ACCESS_WEBHOOK_URL` |
| GET | `/access/requests` | Owner-only list of access requests — send the `ADMIN_KEY` in an `X-Admin-Key` header |
| GET | `/health` | `{ok: true}` |
| GET | `/privacy` | HTML privacy policy page |

---

## Environment Variables

### Backend (`.env` in `backend/`)
```
DATABASE_URL=postgresql://...        # Neon.tech connection string
GOOGLE_CLIENT_ID=...                 # Google Cloud Console OAuth 2.0 client
GOOGLE_CLIENT_SECRET=...
ANTHROPIC_API_KEY=sk-ant-...
BASE_URL=https://your-render-url     # Used to build the OAuth callback URL
FRONTEND_URL=https://your-vercel-url # Web app origin — callback redirects here AND gates CORS (must EXACTLY match the Vercel origin, no trailing slash)
SYNC_RATE_LIMIT_HOURS=24             # Optional, per-user min hours between /emails/sync (default 24, 0 disables)
SYNC_LOOKBACK_DAYS=1095              # Optional, how far back to scan Gmail (default 1095 = 3 years)
SYNC_MAX_EMAILS=2000                 # Optional, max emails ingested per sync (default 2000)
ACCESS_WEBHOOK_URL=https://...       # Optional, Discord/Slack incoming webhook — pinged on new access requests
ADMIN_KEY=...                        # Optional, protects GET /access/requests (owner-only list)
AUTH_ENFORCED=true                   # Optional kill-switch (default true). Set false/0 to disable session enforcement and fall back to legacy userId-based access WITHOUT a code rollback — emergency use only
TOKEN_ENCRYPTION_KEY=...             # Optional but recommended. Any strong secret — enables AES-256-GCM encryption of stored Gmail OAuth tokens at rest. If unset, tokens are stored plaintext (Neon still encrypts at rest). Backward-compatible: existing rows re-encrypt on next refresh/reconnect. Do NOT remove it once set (you'd be unable to decrypt stored tokens)
SESSION_TTL_DAYS=90                  # Optional, how long a bearer session stays valid (default 90)
PORT=3000                            # Optional, defaults to 3000
```

### Web (`web/.env.local`, and Vercel project env)
```
NEXT_PUBLIC_API_URL=https://do-i-want-to-know.onrender.com   # Render backend URL
```

### App (`app/app.json` → `extra.apiUrl`) — legacy Expo mobile client
Change `"apiUrl": "http://localhost:3000"` to your Render URL after deploying.
The **web app (`web/`) is now the primary client**; the Expo app is kept but optional.
The app authenticates with the same session model as the web client: OAuth opens
via `WebBrowser.openAuthSessionAsync` with the app's deep link (`diwtkn://auth`,
or `exp://…/--/auth` under Expo Go) as the return URL; the backend redirects the
one-time code there, and the app trades it via `POST /auth/exchange` for a token
stored in `expo-secure-store`. An axios interceptor attaches it as
`Authorization: Bearer`. `safeRedirect` allowlists the `diwtkn://`/`exp://`
schemes for this. Run `npx expo install expo-linking` if not already present.

---

## Running Locally

```bash
# Backend
cd backend
npm install --ignore-scripts
# create backend/.env with vars above, set BASE_URL=http://<your-local-ip>:3000
npm run dev

# App (separate terminal)
cd app
npm install --ignore-scripts
# Update app.json extra.apiUrl to http://<your-local-ip>:3000
npm start
# Scan QR with Expo Go on your phone (same Wi-Fi network)
```

---

## Deployment

- **Database**: Neon.tech (free PostgreSQL) — create a project, copy the connection string
- **Backend**: Render.com free web service — connects to this GitHub repo, uses `render.yaml`
  - Set env vars in Render dashboard: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `BASE_URL` (your Render URL)
  - `start:prod` script runs `prisma migrate deploy` before starting the server
- **Google OAuth**: In Google Cloud Console, add `https://<render-url>/auth/google/callback` to authorized redirect URIs

---

## Current Status (as of June 2026)

**Live and feature-rich. The web app (`web/`, Vercel) is the primary client; the Render backend + Neon DB are deployed. Google OAuth is in Testing mode, so access is invite-only via test users.**

### Outstanding (to fully button up)
- **Deploy the latest commit on Render** — `start:prod` runs `prisma migrate deploy` first, so pending migrations auto-apply. Vercel auto-deploys the frontend on push.
- **Set an Anthropic spend cap** in the Anthropic Console — the one backstop against API cost (keep auto-reload OFF so overuse fails rather than charging).
- `TOKEN_ENCRYPTION_KEY` + `FRONTEND_URL` are set on Render. Do NOT rotate `TOKEN_ENCRYPTION_KEY` once tokens are encrypted (you'd be unable to decrypt them).

### Deployed infra
- **Render** — Express backend (free tier, root `backend/`). `build` runs `prisma generate && tsc`; `start:prod` runs migrations then the server.
- **Vercel** — Next.js web app (`web/`); `NEXT_PUBLIC_API_URL` points at the Render URL.
- **Neon** — PostgreSQL; migrations auto-apply on deploy.
- **Google Cloud** — Gmail API + OAuth client (External, **Testing** → test users only, ≤100; sensitive-scope refresh tokens expire ~7 days, so test users reconnect ~weekly). Redirect URI is `<render-url>/auth/google/callback`. Client ID / test-user emails live in the Google console + Render env, not here.

### Features built (high level)
- **Wrapped**: scope picker (total / year / month / custom window), expandable rows → transaction detail, spend-over-time chart, USD-normalized multi-currency, **Wrapped Moments** (fun facts), Excel export.
- **Monitor**: MoM/YoY trend narrative, KPI deltas, 12-mo analytics chart, subscription monitor + **renewal predictions**, top-senders drilldown, **budgets & alerts**, **unusual-charge alerts**, auto-flag strip.
- **Audit**: inline category + vendor edit (+ "rename all"), Gmail deep links.
- **Promotions** tab, **Unsubscribe** tab, **Upcoming floater** (deliveries/flights/renewals/trial-ends).
- **Demo mode** (`web/app/lib/demo.ts`): "Try the demo" on ConnectView flips the API client into fixture mode (`setDemoMode` in `api.ts` — every getter returns client-computed sample data, every mutation is a no-op; no backend, no auth, no Claude). A deterministic generator (~380 fictional ledger entries anchored relative to "now") feeds **client-side ports of the backend `computeStats`/monitor aggregation**, so all six surfaces render coherent, self-consistent numbers. `DemoBanner` (sample-data notice + Connect + access-request) sits above the tabs; sync FAB + Export/Disconnect are hidden. The view components are untouched. The growth unlock while OAuth is invite-only, and the screenshot/marketing surface.
- **Share card** (`web/app/components/ShareCard.tsx`): "📸 Share" in WrappedView renders a 1080×1920 PNG year-in-review on a canvas from the on-screen `/wrapped` data (total, top vendor, subscriptions, biggest purchase, one Wrapped Moment, guess-vs-actual). Vendor names are off by default (privacy toggle); numbers always shown. Client-side, works in demo mode.
- **Guess before you look** (`web/app/components/GuessReveal.tsx` + `lib/guess.ts`): before revealing the yearly total, prompts "how much do you *think* you spent?" → drumroll → reveal with delta ("you were $X optimistic 😬"). Guess is remembered per scope (localStorage, keyed by userId+scope) so revisits skip it; the delta feeds the share card.
- **Auth/security**: bearer sessions (sha256-hashed, 90d expiry), one-time OAuth handoff code, Gmail tokens encrypted at rest, locked CORS, helmet security headers + `trust proxy`, proxy-aware rate-limited `/auth/exchange` + `/access/request`, constant-time admin-key check, PII-safe logging, `AUTH_ENFORCED` kill-switch, formula-injection-safe export.
- **PWA**: installable (manifest + icons + service worker).

### Decisions made
- **Hosting: Render, not Vercel functions** — `/emails/sync` runs 30–120s; needs a persistent server (functions time out).
- **Model `claude-haiku-4-5`** for extraction — cheap + sufficient for structured JSON.
- **Currency**: store original `amount`+`currency`; normalize to USD at read time (`lib/fx.ts`).
- **Edits are user-authoritative**: a manual category/vendor change updates existing rows immediately (`categoryLocked`), but NEW extraction rules only affect newly-synced mail (sync dedups via `ProcessedEmail`, skipping already-examined email).

### Known caveats
- New extraction rules (categories, `eventDate`, promo codes, trials) apply to **newly-synced mail only** — existing rows need a re-sync or a manual edit.
- Renewal dates are **predictions**; unusual-charge alerts need ≥3 prior charges per vendor to learn a norm.

### Future ideas
- **Downloadable share card** (1080×1920 year-in-review image) — the main word-of-mouth play.
- **OAuth verification** (incl. CASA security assessment for the restricted `gmail.readonly` scope) to open up beyond test users.

---

## Project History

This project went through several pivots in a series of Claude Code sessions:

1. **Original concept**: "Do I Want To Know" — plug into apps (Spotify, GitHub, etc.) to track personal stats
2. **GitHub connector**: Built OAuth + data fetching for GitHub activity
3. **Gmail connector**: Pivoted to Gmail as the universal data source; designed structured extraction pipeline
4. **Survey platform pivot**: The project was temporarily rebuilt as a TikTok-style poll app (that version was saved as a separate repo: **SurveyTok**)
5. **Gmail Wrapped (current)**: Reverted back to the original Gmail concept, implemented with Google OAuth + Claude extraction

## Git

- Remote: `https://github.com/kevinli-builds/Do-I-Want-to-Know` (the repo moved to the
  `kevinli-builds` account; the local git *user* is still `snowwarrior1-alt`)
- Branch: `main`
- Git user: `snowwarrior1-alt` / `snowwarrior1-alt@users.noreply.github.com`

## Important Notes

- `.env` is gitignored — never commit credentials
- Use `npm.cmd` instead of `npm` in PowerShell to avoid `.ps1` execution policy errors
- Use `npm install --ignore-scripts` to avoid native build failures in Expo
- The `prisma` package must be in `dependencies` (not devDependencies) because `start:prod` calls it at runtime
- `backend` build script runs `prisma generate` before `tsc`, so a fresh deploy never compiles against a stale client (this caused a `Property 'budget' does not exist` failure once)
- Migrations are additive and live in `backend/prisma/migrations/` (see the tree above) — they auto-apply via `prisma migrate deploy` on deploy
