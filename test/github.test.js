import { describe, it, expect, vi } from 'vitest'
import { tailAndClean, findStickyComment } from '../src/github.js'
import { MARKER } from '../src/parse.js'

describe('tailAndClean', () => {
  it('strips ANSI and tails to N lines', () => {
    const raw = Array.from({ length: 10 }, (_, i) => `[31mline${i}[0m`).join('\n')
    const out = tailAndClean(raw, 3)
    expect(out.split('\n')).toHaveLength(3)
    expect(out).toContain('line9')
    expect(out).not.toContain('[31m')
  })
})

describe('findStickyComment', () => {
  it('returns the comment id carrying the marker', () => {
    const comments = [{ id: 1, body: 'hi' }, { id: 2, body: `x ${MARKER}` }]
    expect(findStickyComment(comments)).toBe(2)
  })
  it('returns null when no marker present', () => {
    expect(findStickyComment([{ id: 1, body: 'hi' }])).toBeNull()
  })
})
