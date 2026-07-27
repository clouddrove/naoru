// Retry transient provider failures. Ten workflows diagnosing at once will
// trip per-minute token limits (429s); those are worth waiting out.

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529])
// "returned no tool call" is a transient model flake (observed with minimax) —
// the model answers in prose instead of calling the tool; a retry usually lands.
const RETRYABLE_MESSAGE = /rate limit|overloaded|too many requests|temporarily unavailable|returned no tool call/i

export function isRetryable(e) {
  const status = e?.status ?? e?.response?.status
  return RETRYABLE_STATUS.has(status) || RETRYABLE_MESSAGE.test(String(e?.message || ''))
}

// Providers often say how long to wait ("Please try again in 39.69s"), and send
// the same hint to every caller. Without jitter, ten workflows that rate-limited
// together would retry in lockstep and rate-limit together again — so spread
// each wait over ±25%. `rand` is injectable to keep the tests deterministic.
export function retryDelayMs(e, attempt, rand = Math.random) {
  const hinted = String(e?.message || '').match(/try again in ([\d.]+)\s*s/i)
  const ms = hinted ? Math.ceil(parseFloat(hinted[1]) * 1000) + 1000 : 5000 * 2 ** attempt
  const jittered = ms * (0.75 + rand() * 0.5)
  return Math.round(Math.min(jittered, 90_000))
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
