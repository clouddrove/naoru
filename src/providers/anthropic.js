import Anthropic from '@anthropic-ai/sdk'
import { DIAGNOSIS_SCHEMA } from '../prompt.js'

export async function diagnose(cfg, prompt) {
  const client = new Anthropic({ apiKey: cfg.apiKey })
  const res = await client.messages.create({
    model: cfg.model,
    max_tokens: 1024,
    tools: [{ name: 'report_diagnosis', description: 'Report the CI failure diagnosis.', input_schema: DIAGNOSIS_SCHEMA }],
    tool_choice: { type: 'tool', name: 'report_diagnosis' },
    messages: [{ role: 'user', content: prompt }],
  })
  const block = res.content.find((b) => b.type === 'tool_use')
  if (!block) throw new Error('Anthropic returned no tool_use block')
  return block.input
}
