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
    p, li { font-size: 15px; line-height: 1.7; color: #444; }
    ul { padding-left: 20px; margin-top: 8px; }
    li { margin-bottom: 4px; }
    hr { border: none; border-top: 1px solid #e8e8e8; margin: 32px 0; }
    a { color: #6C63FF; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Privacy Policy</h1>
    <p class="meta">Do I Want To Know &nbsp;·&nbsp; Last updated: May 2026</p>

    <h2>What this app does</h2>
    <p>Do I Want To Know connects to your Gmail account (with your permission) to read purchase and subscription email metadata, then generates a personal "Wrapped" summary of your spending and subscriptions — like Spotify Wrapped, but for your inbox.</p>

    <hr />

    <h2>What we collect</h2>
    <ul>
      <li><strong>A random device ID</strong> — a UUID generated on your device, containing no personal information.</li>
      <li><strong>Your Gmail address</strong> — used to identify your account after you connect.</li>
      <li><strong>Email metadata only</strong> — sender, subject line, date, and a short snippet from order/subscription emails. We never read the full body of any email.</li>
      <li><strong>Extracted purchase data</strong> — vendor name, category, amount, and date parsed from the metadata above.</li>
    </ul>

    <hr />

    <h2>What we do NOT collect</h2>
    <ul>
      <li>The full text or attachments of any email</li>
      <li>Personal or non-commercial emails (we only query order/subscription subjects)</li>
      <li>Your contacts, calendar, location, or any other data</li>
    </ul>

    <hr />

    <h2>How we use your data</h2>
    <p>All data is used exclusively to generate your personal Wrapped stats. We do not sell, share, or monetize your data in any form.</p>

    <hr />

    <h2>Data deletion</h2>
    <p>Email <a href="mailto:privacy@diwtkn.com">privacy@diwtkn.com</a> to request deletion. We will remove all your data within 30 days.</p>

    <hr />

    <h2>Contact</h2>
    <p><a href="mailto:privacy@diwtkn.com">privacy@diwtkn.com</a></p>
  </div>
</body>
</html>`
}
