import { describe, expect, it } from 'vitest'

import { privacyPage } from '../pages'

// The privacy policy is a Google-verification artifact: CASA reviewers check it
// names the scopes, carries the Limited Use disclosure, and matches the real
// deletion paths. These tests pin the load-bearing content so a future edit
// can't silently drop a required disclosure.
describe('privacyPage', () => {
  const html = privacyPage()

  it('names both requested scopes', () => {
    expect(html).toContain('gmail.readonly')
    expect(html).toContain('userinfo.email')
  })

  it('carries the Limited Use disclosure', () => {
    expect(html).toContain('Google API Services User Data Policy')
    expect(html).toContain('Limited Use requirements')
  })

  it('discloses AI processing without training', () => {
    expect(html).toContain('Anthropic')
    expect(html).toMatch(/not<\/strong> use it to train/)
  })

  it('describes the in-app deletion path and the disconnect distinction', () => {
    expect(html).toContain('Delete my data')
    expect(html).toContain('Disconnect')
  })

  it('has a reachable contact address (not the unowned diwtkn.com domain)', () => {
    expect(html).toContain('snowwarrior1+diwtk@gmail.com')
    expect(html).not.toContain('diwtkn.com')
  })

  it('contains no stale SurveyTok-era survey copy', () => {
    expect(html.toLowerCase()).not.toContain('survey')
    expect(html.toLowerCase()).not.toContain('questions you post')
  })
})
