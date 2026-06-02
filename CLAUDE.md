# Do I Want To Know — Claude Context

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
│       └── 20260602000000_session_expiry/   Adds Session.expiresAt (sessions expire, default 90d)
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
   - Drops already-processed emailIds **before** fetching metadata (so repeat syncs only pull new mail)
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
- A sync pulls up to `maxEmails` UNprocessed emails (`listNewEmailIds` skips already-stored ids, pages newest→older), so repeated syncs walk progressively further back through history — a big backfill happens across passes, each bounded to `maxEmails`
- `User.lastSyncedAt` is stamped **only when a sync is `caughtUp`** (stored 0 new, or pulled less than a full batch). So a productive backfill can run back-to-back; the cooldown only applies once caught up
- `/emails/sync` rejects with 429 if cooling down within `SYNC_RATE_LIMIT_HOURS` (env, default 24; set `0` to disable). Bounds cost while letting users complete a backfill
- The floating Sync button surfaces `caughtUp` as "✓ up to date" vs "more to load — keep syncing"

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
  category    String   // order | subscription | travel | food | entertainment | charity | marketing | refund | other (refund = money back, nets against spend)
  vendor      String
  amount      Float?
  currency    String   @default("USD")
  date        DateTime
  description String
  emailId     String   // Gmail message ID — unique per user for deduplication
  senderEmail String?  // parsed From address — powers the unsubscribe helper
  unsubscribe String?  // List-Unsubscribe link (https preferred, else mailto)
  termMonths  Int?     // months an upfront charge covers (6 = 6-month plan) — amortized to monthly
  createdAt   DateTime @default(now())
  @@unique([userId, emailId])
}

model AccessRequest {              // invite requests from non-test-users
  id        String   @id @default(cuid())
  email     String   @unique
  note      String?
  createdAt DateTime @default(now())
}

