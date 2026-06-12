const PRESETS = {
  anthropic: { kind: 'anthropic', model: 'claude-sonnet-4-6' },
  openai:     { kind: 'openai', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' },
  openrouter: { kind: 'openai', baseURL: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o' },
  xai:        { kind: 'openai', baseURL: 'https://api.x.ai/v1', model: 'grok-2' },
  groq:       { kind: 'openai', baseURL: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  custom:     { kind: 'openai' },
}

export function resolveProvider({ provider = 'anthropic', apiKey, baseURL, model }) {
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
  }
}
