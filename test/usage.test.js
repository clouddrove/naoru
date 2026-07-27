import { describe, it, expect } from 'vitest'
import { normalizeUsage, formatUsage } from '../src/usage.js'

describe('normalizeUsage', () => {
  it('reads the anthropic shape', () => {
    expect(normalizeUsage({ input_tokens: 1200, output_tokens: 300 })).toEqual({ input: 1200, output: 300, total: 1500 })
  })
  it('reads the openai shape', () => {
    expect(normalizeUsage({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }))
      .toEqual({ input: 10, output: 5, total: 15 })
  })
  it('reports unknown counts as null rather than zero', () => {
    expect(normalizeUsage(undefined)).toEqual({ input: null, output: null, total: null })
  })
})

describe('formatUsage', () => {
  it('renders totals, breakdown, and model', () => {
    expect(formatUsage({ input: 1200, output: 300, total: 1500 }, 'gpt-4o'))
      .toBe('1,500 tokens (1,200 in / 300 out) · `gpt-4o`')
  })
  it('renders nothing when the provider reported no usage', () => {
    expect(formatUsage({ input: null, output: null, total: null }, 'gpt-4o')).toBe('')
    expect(formatUsage(undefined, 'gpt-4o')).toBe('')
  })
})
