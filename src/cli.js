import { readFileSync } from 'node:fs'
import { getOctokit } from '@actions/github'
import { diagnose } from './core.js'
import { tailAndClean, upsertComment } from './github.js'
import { parsePatternList } from './redact.js'
import { formatUsage } from './usage.js'

// `--flag=value` as well as `--flag value`.
function splitFlag(rest) {
  const eq = rest.indexOf('=')
  return eq === -1 ? [rest, undefined] : [rest.slice(0, eq), rest.slice(eq + 1)]
}

export function parseArgs(argv, env) {
  const flags = {}
  // Walk one token at a time: a bare boolean flag used to consume the next
  // token as its value and desync every flag after it.
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const [name, inline] = splitFlag(token.slice(2))
    if (inline !== undefined) { flags[name] = inline; continue }
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) flags[name] = true
    else { flags[name] = next; i++ }
  }
  return {
    apiKey: flags['api-key'] || env.NAORU_API_KEY,
    provider: flags.provider || env.NAORU_PROVIDER || 'anthropic',
    model: flags.model || env.NAORU_MODEL,
    baseURL: flags['base-url'] || env.NAORU_BASE_URL,
    logFile: flags['log-file'] || env.NAORU_LOG_FILE,
    diffFile: flags['diff-file'] || env.NAORU_DIFF_FILE,
    jobName: flags['job-name'] || env.NAORU_JOB_NAME || 'pipeline',
    instructions: flags.prompt || env.NAORU_PROMPT,
    maxLines: parseInt(flags['max-log-lines'] || env.NAORU_MAX_LOG_LINES || '500', 10),
    maxTokens: parseInt(flags['max-tokens'] || env.NAORU_MAX_TOKENS || '0', 10),
    redactPatterns: parsePatternList(flags['redact-patterns'] || env.NAORU_REDACT_PATTERNS),
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

  const { diagnosis, usage, model, markdown } = await diagnose({
    provider: a.provider, apiKey: a.apiKey, baseURL: a.baseURL, model: a.model,
    maxTokens: a.maxTokens, jobName: a.jobName, logs, diff, files: [],
    instructions: a.instructions, redactPatterns: a.redactPatterns,
  })

  console.log(markdown)
  // Cost goes to stderr so `naoru > diagnosis.md` stays clean.
  const cost = formatUsage(usage, model)
  if (cost) console.error(`naoru: ${cost}`)

  if (a.repo && a.pr && a.githubToken) {
    const [owner, repo] = a.repo.split('/')
    const url = await upsertComment(getOctokit(a.githubToken), { owner, repo, prNumber: a.pr, body: markdown })
    console.error(`naoru: comment posted → ${url}`)
  }
  void diagnosis
}

// Only auto-run as a real CLI, not when imported by tests.
// Source entry is cli.js; the ncc bundle is emitted as index.js, so match both.
const entry = process.argv[1] || ''
if (entry.endsWith('cli.js') || entry.endsWith('dist-cli/index.js') || entry.endsWith('dist-cli\\index.js')) {
  run().catch((e) => { console.error(`naoru: ${e.message}`) }) // fail-safe, exit 0
}
