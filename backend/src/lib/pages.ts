// Static HTML pages served by the backend (OAuth result screens + privacy
// policy). Extracted out of the route handlers so the routing logic stays
// readable and the markup lives in one place.
//
// Values interpolated into these templates are always either app-controlled
// copy or URLs that have passed `safeRedirect` / `encodeURIComponent` at the
// call site — never raw user input.

const SHELL_CSS = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f7f7ff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{text-align:center;padding:48px 32px;max-width:440px}
.icon{font-size:60px;line-height:1}
h1{color:#1a1a2e;margin:16px 0 8px;font-size:24px}
p{color:#666;font-size:16px;line-height:1.55}
a.btn{display:inline-block;margin-top:18px;background:#6c63ff;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700}`

function shell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>${SHELL_CSS}</style></head>
<body><div class="card">${body}</div></body></html>`
}

// Shown when the user unchecked the Gmail read permission on Google's consent
// screen. `back` is a pre-validated (safeRedirect) URL or null.
export function scopeNeededPage(back: string | null): string {
  return shell('Gmail access needed', `<div class="icon">📭</div>
<h1>One more permission needed</h1>
<p>To build your inbox insights, the app needs permission to <strong>read your Gmail</strong>. On the Google screen, please keep the <em>"Read your email messages and settings"</em> box checked.</p>
${back ? `<a class="btn" href="${back}">Try connecting again</a>` : ''}`)
}

// Fallback success page for clients with no frontend redirect (e.g. mobile).
export function connectedPage(): string {
  return shell('Connected!', `<div class="icon">✓</div>
<h1>Gmail Connected!</h1>
<p>You can close this tab and return to the app.</p>`)
}

// OAuth failure page. `linkHref` is either an app-built relative path or a
// pre-validated redirect URL.
export function connectionFailedPage(opts: {
  icon: string
  heading: string
  body: string
  linkHref: string
  linkText: string
}): string {
  return shell('Connection failed', `<div class="icon">${opts.icon}</div>
<h1>${opts.heading}</h1>
<p>${opts.body}</p>
<a class="btn" href="${opts.linkHref}">${opts.linkText}</a>`)
}

const PRIVACY_CONTACT = 'snowwarrior1+diwtk@gmail.com'

export function privacyPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy — Do I Want To Know</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; background: #fafafa; padding: 0 16px 60px; }
    .wrap { max-width: 680px; margin: 0 auto; }
    h1 { font-size: 28px; font-weight: 800; margin: 48px 0 4px; }
    .meta { color: #888; font-size: 14px; margin-bottom: 40px; }
    h2 { font-size: 17px; font-weight: 700; margin: 36px 0 10px; }
    h3 { font-size: 15px; font-weight: 700; margin: 20px 0 8px; }
    p, li, td, th { font-size: 15px; line-height: 1.7; color: #444; }
    ul { padding-left: 20px; margin-top: 8px; }
    li { margin-bottom: 4px; }
    hr { border: none; border-top: 1px solid #e8e8e8; margin: 32px 0; }
    a { color: #6C63FF; }
    table { border-collapse: collapse; margin-top: 10px; width: 100%; }
    th, td { text-align: left; padding: 6px 10px 6px 0; border-bottom: 1px solid #eee; vertical-align: top; }
    th { font-weight: 700; color: #1a1a2e; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Privacy Policy</h1>
    <p class="meta">Do I Want To Know &nbsp;·&nbsp; Last updated: July 18, 2026</p>

    <h2>What this app is</h2>
    <p>Do I Want To Know connects to your Gmail account — with your permission — reads the <em>metadata</em> of purchase-related emails (subject, sender, date, and Google's short snippet preview), and turns it into a personal "Wrapped"-style summary of your spending and subscriptions. This policy explains exactly what we access, what we store, who processes it, and how you delete it.</p>

    <hr />

    <h2>Google account access (the scopes we request, and why)</h2>
    <ul>
      <li><strong>gmail.readonly</strong> — read-only access to your Gmail, used solely to list purchase-related emails (orders, subscriptions, travel, food, charity) and fetch their <strong>metadata only</strong>: subject, sender, date, and Google's snippet preview. We request messages in Gmail's metadata format — the app never downloads full message bodies or attachments. Read-only means the app <strong>cannot send, modify, delete, or label</strong> any email.</li>
      <li><strong>userinfo.email</strong> — your Gmail address, used only to identify your account so that connecting from another device shows the same data.</li>
    </ul>

    <h3>Limited Use disclosure</h3>
    <p>Do I Want To Know's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements. Google user data is used only to provide the user-facing features described here, is never sold, is never used for advertising, and is never used to train or improve generalized AI/ML models.</p>

    <hr />

    <h2>What we collect and store</h2>
    <ul>
      <li><strong>A random device ID</strong> — a UUID generated on your device and kept in your browser's local storage. No personal information.</li>
      <li><strong>Your Gmail address</strong> — stored after you connect, as your account identity.</li>
      <li><strong>Email metadata</strong> — sender, subject, date, and snippet of purchase-related emails, held transiently while extraction runs.</li>
      <li><strong>Extracted purchase records</strong> — vendor, category, amount and currency, date, a short description, and where present a delivery/renewal date, promo code, or unsubscribe link. Each row keeps its Gmail message ID so you can audit it against the source email.</li>
      <li><strong>Processed-message IDs</strong> — Gmail message IDs of emails already examined, so repeat syncs never re-read the same mail.</li>
      <li><strong>Settings you create</strong> — budgets, "accepted" vendor marks, manual corrections.</li>
      <li><strong>Session tokens</strong> — stored only as SHA-256 hashes; sessions expire after 90 days.</li>
      <li><strong>Encrypted Gmail OAuth tokens</strong> — encrypted at rest with AES-256-GCM.</li>
      <li>If you request access while the app is invite-only: the email address you submit on the request form.</li>
    </ul>

    <h2>What we do NOT collect</h2>
    <ul>
      <li>Full email bodies or attachments — the app requests metadata format only</li>
      <li>Personal or non-commercial emails (we only query purchase-related mail)</li>
      <li>Your contacts, calendar, files, location, or anything beyond Gmail metadata</li>
      <li>Analytics, advertising, or tracking identifiers — there are none in the app</li>
    </ul>

    <hr />

    <h2>AI processing (Anthropic Claude)</h2>
    <p>To turn email metadata into structured purchase records, the app sends the metadata described above to <strong>Anthropic's Claude API</strong>, which returns the structured record. Anthropic processes this data as a service provider and, per Anthropic's commercial API terms, does <strong>not</strong> use it to train its models. No Google user data is used by us or by our service providers to train or improve AI/ML models.</p>

    <hr />

    <h2>How we use your data</h2>
    <p>Everything we store exists to render <em>your</em> dashboard. Your numbers are only ever compared with your own history — never with other users'. We do not sell, rent, share, or monetize your data, and we show no advertising.</p>

    <hr />

    <h2>Where your data lives, and how it's protected</h2>
    <ul>
      <li><strong>Storage:</strong> a PostgreSQL database hosted by Neon (encrypted at rest).</li>
      <li><strong>In transit:</strong> TLS everywhere (browser ↔ backend ↔ Google/Anthropic).</li>
      <li><strong>Gmail OAuth tokens:</strong> encrypted at rest with AES-256-GCM.</li>
      <li><strong>Sessions:</strong> bearer tokens stored server-side only as SHA-256 hashes, with expiry; data endpoints verify ownership on every request.</li>
    </ul>

    <h3>Service providers (subprocessors)</h3>
    <table>
      <tr><th>Provider</th><th>Role</th><th>Sees</th></tr>
      <tr><td>Google (Gmail API)</td><td>source of email metadata</td><td>your Gmail account, per the scopes above</td></tr>
      <tr><td>Anthropic (Claude API)</td><td>extraction of purchase records</td><td>email metadata during processing; no training</td></tr>
      <tr><td>Neon</td><td>database hosting</td><td>stored records, encrypted at rest</td></tr>
      <tr><td>Render</td><td>backend hosting</td><td>data in transit through our server</td></tr>
      <tr><td>Vercel</td><td>frontend hosting</td><td>serves the web app; no ledger data</td></tr>
      <tr><td>Frankfurter (ECB rates)</td><td>currency conversion</td><td>nothing — exchange rates only; no personal data is sent</td></tr>
    </table>

    <hr />

    <h2>Data retention and deletion</h2>
    <ul>
      <li>Extracted records are retained for as long as your account exists so your dashboard keeps working between syncs.</li>
      <li><strong>Disconnect</strong> (in the app) revokes the app's Gmail access and deletes your OAuth tokens and sessions immediately. Your extracted records are kept so the dashboard still works if you return — delete them separately if you want them gone.</li>
      <li><strong>Delete everything yourself, instantly:</strong> the "Delete my data" button in the app permanently erases every extracted record, processed-message ID, budget, setting, session, and stored Gmail token from our servers, and revokes the app's Gmail access. Immediate and irreversible — no email or waiting period required.</li>
      <li>You can also contact us at the address below and we will delete all data associated with your account within 30 days.</li>
    </ul>

    <hr />

    <h2>Demo mode</h2>
    <p>"Try the demo" runs entirely in your browser on fictional sample data. No account is created, nothing is sent to our servers, and no Google access is requested.</p>

    <hr />

    <h2>Children</h2>
    <p>This app is not directed at children under 13. We do not knowingly collect data from children under 13. If you believe a child has used the app and you would like their data removed, contact us.</p>

    <hr />

    <h2>Changes to this policy</h2>
    <p>If we make material changes to this policy, we will update the "Last updated" date at the top and, where appropriate, notify users through the app.</p>

    <hr />

    <h2>Contact</h2>
    <p>Questions about this privacy policy, or a deletion request? <a href="mailto:${PRIVACY_CONTACT}">${PRIVACY_CONTACT}</a></p>
  </div>
</body>
</html>`
}
