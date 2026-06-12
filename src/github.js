import AdmZip from 'adm-zip'
import { MARKER } from './parse.js'

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g
// GitHub prefixes every log line with an ISO-8601 timestamp; strip it to cut noise/tokens.
const LOG_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s/

export function tailAndClean(text, maxLines) {
  const clean = String(text || '').replace(ANSI, '')
  const lines = clean.split('\n')
  return lines.slice(-maxLines).join('\n')
}

// The run-logs download is a ZIP of per-job/per-step .txt files. Pull out the text,
// prefer entries belonging to the failed job, strip per-line timestamps, then tail.
export function extractLogsFromZip(buffer, jobName, maxLines) {
  const zip = new AdmZip(Buffer.from(buffer))
  const entries = zip.getEntries().filter((e) => !e.isDirectory && e.entryName.endsWith('.txt'))
  let picked = entries
  if (jobName) {
    const match = entries.filter((e) => e.entryName.toLowerCase().includes(jobName.toLowerCase()))
    if (match.length) picked = match
  }
  const text = picked
    .map((e) => e.getData().toString('utf8'))
    .join('\n')
    .split('\n')
    .map((l) => l.replace(LOG_TIMESTAMP, ''))
    .join('\n')
  return tailAndClean(text, maxLines)
}

export function findStickyComment(comments) {
  const hit = (comments || []).find((c) => (c.body || '').includes(MARKER))
  return hit ? hit.id : null
}

// Fetch tailed logs for the failed run. octokit is an authenticated client.
export async function fetchLogs(octokit, { owner, repo, runId, jobName, maxLines }) {
  try {
    const res = await octokit.rest.actions.downloadWorkflowRunLogs({ owner, repo, run_id: runId })
    return extractLogsFromZip(res.data, jobName, maxLines)
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
