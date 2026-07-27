import { describe, it, expect, vi } from 'vitest'
import { redact, parsePatternList, REDACTED } from '../src/redact.js'

describe('redact', () => {
  it('strips a whole PEM private key block', () => {
    const log = 'before\n-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nkey\n-----END RSA PRIVATE KEY-----\nafter'
    const out = redact(log)
    expect(out).not.toContain('MIIEow')
    expect(out).toContain('before')
    expect(out).toContain('after')
  })

  it('strips provider tokens by prefix', () => {
    const out = redact([
      'ghp_abcdefghijklmnopqrstuvwxyz0123',
      'github_pat_11ABCDEFG0abcdefghijklmnop',
      'sk-ant-api03-abcdefghijklmnopqrstuvwx',
      'xoxb-1234567890-abcdefghij',
      'AKIAIOSFODNN7EXAMPLE',
      'AIzaSyA1234567890abcdefghijklmnopqrstuvw',
    ].join('\n'))
    for (const leaked of ['ghp_abc', 'github_pat_11', 'sk-ant', 'xoxb-', 'AKIAIOSFODNN7EXAMPLE', 'AIzaSy']) {
      expect(out).not.toContain(leaked)
    }
  })

  it('strips JWTs and bearer headers but keeps the header name', () => {
    const out = redact('authorization: Bearer eyJhbGciOi.eyJzdWIiOjEyMzQ1.SflKxwRJSMeKKF2QT4')
    expect(out).toContain('Bearer')
    expect(out).not.toContain('eyJhbGciOi')
  })

  it('strips credentials from a connection string but keeps the host', () => {
    const out = redact('postgres://admin:hunter2@db.internal:5432/app')
    expect(out).toBe(`postgres://${REDACTED}@db.internal:5432/app`)
  })

  it('strips labelled assignments in several syntaxes', () => {
    const out = redact('API_KEY=supersecretvalue\n"token": "anothersecret"\npassword: hunter2000')
    expect(out).not.toContain('supersecretvalue')
    expect(out).not.toContain('anothersecret')
    expect(out).not.toContain('hunter2000')
    expect(out).toContain('API_KEY')
  })

  it('leaves ordinary log lines alone', () => {
    const log = "TypeError: Cannot read properties of undefined (reading 'id')\n  at index.js:4:38"
    expect(redact(log)).toBe(log)
  })

  it('applies caller-supplied patterns', () => {
    expect(redact('internal-id ACME-9931', { patterns: ['ACME-\\d+'] })).not.toContain('ACME-9931')
  })

  it('warns and continues past an invalid caller pattern', () => {
    const warn = vi.fn()
    expect(redact('keep me', { patterns: ['('], warn })).toBe('keep me')
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('parsePatternList', () => {
  it('splits on newlines and drops blanks', () => {
    expect(parsePatternList('a\n\n  b  \n')).toEqual(['a', 'b'])
    expect(parsePatternList(undefined)).toEqual([])
  })
})
