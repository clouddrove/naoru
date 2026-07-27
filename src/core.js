import { resolveProvider } from './providers/index.js'
import { diagnose as anthropicDiagnose } from './providers/anthropic.js'
import { diagnose as openaiDiagnose } from './providers/openai.js'
import { buildPrompt } from './prompt.js'
import { normalize, toMarkdown } from './parse.js'
import { redact } from './redact.js'
import { withRetry } from './retry.js'
import { normalizeUsage } from './usage.js'

// ctx: { provider, apiKey, baseURL?, model?, maxTokens?, jobName, logs, diff,
//        files, instructions?, redactPatterns? }
export async function diagnose(ctx) {
  const cfg = resolveProvider({
    provider: ctx.provider, apiKey: ctx.apiKey, baseURL: ctx.baseURL,
    model: ctx.model, maxTokens: ctx.maxTokens,
  })
  const warn = (m) => console.warn(m)
  // Redact on the way out, not at the call sites — every path into the model
  // goes through here, so nothing can be added later that bypasses it.
  const scrub = (t) => redact(t, { patterns: ctx.redactPatterns, warn })
  const prompt = buildPrompt({
    jobName: ctx.jobName,
    logs: scrub(ctx.logs),
    diff: scrub(ctx.diff),
    files: ctx.files,
    instructions: ctx.instructions,
  })
  const call = () => (cfg.kind === 'anthropic' ? anthropicDiagnose(cfg, prompt) : openaiDiagnose(cfg, prompt))
  const { raw, usage } = await withRetry(call, { log: (m) => console.warn(`naoru: ${m}`) })
  const diagnosis = normalize(raw)
  const tokens = normalizeUsage(usage)
  return { diagnosis, usage: tokens, model: cfg.model, markdown: toMarkdown(ctx.jobName, diagnosis, { usage: tokens, model: cfg.model }) }
}
