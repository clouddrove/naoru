export const MARKER = '<!-- naoru -->'

const LEVELS = ['high', 'medium', 'low']

export function normalize(raw) {
  const conf = String(raw?.confidence || '').toLowerCase()
  return {
    rootCause: String(raw?.rootCause || 'Unknown').trim(),
    suggestedFix: String(raw?.suggestedFix || 'No fix suggested.').trim(),
    confidence: LEVELS.includes(conf) ? conf : 'low',
    files: Array.isArray(raw?.files) ? raw.files.map(String) : [],
  }
}

export function toMarkdown(jobName, d) {
  const conf = d.confidence.charAt(0).toUpperCase() + d.confidence.slice(1)
  return [
    '## 🩺 naoru',
    MARKER,
    `**Failed job:** \`${jobName}\``,
    '',
    `**Root cause:** ${d.rootCause}`,
    '',
    `**Suggested fix:**`,
    d.suggestedFix,
    '',
    `**Confidence:** ${conf} · _react 👍 / 👎_`,
  ].join('\n')
}
