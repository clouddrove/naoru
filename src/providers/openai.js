import OpenAI from 'openai'
import { DIAGNOSIS_SCHEMA } from '../prompt.js'

const TOOL_NAME = 'report_diagnosis'

// Some OpenAI-compatible layers (Gemini's, and occasionally minimax) answer in
// prose or a fenced JSON block instead of emitting a tool call. Recover the
// object rather than losing the whole diagnosis.
export function parseFallbackContent(content) {
  const text = String(content || '')
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  if (!candidate.trim()) return null
  try {
    const parsed = JSON.parse(candidate)
    return parsed && typeof parsed === 'object' && parsed.rootCause ? parsed : null
  } catch {
    return null
  }
}

export async function diagnose(cfg, prompt) {
  const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL })
  const res = await client.chat.completions.create({
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    messages: [{ role: 'user', content: prompt }],
    tools: [{ type: 'function', function: { name: TOOL_NAME, description: 'Report the CI failure diagnosis.', parameters: DIAGNOSIS_SCHEMA } }],
    tool_choice: cfg.toolChoice || { type: 'function', function: { name: TOOL_NAME } },
  })
  const message = res.choices?.[0]?.message
  const call = message?.tool_calls?.[0]
  if (call) return { raw: JSON.parse(call.function.arguments), usage: res.usage }

  const recovered = parseFallbackContent(message?.content)
  if (recovered) return { raw: recovered, usage: res.usage }
  throw new Error('OpenAI-compatible provider returned no tool call')
}
