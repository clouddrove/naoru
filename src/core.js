import { resolveProvider } from './providers/index.js'
import { diagnose as anthropicDiagnose } from './providers/anthropic.js'
import { diagnose as openaiDiagnose } from './providers/openai.js'
import { buildPrompt } from './prompt.js'
import { normalize, toMarkdown } from './parse.js'

// ctx: { provider, apiKey, baseURL?, model?, jobName, logs, diff, files }
export async function diagnose(ctx) {
  const cfg = resolveProvider({ provider: ctx.provider, apiKey: ctx.apiKey, baseURL: ctx.baseURL, model: ctx.model })
  const prompt = buildPrompt({ jobName: ctx.jobName, logs: ctx.logs, diff: ctx.diff, files: ctx.files })
  const raw = cfg.kind === 'anthropic' ? await anthropicDiagnose(cfg, prompt) : await openaiDiagnose(cfg, prompt)
  const diagnosis = normalize(raw)
  return { diagnosis, markdown: toMarkdown(ctx.jobName, diagnosis) }
}
