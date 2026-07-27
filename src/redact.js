// CI logs are shipped to a third-party LLM. GitHub masks the secrets it knows
// about, but anything that reached the log some other way — an API response, a
// printed environment, a connection string in a stack trace — would otherwise
// leave the runner in cleartext. Strip the recognisable shapes first.

export const REDACTED = '[redacted]'

// Ordered: structural matches (PEM blocks, URLs) run before the generic
// key=value sweep so the broader rule can't chop them up first.
const BUILTIN = [
  // Whole PEM block, not just the header line.
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, to: REDACTED },
  // Credentials embedded in a URL: keep the shape, drop the pair.
  { re: /:\/\/[^\s/:@]+:[^\s/@]+@/g, to: `://${REDACTED}@` },
  // Self-identifying provider tokens.
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}/g, to: REDACTED },
  { re: /\bgh[pousr]_[A-Za-z0-9]{16,}/g, to: REDACTED },
  { re: /\bsk-[A-Za-z0-9_-]{16,}/g, to: REDACTED },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, to: REDACTED },
  // Google keys are AIza + 35, but stay tolerant: a missed secret costs more
  // than an over-eager redaction.
  { re: /\bAIza[0-9A-Za-z_-]{30,}/g, to: REDACTED },
  { re: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA|APKA)[0-9A-Z]{16}\b/g, to: REDACTED },
  // JWTs — three base64url segments.
  { re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, to: REDACTED },
  { re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}/gi, to: `Bearer ${REDACTED}` },
  // Labelled assignments: `api_key: hunter2`, `PASSWORD=hunter2`, `"token": "x"`.
  {
    re: /\b(password|passwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)("?\s*[=:]\s*)"?([^\s"',]{6,})"?/gi,
    to: (_m, key, sep) => `${key}${sep}${REDACTED}`,
  },
]

// Compile caller-supplied patterns. A bad regex is the caller's typo, not a
// reason to abort the diagnosis — warn and carry on with the rest.
export function compilePatterns(patterns, warn = () => {}) {
  return (patterns || [])
    .map((p) => String(p).trim())
    .filter(Boolean)
    .map((p) => {
      try {
        return { re: new RegExp(p, 'g'), to: REDACTED }
      } catch (e) {
        warn(`naoru: ignoring invalid redact pattern ${JSON.stringify(p)}: ${e.message}`)
        return null
      }
    })
    .filter(Boolean)
}

export function redact(text, { patterns = [], warn } = {}) {
  let out = String(text || '')
  for (const { re, to } of [...BUILTIN, ...compilePatterns(patterns, warn)]) {
    out = out.replace(re, to)
  }
  return out
}

// One pattern per line, so the action input stays readable in YAML.
export function parsePatternList(input) {
  return String(input || '').split('\n').map((s) => s.trim()).filter(Boolean)
}
