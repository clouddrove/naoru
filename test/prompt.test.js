import { describe, it, expect } from 'vitest'
import { buildPrompt, DEFAULT_INSTRUCTIONS, DIAGNOSIS_SCHEMA } from '../src/prompt.js'

describe('buildPrompt', () => {
  it('includes job name, logs, and diff', () => {
    const p = buildPrompt({ jobName: 'build', logs: 'TypeError: x', diff: '- a\n+ b', files: ['src/a.ts'] })
    expect(p).toContain('build')
    expect(p).toContain('TypeError: x')
    expect(p).toContain('+ b')
    expect(p).toContain('src/a.ts')
  })

  it('uses the default instructions when none are supplied', () => {
    expect(buildPrompt({ jobName: 'build' })).toContain(DEFAULT_INSTRUCTIONS)
  })

  it('replaces the default instructions with a caller override', () => {
    const p = buildPrompt({ jobName: 'build', instructions: 'Be blunt. Under 50 words.' })
    expect(p).toContain('Be blunt. Under 50 words.')
    expect(p).not.toContain('You are naoru, a CI failure diagnostician.')
  })

  it('keeps the diff-format rules and data sections under an override', () => {
    const p = buildPrompt({ jobName: 'build', logs: 'boom', instructions: 'Be blunt.' })
    expect(p).toContain('--- a/<path>')
    expect(p).toContain('## Failed job\nbuild')
    expect(p).toContain('boom')
  })

  it('falls back to the defaults when the override is blank', () => {
    expect(buildPrompt({ jobName: 'build', instructions: '   ' })).toContain(DEFAULT_INSTRUCTIONS)
  })
})

describe('DIAGNOSIS_SCHEMA', () => {
  it('requires the four fields', () => {
    expect(DIAGNOSIS_SCHEMA.required).toEqual(['rootCause', 'suggestedFix', 'confidence', 'files'])
  })
})
