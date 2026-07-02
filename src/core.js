import { resolveProvider } from './providers/index.js'
import { diagnose as anthropicDiagnose } from './providers/anthropic.js'
import { diagnose as openaiDiagnose } from './providers/openai.js'
import { buildPrompt } from './prompt.js'
import { normalize, toMarkdown } from './parse.js'
import { withRetry } from './retry.js'

// ctx: { provider, apiKey, baseURL?, model?, jobName, logs, diff, files }
export async function diagnose(ctx) {
  const cfg = resolveProvider({ provider: ctx.provider, apiKey: ctx.apiKey, baseURL: ctx.baseURL, model: ctx.model })
  const prompt = buildPrompt({ jobName: ctx.jobName, logs: ctx.logs, diff: ctx.diff, files: ctx.files })
  const call = () => (cfg.kind === 'anthropic' ? anthropicDiagnose(cfg, prompt) : openaiDiagnose(cfg, prompt))
  const raw = await withRetry(call, { log: (m) => console.warn(`naoru: ${m}`) })
  const diagnosis = normalize(raw)
  return { diagnosis, markdown: toMarkdown(ctx.jobName, diagnosis) }
}