model Acceptance {                 // vendors/senders the user marked "Accepted" (cross-device)
  id        String   @id @default(cuid())
  userId    String
  vendor    String
  createdAt DateTime @default(now())
  @@unique([userId, vendor])
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
- **CORS is locked** to `FRONTEND_URL` (+ localhost), not `*`. The admin list uses an `X-Admin-Key` **header** (not a query param). Errors log via `lib/log.ts` (error name + truncated message only — never full objects / PII).

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/users` | Bootstrap/status. With a valid `Authorization: Bearer` token → `{id, email, connected, lastSyncedAt, entryCount, oldestDate, caughtUp}`; without one → always `connected:false` (reveals nothing) |
| GET | `/auth/google?userId=&redirect=` | Start OAuth — redirects to Google. `redirect` (optional) is the frontend origin to return to |
| GET | `/auth/google/callback` | OAuth callback — stores Gmail tokens, mints a one-time `LoginCode`, redirects to `<redirect>/?connected=1&code=<code>` (web) or shows a "close tab" page (mobile) |
| POST | `/auth/exchange` | `{code}` → trades the one-time handoff code for `{userId, token}` (the durable session token). Code is single-use + expires in 10 min; rate-limited per IP |
| POST | `/auth/disconnect` | Requires session. Revokes Gmail (deletes OAuth tokens, best-effort Google revoke) + all of the user's sessions. Ledger data is kept |
| POST | `/emails/sync` | `{userId, lookbackDays?, maxEmails?}` → pull the next batch of UNprocessed emails (walks older across passes), extract, persist. Returns `{synced, total, oldestDate, caughtUp}`. Cooldown only once `caughtUp`; 429 if cooling down; 401/403 `{reauth}` on expired token / missing Gmail scope |
| GET | `/wrapped/:userId?year=` | Returns full Wrapped stats object (optionally scoped to a year) |
| GET | `/export/:userId` | Streams an `.xlsx` workbook (Transactions, Subscriptions, Marketing, Summary sheets) |
| GET | `/monitor/:userId?period=month\|year` | Period-over-period monitoring deck: KPI deltas, trends, subscription/inbox monitors, auto-flags |
| GET | `/transactions/:userId` | All extracted records (newest first) incl. `emailId`, for the Audit view + Gmail deep links |
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

## Current Status (as of May 2026)

**All code is written and TypeScript compiles clean. The app has never been run end-to-end — it is ready to deploy but no infrastructure has been set up yet.**

### ✅ Done
- Full backend: OAuth flow, Gmail fetching, Claude extraction, LedgerEntry storage, Wrapped stats aggregation
- Full app: ConnectScreen, WrappedScreen, device UUID persistence
- PostgreSQL schema + migrations
- Render deployment config (`render.yaml`)
- Switched extraction model from `claude-opus-4-5` → `claude-haiku-4-5` (~20× cheaper, sufficient for the task)

### ✅ Deployed! (May 29, 2026)

**Live URL: `https://do-i-want-to-know.onrender.com`**

- ✅ Google Cloud Console — Gmail API enabled, OAuth consent screen configured (External, test user: snowwarrior1@gmail.com), OAuth 2.0 Web Application client created
  - GOOGLE_CLIENT_ID: `341789352511-39o1dfeb97j6cog9q0m860oonqu6avld.apps.googleusercontent.com`
- ✅ Neon.tech — project "do-i-want-to-know" created, both migrations applied on first deploy
- ✅ Render.com — service "Do-I-Want-to-Know" live (Free tier, Node, root: `backend/`)
  - All 5 env vars set: DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ANTHROPIC_API_KEY, BASE_URL
- ✅ App — `app/app.json` `extra.apiUrl` updated to `https://do-i-want-to-know.onrender.com`

### ⚠️ One manual step remaining
Add the Render redirect URI to Google OAuth credentials:
1. Go to https://console.cloud.google.com/auth/clients?project=do-i-want-to-know
2. Click the "Do I Want To Know" client
3. Under "Authorized redirect URIs", click "+ Add URI"
4. Add: `https://do-i-want-to-know.onrender.com/auth/google/callback`
5. Save

### 🔜 Next steps
- Complete the manual OAuth redirect URI step above
- Test full OAuth + sync + Wrapped flow on a real device via Expo Go

### 📝 Decisions made
- **Hosting: Render, not Vercel** — Vercel serverless functions time out at 10s (free) / 60s (Pro), which is too short for `/emails/sync` (fetches 200 emails + 8 batched Claude calls = 30–120s). Render runs a persistent Express server with no timeout limit. Downside: ~30s cold start after inactivity, acceptable for a personal tool.
- **Model: `claude-haiku-4-5`** — switched from `claude-opus-4-5`; ~20× cheaper and sufficient for structured JSON extraction from email metadata.

### 💡 Future ideas (post-launch)
- Add a "Disconnect Gmail" button
- Improve Wrapped UI with charts / animations
- Add year filter to see stats for a specific year
- Surface more insights (e.g. "you spend most on Tuesdays", subscription cost per month)

---

## Project History

This project went through several pivots in a series of Claude Code sessions:

1. **Original concept**: "Do I Want To Know" — plug into apps (Spotify, GitHub, etc.) to track personal stats
2. **GitHub connector**: Built OAuth + data fetching for GitHub activity
3. **Gmail connector**: Pivoted to Gmail as the universal data source; designed structured extraction pipeline
4. **Survey platform pivot**: The project was temporarily rebuilt as a TikTok-style poll app (that version was saved as a separate repo: **SurveyTok**)
5. **Gmail Wrapped (current)**: Reverted back to the original Gmail concept, implemented with Google OAuth + Claude extraction

## Git

- Remote: `https://github.com/snowwarrior1-alt/Do-I-Want-to-Know`
- Branch: `main`
- Git user: `snowwarrior1-alt` / `snowwarrior1-alt@users.noreply.github.com`

## Important Notes

- `.env` is gitignored — never commit credentials
- Use `npm.cmd` instead of `npm` in PowerShell to avoid `.ps1` execution policy errors
- Use `npm install --ignore-scripts` to avoid native build failures in Expo
- The `prisma` package must be in `dependencies` (not devDependencies) because `start:prod` calls it at runtime
- The two migrations are additive — the second one drops the old survey tables and adds Gmail/OAuth/ledger tables
