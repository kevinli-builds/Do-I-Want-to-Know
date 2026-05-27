import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { questionsRouter } from './routes/questions'
import { usersRouter } from './routes/users'

const app = express()
app.use(cors())
app.use(express.json())

app.use('/questions', questionsRouter)
app.use('/users', usersRouter)

app.get('/health', (_req, res) => res.json({ ok: true }))

app.get('/privacy', (_req, res) => {
  res.setHeader('Content-Type', 'text/html')
  res.send(`<!DOCTYPE html>
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
    h2 { font-size: 17px; font-weight: 700; margin: 36px 0 10px; color: #1a1a2e; }
    p, li { font-size: 15px; line-height: 1.7; color: #444; }
    ul { padding-left: 20px; margin-top: 8px; }
    li { margin-bottom: 4px; }
    hr { border: none; border-top: 1px solid #e8e8e8; margin: 32px 0; }
    a { color: #6C63FF; }
    .pill { display: inline-block; background: #f0eeff; color: #6C63FF; border-radius: 100px; padding: 4px 14px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Privacy Policy</h1>
    <p class="meta">Do I Want To Know &nbsp;·&nbsp; Last updated: May 2026</p>

    <h2>What this app is</h2>
    <p>Do I Want To Know is a survey platform. You can post questions, answer questions posted by others, and see aggregated results. The app is designed to work without requiring any personal information.</p>

    <hr />

    <h2>What we collect</h2>
    <p><strong>What we do collect</strong></p>
    <ul>
      <li><strong>A random device ID</strong> — when you first open the app, a random identifier (UUID) is generated on your device and stored locally. It contains no personal information.</li>
      <li><strong>Questions you post</strong> — the text, answer type, and options.</li>
      <li><strong>Answers you submit</strong> — your selected answer to questions in the feed.</li>
      <li><strong>Timestamps</strong> — when questions were posted and answers submitted.</li>
    </ul>
    <br />
    <p><strong>What we do NOT collect</strong></p>
    <ul>
      <li>Your name, email address, or phone number</li>
      <li>Your location</li>
      <li>Your contacts or address book</li>
      <li>Any information from other apps</li>
      <li>Photos, camera, or microphone access</li>
    </ul>

    <hr />

    <h2>How we use your data</h2>
    <ul>
      <li>To show your questions to other users in the feed</li>
      <li>To record your answers so you are not shown the same question twice</li>
      <li>To calculate and display aggregate results</li>
      <li>To show you the questions you have posted and their results</li>
    </ul>
    <p style="margin-top:10px">We do not use your data for advertising, profiling, or any purpose beyond operating the app.</p>

    <hr />

    <h2>Who we share data with</h2>
    <p>We do not sell, rent, or share your data with third parties for commercial purposes. Aggregate, anonymised results may be visible to any user who answers a question.</p>

    <hr />

    <h2>Data retention &amp; deletion</h2>
    <p>Questions and answers are retained for as long as the app is operational. To request deletion of your data, contact us with your device ID and we will remove it within 30 days.</p>

    <hr />

    <h2>Children</h2>
    <p>This app is not directed at children under 13. We do not knowingly collect data from children under 13.</p>

    <hr />

    <h2>Changes</h2>
    <p>If we make material changes to this policy we will update the date above and notify users through the app where appropriate.</p>

    <hr />

    <h2>Contact</h2>
    <p>Questions? Email us at <a href="mailto:privacy@diwtkn.com">privacy@diwtkn.com</a></p>
  </div>
</body>
</html>`)
})

const PORT = process.env.PORT ?? 3000
app.listen(PORT, () => console.log(`Survey backend running on http://localhost:${PORT}`))
