export const MARKER = '<!-- naoru -->'

const LEVELS = ['high', 'medium', 'low']

const FENCE_RE = /```[^\n`]*\n?([\s\S]*?)(?:```|$)/

function stripFence(s) {
  return s.replace(/^```[^\n`]*\n?/, '').replace(/\n?```\s*$/, '').trim()
}

export function normalize(raw) {
  const conf = String(raw?.confidence || '').toLowerCase()
  let suggestedFix = String(raw?.suggestedFix || 'No fix suggested.').trim()
  let diff = stripFence(String(raw?.diff || '').trim())

  // Models sometimes embed a fenced block inside the prose, even mid-sentence,
  // which breaks GitHub markdown. Pull the first block out into `diff` and drop
  // any leftover fence markers so the prose renders clean.
  const m = suggestedFix.match(FENCE_RE)
  if (m) {
    if (!diff) diff = m[1].trim()
    suggestedFix = suggestedFix.replace(FENCE_RE, '').replace(/```[^\n`]*/g, '').trim()
    if (!suggestedFix) suggestedFix = 'See diff below.'
  }

  return {
    rootCause: String(raw?.rootCause || 'Unknown').trim(),
    suggestedFix,
    diff,
    confidence: LEVELS.includes(conf) ? conf : 'low',
    files: Array.isArray(raw?.files) ? raw.files.filter(Boolean).map(String) : [],
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
    ...(d.diff ? ['', '```diff', d.diff, '```'] : []),
    '',
    `**Confidence:** ${conf} · _react 👍 / 👎_`,
  ].join('\n')
}
