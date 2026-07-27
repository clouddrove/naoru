import { describe, it, expect, vi } from 'vitest'

// vi.mock is hoisted above the imports, so the spy has to be hoisted with it.
const { anthropicDiagnose } = vi.hoisted(() => ({
  anthropicDiagnose: vi.fn().mockResolvedValue({
    raw: { rootCause: 'undefined user', suggestedFix: 'fix', confidence: 'high', files: ['a.ts'] },
    usage: { input_tokens: 900, output_tokens: 120 },
  }),
}))

vi.mock('../src/providers/anthropic.js', () => ({ diagnose: anthropicDiagnose }))
vi.mock('../src/providers/openai.js', () => ({ diagnose: vi.fn() }))

import { diagnose } from '../src/core.js'

describe('core.diagnose', () => {
  it('routes anthropic and renders markdown', async () => {
    const out = await diagnose({
      provider: 'anthropic', apiKey: 'k',
      jobName: 'build', logs: 'TypeError', diff: '- a\n+ b', files: ['a.ts'],
    })
    expect(out.diagnosis.confidence).toBe('high')
    expect(out.markdown).toContain('🩺 naoru')
    expect(out.markdown).toContain('`build`')
  })

  it('reports token usage and the resolved model', async () => {
    const out = await diagnose({ provider: 'anthropic', apiKey: 'k', jobName: 'build', logs: 'x' })
    expect(out.usage).toEqual({ input: 900, output: 120, total: 1020 })
    expect(out.model).toMatch(/claude/)
    expect(out.markdown).toContain('1,020 tokens')
  })

  // Every path to the model goes through core.diagnose, so redaction lives here
  // rather than at the call sites where a new caller could forget it.
  it('redacts secrets from logs and diff before they reach the provider', async () => {
    anthropicDiagnose.mockClear()
    await diagnose({
      provider: 'anthropic', apiKey: 'k', jobName: 'build',
      logs: 'auth failed for ghp_abcdefghijklmnopqrstuvwxyz0123',
      diff: '+const key = "AKIAIOSFODNN7EXAMPLE"',
      redactPatterns: ['ACME-\\d+'],
    })
    const prompt = anthropicDiagnose.mock.calls[0][1]
    expect(prompt).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123')
    expect(prompt).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(prompt).toContain('auth failed for')
  })

  it('applies caller-supplied redact patterns', async () => {
    anthropicDiagnose.mockClear()
    await diagnose({
      provider: 'anthropic', apiKey: 'k', jobName: 'build',
      logs: 'tenant ACME-9931 failed', redactPatterns: ['ACME-\\d+'],
    })
    expect(anthropicDiagnose.mock.calls[0][1]).not.toContain('ACME-9931')
  })

  it('passes max-tokens through to the provider config', async () => {
    anthropicDiagnose.mockClear()
    await diagnose({ provider: 'anthropic', apiKey: 'k', jobName: 'b', logs: 'x', maxTokens: 4000 })
    expect(anthropicDiagnose.mock.calls[0][0].maxTokens).toBe(4000)
  })
})
