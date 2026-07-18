# Privacy Policy

**Do I Want To Know**
Last updated: July 18, 2026

---

## What this app is

Do I Want To Know connects to your Gmail account — with your permission — reads
the *metadata* of purchase-related emails (subject, sender, date, and Google's
short snippet preview), and turns it into a personal "Wrapped"-style summary of
your spending and subscriptions: totals, top vendors, subscription health,
renewal predictions, and an auditable list of every record with a link back to
the source email.

This policy explains exactly what we access, what we store, who processes it,
and how you delete it.

---

## Google account access (the scopes we request, and why)

When you connect Gmail, the Google consent screen asks you to grant this app:

- **`gmail.readonly`** — read-only access to your Gmail. We use it solely to
  list purchase-related emails (orders, subscriptions, travel, food, charity)
  and fetch their **metadata only**: subject line, sender, date, and Google's
  snippet preview. We request messages in Gmail's metadata format — the app
  never downloads full message bodies or attachments. Read-only means the app
  **cannot send, modify, delete, or label** any email.
- **`userinfo.email`** — your Gmail address, used only to identify your
  account so that connecting from another device shows the same data.

### Limited Use disclosure

Do I Want To Know's use and transfer of information received from Google APIs
adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including the Limited Use requirements. In particular: Google user data is used
only to provide the user-facing features described here, is never sold, is
never used for advertising, and is never used to train or improve generalized
artificial-intelligence or machine-learning models.

---

## What we collect and store

- **A random device ID** — a UUID generated on your device and kept in your
  browser's local storage. It contains no personal information.
- **Your Gmail address** — stored after you connect, as your account identity.
- **Email metadata** — sender, subject, date, and snippet of purchase-related
  emails, held transiently while extraction runs.
- **Extracted purchase records** — structured rows parsed from that metadata:
  vendor, category, amount and currency, date, a short description, and where
  present a delivery/renewal date, promo code, or unsubscribe link. Each row
  keeps its Gmail message ID so you can audit it against the source email.
- **Processed-message IDs** — the Gmail message IDs of emails already
  examined (including ones classified as not relevant), stored so repeat syncs
  never re-read or re-process the same mail.
- **Settings you create in the app** — monthly budgets, "accepted" vendor
  marks, manual category/vendor corrections.
- **Session tokens** — stored only as SHA-256 hashes; sessions expire after
  90 days.
- **Encrypted Gmail OAuth tokens** — encrypted at rest with AES-256-GCM.
- If you request access while the app is invite-only: the email address you
  submit on the request form.

## What we do NOT collect

- Full email bodies or attachments — the app requests metadata format only
- Personal or non-commercial emails (we only query purchase-related mail)
- Your contacts, calendar, files, location, or anything beyond Gmail metadata
- Analytics, advertising, or tracking identifiers — there are none in the app

---

## AI processing (Anthropic Claude)

To turn email metadata into structured purchase records, the app sends the
metadata described above (subject, sender, date, snippet) to **Anthropic's
Claude API**, which returns the structured record. Anthropic processes this
data as a service provider and, per Anthropic's commercial API terms, does
**not** use it to train its models. No Google user data is used by us or by
our service providers to train or improve AI/ML models.

---

## How we use your data

Everything we store exists to render *your* dashboard: Wrapped stats, the
spending monitor, budgets, renewal predictions, promotions, and the audit
list. Your numbers are only ever compared with your own history — never with
other users'. We do not sell, rent, share, or monetize your data, and we show
no advertising.

---

## Where your data lives, and how it's protected

- **Storage:** a PostgreSQL database hosted by Neon (encrypted at rest).
- **In transit:** TLS everywhere (browser ↔ backend ↔ Google/Anthropic).
- **Gmail OAuth tokens:** encrypted at rest with AES-256-GCM.
- **Sessions:** bearer tokens stored server-side only as SHA-256 hashes, with
  expiry; data endpoints verify ownership on every request.

### Service providers (subprocessors)

| Provider | Role | Sees |
|---|---|---|
| Google (Gmail API) | source of email metadata | your Gmail account, per the scopes above |
| Anthropic (Claude API) | extraction of purchase records | email metadata during processing; no training |
| Neon | database hosting | stored records, encrypted at rest |
| Render | backend hosting | data in transit through our server |
| Vercel | frontend hosting | serves the web app; no ledger data |
| Frankfurter (ECB rates) | currency conversion | nothing — we fetch exchange rates only; no personal data is sent |

---

## Data retention and deletion

- Extracted records are retained for as long as your account exists so your
  dashboard keeps working between syncs.
- **Disconnect** (in the app) revokes the app's Gmail access and deletes your
  OAuth tokens and sessions immediately. Your extracted records are kept so
  the dashboard still works if you return — delete them separately if you
  want them gone.
- **Delete everything yourself, instantly:** the "Delete my data" button in
  the app permanently erases every extracted record, processed-message ID,
  budget, setting, session, and stored Gmail token from our servers, and
  revokes the app's Gmail access. This is immediate and irreversible — no
  email or waiting period required.
- You can also contact us at the address below and we will delete all data
  associated with your account within 30 days.

---

## Demo mode

"Try the demo" runs entirely in your browser on fictional sample data. No
account is created, nothing is sent to our servers, and no Google access is
requested.

---

## Children

This app is not directed at children under 13. We do not knowingly collect
data from children under 13. If you believe a child has used the app and you
would like their data removed, contact us.

---

## Changes to this policy

If we make material changes to this policy, we will update the "Last updated"
date at the top and, where appropriate, notify users through the app.

---

## Contact

Questions about this privacy policy, or a deletion request? Contact:

**snowwarrior1+diwtk@gmail.com**

---

*This privacy policy applies to the Do I Want To Know web app (and the
optional mobile client, which uses the same backend and data model).*
