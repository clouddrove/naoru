import OpenAI from 'openai'
import { DIAGNOSIS_SCHEMA } from '../prompt.js'

export async function diagnose(cfg, prompt) {
  const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL })
  const res = await client.chat.completions.create({
    model: cfg.model,
    messages: [{ role: 'user', content: prompt }],
    tools: [{ type: 'function', function: { name: 'report_diagnosis', description: 'Report the CI failure diagnosis.', parameters: DIAGNOSIS_SCHEMA } }],
    tool_choice: { type: 'function', function: { name: 'report_diagnosis' } },
  })
  const call = res.choices?.[0]?.message?.tool_calls?.[0]
  if (!call) throw new Error('OpenAI-compatible provider returned no tool call')
  return JSON.parse(call.function.arguments)
}
