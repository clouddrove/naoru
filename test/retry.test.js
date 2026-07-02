import { describe, it, expect, vi } from 'vitest'
import { withRetry, isRetryable, retryDelayMs } from '../src/retry.js'

const noSleep = () => Promise.resolve()

describe('isRetryable', () => {
  it('matches retryable statuses and rate-limit messages', () => {
    expect(isRetryable({ status: 429 })).toBe(true)
    expect(isRetryable({ message: 'Rate limit reached for model x' })).toBe(true)
    expect(isRetryable({ status: 401, message: 'invalid api key' })).toBe(false)
  })
})

describe('retryDelayMs', () => {
  it('honors the provider "try again in Xs" hint', () => {
    expect(retryDelayMs({ message: 'Please try again in 39.69s.' }, 0)).toBe(40690)
  })
  it('falls back to exponential backoff, capped', () => {
    expect(retryDelayMs({ message: 'overloaded' }, 0)).toBe(5000)
    expect(retryDelayMs({ message: 'overloaded' }, 10)).toBe(90000)
  })
})

describe('withRetry', () => {
  it('retries retryable errors then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate limit'), { status: 429 }))
      .mockResolvedValue('ok')
    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })
  it('throws non-retryable errors immediately', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('bad key'), { status: 401 }))
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toThrow('bad key')
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('gives up after the attempt budget', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('rate limit'), { status: 429 }))
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toThrow('rate limit')
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
