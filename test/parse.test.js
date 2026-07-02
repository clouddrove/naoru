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
  it('keeps a separate diff field and strips accidental fences from it', () => {
    const n = normalize({ rootCause: 'x', suggestedFix: 'y', diff: '```diff\n- a\n+ b\n```', confidence: 'high' })
    expect(n.diff).toBe('- a\n+ b')
    expect(n.suggestedFix).toBe('y')
  })
  it('extracts a fenced block embedded mid-sentence in suggestedFix', () => {
    const n = normalize({
      rootCause: 'x',
      suggestedFix: 'Remove the line. For example: ```diff\n- COPY missing-file.txt /app/\n```',
      confidence: 'high',
    })
    expect(n.diff).toBe('- COPY missing-file.txt /app/')
    expect(n.suggestedFix).toBe('Remove the line. For example:')
  })
  it('extracts an unclosed fence so the footer is not swallowed', () => {
    const n = normalize({ rootCause: 'x', suggestedFix: 'Fix it: ```diff\n- a\n+ b', confidence: 'high' })
    expect(n.diff).toBe('- a\n+ b')
    expect(n.suggestedFix).toBe('Fix it:')
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
  it('renders the diff in its own fenced block on separate lines', () => {
    const md = toMarkdown('build', normalize(raw))
    expect(md).toContain('\n```diff\n- a\n+ b\n```\n')
    expect(md.indexOf('**Confidence:**')).toBeGreaterThan(md.indexOf('```diff'))
  })
})
