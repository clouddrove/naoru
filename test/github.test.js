import { describe, it, expect } from 'vitest'
import AdmZip from 'adm-zip'
import { tailAndClean, findStickyComment, extractLogsFromZip } from '../src/github.js'
import { MARKER } from '../src/parse.js'

describe('tailAndClean', () => {
  it('strips ANSI and tails to N lines', () => {
    const raw = Array.from({ length: 10 }, (_, i) => `\x1b[31mline${i}\x1b[0m`).join('\n')
    const out = tailAndClean(raw, 3)
    expect(out.split('\n')).toHaveLength(3)
    expect(out).toContain('line9')
    expect(out).not.toContain('\x1b')
    expect(out).not.toContain('[31m')
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

describe('extractLogsFromZip', () => {
  it('extracts text, prefers the failed job, and strips ISO timestamps', () => {
    const zip = new AdmZip()
    zip.addFile('build/3_step.txt', Buffer.from('2024-01-01T00:00:00.1234567Z hello build\n2024-01-01T00:00:01.0000000Z line2'))
    zip.addFile('other/1_step.txt', Buffer.from('2024-01-01T00:00:00.0000000Z unrelated noise'))
    const out = extractLogsFromZip(zip.toBuffer(), 'build', 500)
    expect(out).toContain('hello build')
    expect(out).toContain('line2')
    expect(out).not.toContain('unrelated')
    expect(out).not.toContain('2024-01-01T')
  })

  it('falls back to all entries when no entry matches the job', () => {
    const zip = new AdmZip()
    zip.addFile('0_setup.txt', Buffer.from('alpha log'))
    const out = extractLogsFromZip(zip.toBuffer(), 'nomatch', 500)
    expect(out).toContain('alpha log')
  })

  it('tails to maxLines after extraction', () => {
    const zip = new AdmZip()
    zip.addFile('job/1.txt', Buffer.from(Array.from({ length: 10 }, (_, i) => `n${i}`).join('\n')))
    const out = extractLogsFromZip(zip.toBuffer(), 'job', 3)
    expect(out.split('\n')).toHaveLength(3)
    expect(out).toContain('n9')
  })
})
