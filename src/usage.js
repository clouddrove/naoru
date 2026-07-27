// Token accounting. Anthropic reports input_tokens/output_tokens; the
// OpenAI-compatible shape reports prompt_tokens/completion_tokens. Some
// compat layers report neither — an unknown count is null, never a fake 0.

export function normalizeUsage(raw) {
  const input = raw?.input_tokens ?? raw?.prompt_tokens ?? null
  const output = raw?.output_tokens ?? raw?.completion_tokens ?? null
  const total = raw?.total_tokens ?? (input == null && output == null ? null : (input || 0) + (output || 0))
  return { input, output, total }
}

export function formatUsage(usage, model) {
  if (!usage || usage.total == null) return ''
  const parts = []
  if (usage.input != null) parts.push(`${usage.input.toLocaleString('en-US')} in`)
  if (usage.output != null) parts.push(`${usage.output.toLocaleString('en-US')} out`)
  const breakdown = parts.length ? ` (${parts.join(' / ')})` : ''
  return `${usage.total.toLocaleString('en-US')} tokens${breakdown}${model ? ` · \`${model}\`` : ''}`
}
