import * as core from '@actions/core'
import * as github from '@actions/github'
import { diagnose } from './core.js'
import { fetchLogs, fetchPrDiff, upsertComment } from './github.js'
import { parseDiff, validateFix, postSuggestions, openFixPr, FIX_BRANCH_PREFIX } from './fix.js'

async function run() {
  const apiKey = core.getInput('api-key', { required: true })
  const provider = core.getInput('provider') || 'anthropic'
  const baseURL = core.getInput('base-url') || undefined
  const model = core.getInput('model') || undefined
  const token = core.getInput('github-token') || process.env.GITHUB_TOKEN
  const maxLines = parseInt(core.getInput('max-log-lines') || '500', 10)
  const jobName = core.getInput('failed-job-name') || github.context.job || 'unknown'
  const fixMode = (core.getInput('fix-mode') || 'off').toLowerCase()

  const octokit = github.getOctokit(token)
  const { owner, repo } = github.context.repo
  const prNumber = github.context.payload.pull_request?.number
  const runId = github.context.runId

  const logs = await fetchLogs(octokit, { owner, repo, runId, jobName, maxLines })
  // PR diff only exists in a pull_request context; dispatch/schedule runs have none.
  const { diff, files } = prNumber
    ? await fetchPrDiff(octokit, { owner, repo, prNumber })
    : { diff: '', files: [] }

  const { diagnosis, markdown } = await diagnose({ provider, apiKey, baseURL, model, jobName, logs, diff, files })

  // Always surface the diagnosis in the run's Step Summary — works with or without a PR.
  await core.summary.addRaw(markdown).write()

  core.setOutput('root-cause', diagnosis.rootCause)
  core.setOutput('confidence', diagnosis.confidence)

  // When triggered on a PR, also post/refresh the sticky comment.
  if (prNumber) {
    const url = await upsertComment(octokit, { owner, repo, prNumber, body: markdown })
    core.setOutput('comment-url', url)
  }

  if (prNumber && fixMode !== 'off') {
    await maybeFix(octokit, { owner, repo, prNumber, runId, fixMode, diagnosis })
  }
}

// Fix modes: 'suggest' posts ```suggestion review comments; 'pr' opens a fix PR
// against the failing branch. Both act only on high-confidence diagnoses that
// include a diff, and never on naoru's own fix branches (loop guard).
async function maybeFix(octokit, { owner, repo, prNumber, runId, fixMode, diagnosis }) {
  try {
    const head = github.context.payload.pull_request.head
    if (head.ref.startsWith(FIX_BRANCH_PREFIX)) {
      core.notice('naoru fix: skipping — already on a naoru fix branch')
      return
    }
    if (diagnosis.confidence !== 'high') {
      core.notice(`naoru fix: skipping (confidence is "${diagnosis.confidence}"; fixes act only on high-confidence diagnoses)`)
      return
    }
    if (!diagnosis.diff) {
      core.notice('naoru fix: skipping (the diagnosis has no diff; the model returned prose only, so there is nothing to apply)')
      return
    }
    const files = parseDiff(diagnosis.diff)
    const invalid = validateFix(files)
    if (invalid) {
      core.notice(`naoru fix: skipping (${invalid})`)
      if (!files.length) {
        core.info(`naoru fix: the diagnosed diff could not be parsed. Raw diff follows:\n${diagnosis.diff}`)
      }
      return
    }
    if (fixMode === 'suggest') {
      const posted = await postSuggestions(octokit, {
        owner, repo, prNumber, headSha: head.sha, files, warn: core.warning,
      })
      core.notice(`naoru fix: posted ${posted} suggestion(s)`)
    } else if (fixMode === 'pr') {
      const url = await openFixPr(octokit, {
        owner, repo, prNumber, runId, headRef: head.ref, headSha: head.sha, files, diagnosis, warn: core.warning,
      })
      core.setOutput('fix-pr-url', url)
      core.notice(`naoru fix: opened ${url}`)
    } else {
      core.warning(`naoru fix: unknown fix-mode "${fixMode}" (use off | suggest | pr)`)
    }
  } catch (e) {
    // Fail-safe: fixing is best-effort; the diagnosis already shipped.
    core.warning(`naoru fix failed: ${e.message}`)
  }
}

run().catch((e) => {
  // Fail-safe: never fail the build; surface as a warning annotation.
  core.warning(`naoru failed to diagnose: ${e.message}`)
})
