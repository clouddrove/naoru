import { describe, it, expect, vi } from 'vitest'
import { resolveProvider } from '../src/providers/index.js'

describe('resolveProvider', () => {
  it('defaults anthropic with claude model', () => {
    const r = resolveProvider({ provider: 'anthropic', apiKey: 'k' })
    expect(r.kind).toBe('anthropic')
    expect(r.model).toMatch(/claude/)
  })
  it('maps openrouter to its base url', () => {
    const r = resolveProvider({ provider: 'openrouter', apiKey: 'k' })
    expect(r.kind).toBe('openai')
    expect(r.baseURL).toBe('https://openrouter.ai/api/v1')
  })
  it('maps xai to grok endpoint', () => {
    expect(resolveProvider({ provider: 'xai', apiKey: 'k' }).baseURL).toBe('https://api.x.ai/v1')
  })
  it('requires base-url for custom provider', () => {
    expect(() => resolveProvider({ provider: 'custom', apiKey: 'k' })).toThrow(/base-url/)
  })
  it('honors explicit model override', () => {
    expect(resolveProvider({ provider: 'openai', apiKey: 'k', model: 'gpt-4o-mini' }).model).toBe('gpt-4o-mini')
  })
})

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    constructor() {}
    messages = { create: vi.fn().mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_diagnosis', input: { rootCause: 'a', suggestedFix: 'b', confidence: 'high', files: [] } }],
    }) }
  },
}))

vi.mock('openai', () => ({
  default: class {
    constructor() {}
    chat = { completions: { create: vi.fn().mockResolvedValue({
      choices: [{ message: { tool_calls: [{ function: { name: 'report_diagnosis', arguments: JSON.stringify({ rootCause: 'a', suggestedFix: 'b', confidence: 'low', files: ['x'] }) } }] } }],
    }) } }
  },
}))

it('anthropic client returns structured diagnosis', async () => {
  const { diagnose } = await import('../src/providers/anthropic.js')
  const out = await diagnose({ apiKey: 'k', model: 'claude-sonnet-4-6' }, 'prompt')
  expect(out.rootCause).toBe('a')
  expect(out.confidence).toBe('high')
})

it('openai client returns structured diagnosis', async () => {
  const { diagnose } = await import('../src/providers/openai.js')
  const out = await diagnose({ apiKey: 'k', baseURL: 'https://api.x.ai/v1', model: 'grok-2' }, 'prompt')
  expect(out.files).toEqual(['x'])
})
