// toolChoice defaults to forcing report_diagnosis. Gemini's OpenAI-compat layer
// documents only tool_choice: "auto" — the forced object form is not supported
// there — so gemini asks instead of forces, and openai.js falls back to reading
// the JSON out of the message content when no tool call comes back.
const PRESETS = {
  anthropic: { kind: 'anthropic', model: 'claude-sonnet-4-6' },
  openai:     { kind: 'openai', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' },
  gemini:     { kind: 'openai', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.6-flash', toolChoice: 'auto' },
  openrouter: { kind: 'openai', baseURL: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o' },
  xai:        { kind: 'openai', baseURL: 'https://api.x.ai/v1', model: 'grok-2' },
  groq:       { kind: 'openai', baseURL: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  custom:     { kind: 'openai' },
}

// 1024 truncated long diffs mid-hunk, which parseDiff then rejected and
// fix-mode silently skipped.
export const DEFAULT_MAX_TOKENS = 2048

export function resolveProvider({ provider = 'anthropic', apiKey, baseURL, model, maxTokens }) {
  const preset = PRESETS[provider]
  if (!preset) throw new Error(`Unknown provider: ${provider}`)
  if (!apiKey) throw new Error('api-key is required')
  const resolvedBaseURL = baseURL || preset.baseURL
  if (provider === 'custom' && !resolvedBaseURL) throw new Error('base-url is required when provider is "custom"')
  return {
    kind: preset.kind,
    apiKey,
    baseURL: resolvedBaseURL,
    model: model || preset.model,
    maxTokens: maxTokens > 0 ? maxTokens : DEFAULT_MAX_TOKENS,
    toolChoice: preset.toolChoice,
  }
}
