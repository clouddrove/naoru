import { readFileSync } from 'node:fs'
import { getOctokit } from '@actions/github'
import { diagnose } from './core.js'
import { tailAndClean, upsertComment } from './github.js'

export function parseArgs(argv, env) {
  const flags = {}
  for (let i = 0; i < argv.length; i += 2) flags[argv[i].replace(/^--/, '')] = argv[i + 1]
  return {
    apiKey: flags['api-key'] || env.NAORU_API_KEY,
    provider: flags.provider || env.NAORU_PROVIDER || 'anthropic',
    model: flags.model || env.NAORU_MODEL,
    baseURL: flags['base-url'] || env.NAORU_BASE_URL,
    logFile: flags['log-file'] || env.NAORU_LOG_FILE,
    diffFile: flags['diff-file'] || env.NAORU_DIFF_FILE,
    jobName: flags['job-name'] || env.NAORU_JOB_NAME || 'pipeline',
    maxLines: parseInt(flags['max-log-lines'] || env.NAORU_MAX_LOG_LINES || '500', 10),
    githubToken: flags['github-token'] || env.GITHUB_TOKEN,
    repo: flags.repo,
    pr: flags.pr ? parseInt(flags.pr, 10) : undefined,
  }
}

function readStdin() {
  try { return readFileSync(0, 'utf8') } catch { return '' }
}

async function run() {
  const a = parseArgs(process.argv.slice(2), process.env)
  if (!a.apiKey) { console.error('naoru: missing --api-key / NAORU_API_KEY'); return }

  const rawLogs = a.logFile ? readFileSync(a.logFile, 'utf8') : readStdin()
  const logs = tailAndClean(rawLogs, a.maxLines)
  const diff = a.diffFile ? readFileSync(a.diffFile, 'utf8') : ''

  const { diagnosis, markdown } = await diagnose({
    provider: a.provider, apiKey: a.apiKey, baseURL: a.baseURL, model: a.model,
    jobName: a.jobName, logs, diff, files: [],
  })

  console.log(markdown)

  if (a.repo && a.pr && a.githubToken) {
    const [owner, repo] = a.repo.split('/')
    const url = await upsertComment(getOctokit(a.githubToken), { owner, repo, prNumber: a.pr, body: markdown })
    console.error(`naoru: comment posted → ${url}`)
  }
  void diagnosis
}

// Only auto-run as a real CLI, not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith('cli.js')) {
  run().catch((e) => { console.error(`naoru: ${e.message}`) }) // fail-safe, exit 0
}
