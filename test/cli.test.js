import { describe, it, expect } from 'vitest'
import { parseArgs } from '../src/cli.js'

describe('parseArgs', () => {
  it('reads flags and falls back to env', () => {
    const a = parseArgs(['--provider', 'xai', '--pr', '42'], { NAORU_API_KEY: 'k', NAORU_MODEL: 'grok-2' })
    expect(a.provider).toBe('xai')
    expect(a.apiKey).toBe('k')
    expect(a.model).toBe('grok-2')
    expect(a.pr).toBe(42)
  })
  it('defaults provider to anthropic', () => {
    expect(parseArgs([], { NAORU_API_KEY: 'k' }).provider).toBe('anthropic')
  })
})
