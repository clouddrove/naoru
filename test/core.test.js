import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/providers/anthropic.js', () => ({
  diagnose: vi.fn().mockResolvedValue({ rootCause: 'undefined user', suggestedFix: 'fix', confidence: 'high', files: ['a.ts'] }),
}))
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
})
