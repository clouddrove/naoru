// Auto-fix: turn the diagnosed diff into PR review suggestions or a fix PR.

export const FIX_BRANCH_PREFIX = 'naoru/fix-'
export const FIX_LABEL = 'naoru-fix'

// Workflow files are attacker-reachable via log content (prompt injection);
// never let a generated diff touch them.
const PROTECTED_PATH = /^\.github\//

// Parse a unified diff into per-file hunks. Tolerates model sloppiness:
// missing `diff --git` headers, `a/`/`b/` prefixes optional, prose between files.
export function parseDiff(text) {
  const files = []
  let file = null
  let hunk = null
  for (const line of String(text || '').split('\n')) {
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).trim().replace(/^b\//, '')
      file = p && p !== '/dev/null' ? { path: p, hunks: [] } : null
      if (file) files.push(file)
      hunk = null
    } else if (line.startsWith('--- ')) {
      hunk = null
    } else if (line.startsWith('@@')) {
      hunk = file ? { lines: [] } : null
      if (hunk) file.hunks.push(hunk)
    } else if (hunk && (line === '' || / |\+|-/.test(line[0]))) {
      // Blank lines inside a hunk are context lines whose leading space got eaten.
      hunk.lines.push(line === '' ? { op: ' ', text: '' } : { op: line[0], text: line.slice(1) })
    } else {
      hunk = null
    }
  }
  return files.filter((f) => f.hunks.length && f.hunks.some((h) => h.lines.some((l) => l.op !== ' ')))
}

// Find `needle` as a contiguous slice of `hay`, ignoring trailing whitespace.
function findLines(hay, needle, from = 0) {
  if (!needle.length) return -1
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j].trimEnd() !== needle[j].trimEnd()) continue outer
    }
    return i
  }
  return -1
}

// Locate a hunk in `lines` by its old (context + removed) lines.
// Returns { index, oldLines, newLines } or null. Uses content matching, not the
// hunk header offsets — model-generated line numbers are unreliable.
export function locateHunk(lines, hunk) {
  const oldLines = hunk.lines.filter((l) => l.op !== '+').map((l) => l.text)
  const newLines = hunk.lines.filter((l) => l.op !== '-').map((l) => l.text)
  const index = findLines(lines, oldLines)
  if (index < 0) return null
  // Ambiguous match → refuse rather than patch the wrong spot.
  if (findLines(lines, oldLines, index + 1) >= 0) return null
  return { index, oldLines, newLines }
}

// Apply every hunk to `content`. Throws if any hunk can't be placed uniquely.
export function applyHunks(content, hunks) {
  let lines = String(content).split('\n')
  for (const hunk of hunks) {
    const loc = locateHunk(lines, hunk)
    if (!loc) throw new Error('hunk context not found (or ambiguous) in file')
    lines.splice(loc.index, loc.oldLines.length, ...loc.newLines)
  }
  return lines.join('\n')
}

// Sanity-gate a parsed diff before acting on it. Returns an error string or null.
export function validateFix(files, { maxChangedLines = 300 } = {}) {
  if (!files.length) return 'no parsable file changes in the diagnosed diff'
  const bad = files.find((f) => PROTECTED_PATH.test(f.path) || f.path.includes('..'))
  if (bad) return `refusing to modify protected path: ${bad.path}`
  const changed = files.reduce(
    (n, f) => n + f.hunks.reduce((m, h) => m + h.lines.filter((l) => l.op !== ' ').length, 0),
    0,
  )
  if (changed > maxChangedLines) return `diff too large (${changed} changed lines > ${maxChangedLines})`
  return null
}

async function getFileText(octokit, { owner, repo, path, ref }) {
  const res = await octokit.rest.repos.getContent({ owner, repo, path, ref })
  if (Array.isArray(res.data) || res.data.type !== 'file') throw new Error(`${path} is not a file`)
  return Buffer.from(res.data.content, 'base64').toString('utf8')
}

// Post GitHub-native ```suggestion review comments — one per hunk, anchored to
// the lines the hunk replaces on the PR head. Skips hunks whose lines are not
// part of the PR diff (the API 422s); the sticky comment still carries the diff.
export async function postSuggestions(octokit, { owner, repo, prNumber, headSha, files, warn = () => {} }) {
  let posted = 0
  for (const file of files) {
    let text
    try {
      text = await getFileText(octokit, { owner, repo, path: file.path, ref: headSha })
    } catch (e) {
      warn(`naoru fix: cannot read ${file.path}: ${e.message}`)
      continue
    }
    const lines = text.split('\n')
    for (const hunk of file.hunks) {
      const loc = locateHunk(lines, hunk)
      if (!loc) {
        warn(`naoru fix: could not locate hunk in ${file.path}; skipping suggestion`)
        continue
      }
      const startLine = loc.index + 1
      const endLine = loc.index + loc.oldLines.length
      const body = ['naoru suggested fix:', '```suggestion', ...loc.newLines, '```'].join('\n')
      try {
        await octokit.rest.pulls.createReviewComment({
          owner, repo, pull_number: prNumber,
          commit_id: headSha,
          path: file.path,
          body,
          side: 'RIGHT',
          line: endLine,
          ...(endLine > startLine ? { start_line: startLine, start_side: 'RIGHT' } : {}),
        })
        posted++
      } catch (e) {
        warn(`naoru fix: suggestion on ${file.path}:${startLine}-${endLine} rejected: ${e.message}`)
      }
    }
  }
  return posted
}

// Apply the diff on a new `naoru/fix-<runId>` branch (via the git data API — no
// checkout needed) and open a PR targeting the failing branch. Never pushes to
// the failing branch itself.
export async function openFixPr(octokit, { owner, repo, prNumber, runId, headRef, headSha, files, diagnosis, warn = () => {} }) {
  const updated = []
  for (const file of files) {
    const text = await getFileText(octokit, { owner, repo, path: file.path, ref: headSha })
    updated.push({ path: file.path, content: applyHunks(text, file.hunks) })
  }

  const { data: headCommit } = await octokit.rest.git.getCommit({ owner, repo, commit_sha: headSha })
  const { data: tree } = await octokit.rest.git.createTree({
    owner, repo,
    base_tree: headCommit.tree.sha,
    tree: updated.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })),
  })
  const { data: commit } = await octokit.rest.git.createCommit({
    owner, repo,
    message: `fix: ${diagnosis.rootCause}\n\nAutomated fix proposed by naoru for PR #${prNumber}.`,
    tree: tree.sha,
    parents: [headSha],
  })
  const branch = `${FIX_BRANCH_PREFIX}${runId}`
  await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: commit.sha })

  const { data: pr } = await octokit.rest.pulls.create({
    owner, repo,
    base: headRef,
    head: branch,
    title: `fix: ${diagnosis.rootCause}`.slice(0, 250),
    body: [
      `Automated fix proposed by **naoru** for #${prNumber}.`,
      '',
      `**Root cause:** ${diagnosis.rootCause}`,
      '',
      `**Suggested fix:**`,
      diagnosis.suggestedFix,
      '',
      'Review carefully before merging — this patch was machine-generated from the failure diagnosis.',
    ].join('\n'),
  })
  try {
    await octokit.rest.issues.addLabels({ owner, repo, issue_number: pr.number, labels: [FIX_LABEL] })
  } catch (e) {
    warn(`naoru fix: could not label fix PR: ${e.message}`)
  }
  return pr.html_url
}
