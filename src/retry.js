// Retry transient provider failures. Ten workflows diagnosing at once will
// trip per-minute token limits (429s); those are worth waiting out.

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529])
const RETRYABLE_MESSAGE = /rate limit|overloaded|too many requests|temporarily unavailable/i

export function isRetryable(e) {
  const status = e?.status ?? e?.response?.status
  return RETRYABLE_STATUS.has(status) || RETRYABLE_MESSAGE.test(String(e?.message || ''))
}

// Providers often say how long to wait ("Please try again in 39.69s").
export function retryDelayMs(e, attempt) {
  const hinted = String(e?.message || '').match(/try again in ([\d.]+)\s*s/i)
  const ms = hinted ? Math.ceil(parseFloat(hinted[1]) * 1000) + 1000 : 5000 * 2 ** attempt
  return Math.min(ms, 90_000)
}

export async function withRetry(fn, { attempts = 4, log = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let lastErr
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (!isRetryable(e) || attempt === attempts - 1) throw e
      const delay = retryDelayMs(e, attempt)
      log(`provider error (attempt ${attempt + 1}/${attempts}), retrying in ${Math.round(delay / 1000)}s: ${e.message}`)
      await sleep(delay)
    }
  }
  throw lastErr
}
