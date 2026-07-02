import { describe, it, expect, vi } from 'vitest'
import { parseDiff, applyHunks, locateHunk, validateFix, postSuggestions, openFixPr } from '../src/fix.js'

const DIFF = [
  '--- a/Dockerfile',
  '+++ b/Dockerfile',
  '@@ -1,4 +1,3 @@',
  ' WORKDIR /app',
  ' COPY . .',
  '-COPY missing-file.txt /app/',
  ' CMD ["node", "app.js"]',
].join('\n')

describe('parseDiff', () => {
  it('parses files and hunks, stripping a/b prefixes', () => {
    const files = parseDiff(DIFF)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('Dockerfile')
    expect(files[0].hunks[0].lines.filter((l) => l.op === '-')).toHaveLength(1)
  })
  it('tolerates prose around the diff and missing diff --git headers', () => {
    const files = parseDiff(`Remove the line. For example:\n${DIFF}\nThat fixes it.`)
    expect(files).toHaveLength(1)
  })
  it('drops files with no actual changes and returns [] for garbage', () => {
    expect(parseDiff('not a diff at all')).toEqual([])
    expect(parseDiff('')).toEqual([])
  })
})

describe('applyHunks / locateHunk', () => {
  const content = 'WORKDIR /app\nCOPY . .\nCOPY missing-file.txt /app/\nCMD ["node", "app.js"]'
  it('applies a deletion hunk by context match', () => {
    const [file] = parseDiff(DIFF)
    expect(applyHunks(content, file.hunks)).toBe('WORKDIR /app\nCOPY . .\nCMD ["node", "app.js"]')
  })
  it('throws when context is missing', () => {
    const [file] = parseDiff(DIFF)
    expect(() => applyHunks('completely different file', file.hunks)).toThrow(/not found/)
  })
  it('refuses ambiguous matches', () => {
    const hunk = { lines: [{ op: '-', text: 'dup' }, { op: '+', text: 'fixed' }] }
    expect(locateHunk(['dup', 'x', 'dup'], hunk)).toBeNull()
  })
})

describe('validateFix', () => {
  it('rejects empty, protected paths, traversal, and oversized diffs', () => {
    expect(validateFix([])).toMatch(/no parsable/)
    expect(validateFix(parseDiff('--- a/.github/workflows/ci.yml\n+++ b/.github/workflows/ci.yml\n@@\n-a\n+b'))).toMatch(/protected/)
    const big = parseDiff(DIFF)
    expect(validateFix(big, { maxChangedLines: 0 })).toMatch(/too large/)
    expect(validateFix(big)).toBeNull()
  })
})

function mockOctokit(content) {
  return {
    rest: {
      repos: {
        getContent: vi.fn().mockResolvedValue({
          data: { type: 'file', content: Buffer.from(content).toString('base64') },
        }),
      },
      pulls: {
        createReviewComment: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({ data: { html_url: 'https://x/pr/9', number: 9 } }),
      },
      git: {
        getCommit: vi.fn().mockResolvedValue({ data: { tree: { sha: 't0' } } }),
        createTree: vi.fn().mockResolvedValue({ data: { sha: 't1' } }),
        createCommit: vi.fn().mockResolvedValue({ data: { sha: 'c1' } }),
        createRef: vi.fn().mockResolvedValue({}),
      },
      issues: { addLabels: vi.fn().mockResolvedValue({}) },
    },
  }
}

const content = 'WORKDIR /app\nCOPY . .\nCOPY missing-file.txt /app/\nCMD ["node", "app.js"]'

describe('postSuggestions', () => {
  it('anchors a multi-line suggestion to the hunk lines', async () => {
    const octokit = mockOctokit(content)
    const posted = await postSuggestions(octokit, {
      owner: 'o', repo: 'r', prNumber: 1, headSha: 'h', files: parseDiff(DIFF),
    })
    expect(posted).toBe(1)
    const call = octokit.rest.pulls.createReviewComment.mock.calls[0][0]
    expect(call.path).toBe('Dockerfile')
    expect(call.start_line).toBe(1)
    expect(call.line).toBe(4)
    expect(call.body).toContain('```suggestion')
    expect(call.body).not.toContain('missing-file.txt')
  })
  it('skips (not throws) when the API rejects a comment', async () => {
    const octokit = mockOctokit(content)
    octokit.rest.pulls.createReviewComment.mockRejectedValue(new Error('422'))
    const warn = vi.fn()
    const posted = await postSuggestions(octokit, {
      owner: 'o', repo: 'r', prNumber: 1, headSha: 'h', files: parseDiff(DIFF), warn,
    })
    expect(posted).toBe(0)
    expect(warn).toHaveBeenCalled()
  })
})

describe('openFixPr', () => {
  it('creates branch from head sha and opens a PR against the failing branch', async () => {
    const octokit = mockOctokit(content)
    const url = await openFixPr(octokit, {
      owner: 'o', repo: 'r', prNumber: 1, runId: 42, headRef: 'feature-x', headSha: 'h',
      files: parseDiff(DIFF),
      diagnosis: { rootCause: 'missing file', suggestedFix: 'remove the COPY line' },
    })
    expect(url).toBe('https://x/pr/9')
    expect(octokit.rest.git.createRef.mock.calls[0][0].ref).toBe('refs/heads/naoru/fix-42')
    const pr = octokit.rest.pulls.create.mock.calls[0][0]
    expect(pr.base).toBe('feature-x')
    expect(pr.head).toBe('naoru/fix-42')
    expect(octokit.rest.issues.addLabels).toHaveBeenCalled()
  })
})
