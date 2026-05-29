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
│   │       └── 20260527000000_gmail_wrapped/  Drops survey tables, adds email/OAuth/ledger
│   └── package.json            Deps: @anthropic-ai/sdk, googleapis, @prisma/client, express, cors, dotenv
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
   - Fetches up to 200 email metadata entries from past year (order/receipt/subscription subjects)
   - Filters out already-processed emailIds (deduplication via `LedgerEntry.emailId`)
   - Sends new emails to Claude in batches of 25 for extraction
   - Persists structured `LedgerEntry` rows (vendor, category, amount, currency, date)
10. `GET /wrapped/:userId` aggregates all LedgerEntry rows into stats

---

## Database Schema

```prisma
model User {
  id         String        @id          // device UUID (anonymous)
  email      String?       @unique      // Gmail address, populated after OAuth
  createdAt  DateTime      @default(now())
  oauthToken OAuthToken?
  ledger     LedgerEntry[]
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
  category    String   // order | subscription | travel | food | entertainment | other
  vendor      String
  amount      Float?
  currency    String   @default("USD")
  date        DateTime
  description String
  emailId     String   // Gmail message ID — unique per user for deduplication
  createdAt   DateTime @default(now())
  @@unique([userId, emailId])
}
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/users` | Upsert user by device UUID, returns `{id, email, connected}` |
| GET | `/auth/google?userId=` | Start OAuth — redirects to Google |
| GET | `/auth/google/callback` | OAuth callback — stores tokens, shows success page |
| POST | `/emails/sync` | `{userId}` → fetch+extract new emails, returns `{synced, total}` |
| GET | `/wrapped/:userId` | Returns full Wrapped stats object |
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
PORT=3000                            # Optional, defaults to 3000
```

### App (`app/app.json` → `extra.apiUrl`)
Change `"apiUrl": "http://localhost:3000"` to your Render URL after deploying.

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

### 🔜 Next session — Deployment (in order)
1. **Google Cloud Console** — create a project, enable Gmail API, create OAuth 2.0 credentials, add the Render callback URL
2. **Neon.tech** — create a free PostgreSQL project, copy the connection string
3. **Render.com** — create a new web service pointing at this repo, set all 5 env vars (`DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `BASE_URL`)
4. **App** — update `app/app.json` `extra.apiUrl` to the live Render URL
5. **Test** — full OAuth + sync + Wrapped flow on a real device

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
