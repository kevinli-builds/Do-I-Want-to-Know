import { describe, expect, it } from 'vitest'

import { parseBatchResponse } from '../extractor'

// The retry contract matters more than the happy path: a THROW means the
// caller leaves the batch out of the results map so the next sync retries it;
// a RETURN marks every email in the batch examined (null = not relevant,
// permanently). These tests pin which failures land on which side.
describe('parseBatchResponse', () => {
  const entry = {
    category: 'order',
    vendor: 'Amazon',
    amount: 42.5,
    currency: 'USD',
    date: '2026-07-01',
    description: 'Echo Dot',
  }

  it('parses a clean JSON mapping', () => {
    const out = parseBatchResponse([{ type: 'text', text: JSON.stringify({ '0': entry, '1': null }) }])
    expect(out['0']).toMatchObject({ vendor: 'Amazon', amount: 42.5 })
    expect(out['1']).toBeNull()
  })

  it('extracts the JSON object out of surrounding prose', () => {
    const text = `Here are the classifications:\n${JSON.stringify({ '0': entry })}\nLet me know if you need more.`
    const out = parseBatchResponse([{ type: 'text', text }])
    expect(out['0']).toMatchObject({ vendor: 'Amazon' })
  })

  it('scans past a non-text leading block instead of reading content[0]', () => {
    const out = parseBatchResponse([
      { type: 'thinking' },
      { type: 'text', text: JSON.stringify({ '0': null }) },
    ])
    expect(out['0']).toBeNull()
  })

  it('throws on malformed JSON so the batch is retried, not swallowed', () => {
    // Realistic truncation: entry 0 closed, entry 1 cut off — the greedy regex
    // captures an unbalanced fragment and JSON.parse must throw.
    const truncated = '{"0": {"vendor": "Amazon"}, "1": {"vendor": "Spo'
    expect(() => parseBatchResponse([{ type: 'text', text: truncated }])).toThrow()
  })

  it('returns {} for truncation with no closing brace — extractEntries guards this via stop_reason', () => {
    // With zero closing braces the regex finds nothing and the parse yields {}.
    // parseBatchResponse alone cannot distinguish this from "all not relevant",
    // which is why extractEntries throws on stop_reason === 'max_tokens' BEFORE
    // parsing. This test documents the boundary.
    expect(parseBatchResponse([{ type: 'text', text: '{"0": {"vendor": "Ama' }])).toEqual({})
  })

  it('returns {} when the model answered without any JSON object', () => {
    expect(parseBatchResponse([{ type: 'text', text: 'No relevant emails found.' }])).toEqual({})
  })

  it('returns {} when there is no text block at all', () => {
    expect(parseBatchResponse([{ type: 'tool_use' }])).toEqual({})
  })
})
