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
  it('reads the prompt override from the flag or the env', () => {
    expect(parseArgs(['--prompt', 'be blunt'], {}).instructions).toBe('be blunt')
    expect(parseArgs([], { NAORU_PROMPT: 'from env' }).instructions).toBe('from env')
    expect(parseArgs([], {}).instructions).toBeUndefined()
  })
  it('supports --flag=value', () => {
    expect(parseArgs(['--provider=groq', '--pr=7'], {}).provider).toBe('groq')
    expect(parseArgs(['--provider=groq', '--pr=7'], {}).pr).toBe(7)
  })
  it('does not let a bare boolean flag swallow the next flag', () => {
    // `--verbose` used to consume `--provider` as its value, desyncing the rest.
    const a = parseArgs(['--verbose', '--provider', 'groq', '--model', 'llama'], {})
    expect(a.provider).toBe('groq')
    expect(a.model).toBe('llama')
  })
  it('reads max-tokens and redact patterns', () => {
    const a = parseArgs(['--max-tokens', '4000', '--redact-patterns', 'ACME-\\d+'], {})
    expect(a.maxTokens).toBe(4000)
    expect(a.redactPatterns).toEqual(['ACME-\\d+'])
  })
})
