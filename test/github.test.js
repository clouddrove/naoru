import { describe, it, expect } from 'vitest'
import { tailAndClean, findStickyComment, pickFailedJob, filterDiff } from '../src/github.js'
import { MARKER } from '../src/parse.js'

describe('tailAndClean', () => {
  it('strips ANSI, strips ISO timestamps, and tails to N lines', () => {
    const raw = Array.from({ length: 10 }, (_, i) => `2024-01-01T00:00:0${i}.0000000Z \x1b[31mline${i}\x1b[0m`).join('\n')
    const out = tailAndClean(raw, 3)
    expect(out.split('\n')).toHaveLength(3)
    expect(out).toContain('line9')
    expect(out).not.toContain('\x1b')
    expect(out).not.toContain('[31m')
    expect(out).not.toContain('2024-01-01T')
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

describe('pickFailedJob', () => {
  const jobs = [
    { id: 1, name: 'build', conclusion: 'success' },
    { id: 2, name: 'break', conclusion: 'failure' },
    { id: 3, name: 'deploy', conclusion: 'failure' },
  ]

  it('prefers a failed job matching the given name', () => {
    expect(pickFailedJob(jobs, 'break').id).toBe(2)
  })
  it('falls back to the first failed job when name has no match', () => {
    expect(pickFailedJob(jobs, 'nomatch').id).toBe(2)
  })
  it('uses the first failed job when no name given', () => {
    expect(pickFailedJob(jobs).id).toBe(2)
  })
  it('returns null when nothing failed', () => {
    expect(pickFailedJob([{ id: 9, name: 'x', conclusion: 'success' }], 'x')).toBeNull()
  })
})

describe('filterDiff', () => {
  const diff = [
    'diff --git a/src/auth.ts b/src/auth.ts',
    '--- a/src/auth.ts',
    '+++ b/src/auth.ts',
    '@@ -1 +1 @@',
    '-if (user.id)',
    '+if (user?.id)',
    'diff --git a/dist/index.js b/dist/index.js',
    '--- a/dist/index.js',
    '+++ b/dist/index.js',
    '@@ -1 +1 @@',
    '+(huge minified bundle)',
    'diff --git a/package-lock.json b/package-lock.json',
    '+lockfile noise',
  ].join('\n')

  it('keeps source files and drops dist + lockfiles', () => {
    const out = filterDiff(diff)
    expect(out).toContain('src/auth.ts')
    expect(out).toContain('user?.id')
    expect(out).not.toContain('dist/index.js')
    expect(out).not.toContain('package-lock.json')
  })

  it('hard-caps overly long diffs', () => {
    const big = 'diff --git a/src/a.ts b/src/a.ts\n' + 'x'.repeat(100000)
    const out = filterDiff(big, 1000)
    expect(out.length).toBeLessThan(1100)
    expect(out).toContain('(diff truncated)')
  })

  it('returns empty string for empty input', () => {
    expect(filterDiff('')).toBe('')
  })
})
