import { MARKER } from './parse.js'

const ANSI = /\[[0-9;]*m/g

export function tailAndClean(text, maxLines) {
  const clean = String(text || '').replace(ANSI, '')
  const lines = clean.split('\n')
  return lines.slice(-maxLines).join('\n')
}

export function findStickyComment(comments) {
  const hit = (comments || []).find((c) => (c.body || '').includes(MARKER))
  return hit ? hit.id : null
}

// Fetch tailed logs for the failed run. octokit is an authenticated client.
export async function fetchLogs(octokit, { owner, repo, runId, maxLines }) {
  try {
    const res = await octokit.rest.actions.downloadWorkflowRunLogs({ owner, repo, run_id: runId })
    // res.data is a zip buffer; flatten any text we can read.
    const text = Buffer.from(res.data).toString('utf8')
    return tailAndClean(text, maxLines)
  } catch (e) {
    return `(could not fetch logs: ${e.message})`
  }
}

export async function fetchPrDiff(octokit, { owner, repo, prNumber }) {
  try {
    const res = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber, mediaType: { format: 'diff' } })
    const files = await octokit.rest.pulls.listFiles({ owner, repo, pull_number: prNumber })
    return { diff: res.data, files: files.data.map((f) => f.filename) }
  } catch (e) {
    return { diff: `(could not fetch diff: ${e.message})`, files: [] }
  }
}

export async function upsertComment(octokit, { owner, repo, prNumber, body }) {
  const existing = await octokit.rest.issues.listComments({ owner, repo, issue_number: prNumber })
  const id = findStickyComment(existing.data)
  if (id) {
    const res = await octokit.rest.issues.updateComment({ owner, repo, comment_id: id, body })
    return res.data.html_url
  }
  const res = await octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body })
  return res.data.html_url
}
