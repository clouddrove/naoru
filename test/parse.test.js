import { describe, it, expect } from 'vitest'
import { normalize, toMarkdown, MARKER } from '../src/parse.js'

const raw = { rootCause: 'undefined user', suggestedFix: '```diff\n- a\n+ b\n```', confidence: 'high', files: ['src/a.ts'] }

describe('normalize', () => {
  it('coerces confidence to lowercase enum and defaults missing files', () => {
    const n = normalize({ rootCause: 'x', suggestedFix: 'y', confidence: 'HIGH' })
    expect(n.confidence).toBe('high')
    expect(n.files).toEqual([])
  })
  it('falls back to low on unknown confidence', () => {
    expect(normalize({ rootCause: 'x', suggestedFix: 'y', confidence: 'banana' }).confidence).toBe('low')
  })
})

describe('toMarkdown', () => {
  it('embeds the hidden sticky marker and job name', () => {
    const md = toMarkdown('build', normalize(raw))
    expect(md).toContain(MARKER)
    expect(md).toContain('`build`')
    expect(md).toContain('undefined user')
    expect(md).toContain('High')
  })
})
