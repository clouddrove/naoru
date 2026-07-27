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
  it('maps gemini to its openai-compatible endpoint', () => {
    const r = resolveProvider({ provider: 'gemini', apiKey: 'k' })
    expect(r.kind).toBe('openai')
    expect(r.baseURL).toBe('https://generativelanguage.googleapis.com/v1beta/openai')
    expect(r.model).toMatch(/^gemini-/)
  })
  it('asks rather than forces the tool call on gemini', () => {
    expect(resolveProvider({ provider: 'gemini', apiKey: 'k' }).toolChoice).toBe('auto')
    expect(resolveProvider({ provider: 'openai', apiKey: 'k' }).toolChoice).toBeUndefined()
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

describe('parseFallbackContent', () => {
  const load = () => import('../src/providers/openai.js')
  const body = { rootCause: 'a', suggestedFix: 'b', confidence: 'high', files: [] }

  it('recovers a fenced json block', async () => {
    const { parseFallbackContent } = await load()
    expect(parseFallbackContent('here you go:\n```json\n' + JSON.stringify(body) + '\n```')).toEqual(body)
  })
  it('recovers bare json wrapped in prose', async () => {
    const { parseFallbackContent } = await load()
    expect(parseFallbackContent('Diagnosis: ' + JSON.stringify(body) + ' hope that helps')).toEqual(body)
  })
  it('returns null for prose with no diagnosis object', async () => {
    const { parseFallbackContent } = await load()
    expect(parseFallbackContent('the build broke, sorry')).toBeNull()
    expect(parseFallbackContent('{ not json')).toBeNull()
    expect(parseFallbackContent('{"unrelated":1}')).toBeNull()
    expect(parseFallbackContent(null)).toBeNull()
  })
})
