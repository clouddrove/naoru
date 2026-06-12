import * as core from '@actions/core'
import * as github from '@actions/github'
import { diagnose } from './core.js'
import { fetchLogs, fetchPrDiff, upsertComment } from './github.js'

async function run() {
  const apiKey = core.getInput('api-key', { required: true })
  const provider = core.getInput('provider') || 'anthropic'
  const baseURL = core.getInput('base-url') || undefined
  const model = core.getInput('model') || undefined
  const token = core.getInput('github-token') || process.env.GITHUB_TOKEN
  const maxLines = parseInt(core.getInput('max-log-lines') || '500', 10)
  const jobName = core.getInput('failed-job-name') || github.context.job || 'unknown'

  const octokit = github.getOctokit(token)
  const { owner, repo } = github.context.repo
  const prNumber = github.context.payload.pull_request?.number
  if (!prNumber) {
    core.warning('naoru: no pull request in context; skipping.')
    return
  }
  const runId = github.context.runId

  const logs = await fetchLogs(octokit, { owner, repo, runId, maxLines })
  const { diff, files } = await fetchPrDiff(octokit, { owner, repo, prNumber })

  const { diagnosis, markdown } = await diagnose({ provider, apiKey, baseURL, model, jobName, logs, diff, files })
  const url = await upsertComment(octokit, { owner, repo, prNumber, body: markdown })

  core.setOutput('root-cause', diagnosis.rootCause)
  core.setOutput('confidence', diagnosis.confidence)
  core.setOutput('comment-url', url)
}

run().catch((e) => {
  // Fail-safe: never fail the build; surface as a warning annotation.
  core.warning(`naoru failed to diagnose: ${e.message}`)
})
