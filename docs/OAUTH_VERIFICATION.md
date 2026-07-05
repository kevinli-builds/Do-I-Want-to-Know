# OAuth Verification Pack — moving DIWTK from Testing to Production

_Drafted 2026-07-04 (Fable). Goal: lift the 100-test-user cap by passing
Google's restricted-scope verification for `gmail.readonly`. Process details
drift — re-verify each requirement against Google's current docs at
submission time. This doc is the map, not the territory._

## The three review layers

1. **Brand verification** — proves the OAuth consent screen (name, logo,
   links) belongs to a domain you own.
2. **Sensitive/restricted scope review** — human reviewers check that the
   app's use of `gmail.readonly` is necessary, user-facing, and matches the
   privacy policy + Limited Use policy.
3. **CASA (Cloud App Security Assessment), Tier 2** — a security assessment
   required for restricted Gmail scopes, via a Google-authorized lab
   (self-scan options exist at low/no cost). Recertifies **annually**.

## Hard blockers to clear BEFORE submitting (gap analysis)

### 1. You need a domain you own ⛔ (the big one)
Verification requires the homepage, privacy policy, and OAuth redirect URIs
to live on a domain verified in Google Search Console. **`*.vercel.app` and
`*.onrender.com` cannot be verified as yours.**
- Buy a domain (~$10–15/yr, e.g. `doiwanttoknow.app`).
- Point it at Vercel (frontend, e.g. apex or `www`) and Render (backend,
  e.g. `api.` subdomain — Render supports custom domains on free tier).
- Update `FRONTEND_URL`, `BASE_URL` env vars; add the new callback
  `https://api.<domain>/auth/google/callback` to the Google console;
  keep the old URIs during cutover, remove after.
- Verify the domain in Search Console with the same Google account that
  owns the Cloud project.

### 2. Privacy policy upgrades (currently `/privacy` + PRIVACY_POLICY.md)
Must be hosted on the verified domain and must explicitly:
- Name the exact scopes requested and why (`gmail.readonly` → read
  metadata of purchase-related emails; `userinfo.email` → account identity).
- State what is stored (structured purchase records + email metadata IDs;
  never full bodies), where (Neon Postgres), and encryption posture
  (OAuth tokens AES-256-GCM at rest; TLS in transit).
- Include the **Limited Use disclosure** verbatim-adjacent: the app's use
  of information received from Google APIs adheres to the Google API
  Services User Data Policy, including the Limited Use requirements.
- Describe retention + deletion (see blocker 3) and a contact address.

### 3. A real data-deletion path ⛔ (build item — hand to an Opus session)
Disconnect currently revokes tokens but **keeps** ledger data. Reviewers and
the questionnaire expect user-initiated deletion.
**Spec:** `DELETE /users/me` (session-authed): delete LedgerEntry,
ProcessedEmail, Acceptance, Budget, Sessions, OAuthToken (with best-effort
Google revoke), then the User row. UI: "Delete my data" in the web app next
to Disconnect, double-confirm, then local cache/token wipe. Update the
privacy policy to reference it. ~Half-day of work; do it before submission.

### 4. Homepage requirements
The landing page (ConnectView) must: describe what the app does with Gmail
data (it does), link the privacy policy visibly (verify), and be reachable
without login (it is). Add a footer link to the privacy policy if missing.

### 5. Consent-screen assets
App name (final), logo (120×120), support email, authorized domain = the
new domain, links to homepage + privacy policy. Any change re-triggers brand
review — finalize before scope review.

## The demo video (required for scope review)

Screen recording, unlisted YouTube link, showing — in this order:
1. The OAuth consent screen **in English**, showing the app name and the
   `gmail.readonly` scope being granted (start from "Connect Gmail").
2. Where the granted data surfaces: run a sync, open Wrapped/Monitor/Audit —
   narrate that only metadata (subject/sender/date/snippet) is processed
   into purchase records.
3. The disconnect + delete-my-data flow (after blocker 3 ships).
Keep it under ~3 minutes; the demo must match the production domain.

## CASA Tier 2 crib sheet (how our architecture answers)

- **Encryption in transit:** TLS everywhere (Vercel/Render terminate HTTPS).
- **Encryption at rest:** Gmail OAuth tokens AES-256-GCM
  (`TOKEN_ENCRYPTION_KEY`); Neon encrypts storage; session tokens stored
  as SHA-256 hashes only.
- **AuthN/AuthZ:** bearer sessions minted only after OAuth proof; ownership
  checks on every data route; admin endpoint constant-time key compare.
- **Least data:** metadata-only Gmail fetch (`format=metadata`), no bodies;
  PII-safe logging (`lib/log.ts`).
- **Abuse controls:** per-IP rate limits on auth endpoints; sync cooldowns;
  helmet headers; locked CORS.
- **SDLC:** single maintainer; dependencies via npm audit (run + snapshot
  before the assessment); no secrets in repo.
- **Incident response / data deletion:** name yourself + the deletion
  endpoint (blocker 3).
Expect the assessment to also want: a dependency scan report and a dynamic
scan of the API — the authorized-lab tooling walks you through both.

## Order of operations

1. Buy + wire the domain; re-point env vars, callback URIs; verify in
   Search Console. Re-test OAuth end-to-end on the new domain.
2. Ship the deletion endpoint + UI (blocker 3). Update privacy policy
   (blocker 2) and homepage footer link.
3. Finalize consent-screen branding; submit brand verification.
4. Record the demo video on the production domain.
5. Submit the restricted-scope questionnaire + video; run CASA Tier 2 with
   an authorized lab when Google's email directs you.
6. Expect weeks-to-months and at least one back-and-forth; answer from this
   doc. Diarize the **annual** CASA recert.

## While waiting (unchanged advice)
Demo mode remains the public front door; test users keep ~weekly reconnects
(refresh tokens expire in Testing). Both pains disappear the day this lands.
