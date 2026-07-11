import { describe, it, expect, vi } from 'vitest'
import { parseDiff, applyHunks, applyHunksPartial, locateHunk, validateFix, postSuggestions, openFixPr } from '../src/fix.js'

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
  it('parses a diff --git header with no ---/+++ lines', () => {
    const files = parseDiff([
      'diff --git a/Dockerfile b/Dockerfile',
      '@@ -1,2 +1,1 @@',
      ' WORKDIR /app',
      '-COPY missing-file.txt /app/',
    ].join('\n'))
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('Dockerfile')
    expect(files[0].hunks).toHaveLength(1)
  })
  it('does not duplicate a file when diff --git is followed by ---/+++ headers', () => {
    const files = parseDiff(`diff --git a/Dockerfile b/Dockerfile\n${DIFF}`)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('Dockerfile')
    expect(files[0].hunks).toHaveLength(1)
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
  it('matches when model diff loses indentation', () => {
    const hunk = {
      lines: [
        { op: ' ', text: 'containers:' },
        { op: '-', text: 'image: nginx' },
        { op: '+', text: 'image: nginx:1.27' },
      ],
    }
    const lines = ['spec:', '  containers:', '    image: nginx']
    const loc = locateHunk(lines, hunk)
    expect(loc).not.toBeNull()
    expect(loc.index).toBe(1)
  })
  it('applyHunksPartial applies locatable hunks and reports the rest', () => {
    const [file] = parseDiff(DIFF)
    const bogus = { lines: [{ op: '-', text: 'line that does not exist' }, { op: '+', text: 'replacement' }] }
    const { content: out, applied, failed } = applyHunksPartial(content, [...file.hunks, bogus])
    expect(out).toBe('WORKDIR /app\nCOPY . .\nCMD ["node", "app.js"]')
    expect(applied).toBe(1)
    expect(failed).toEqual([2])
  })
  it('falls back to removed-lines-only when model context is invented', () => {
    const hunk = {
      lines: [
        { op: ' ', text: 'this context does not exist' },
        { op: '-', text: 'COPY missing-file.txt /app/' },
        { op: '+', text: 'COPY real-file.txt /app/' },
      ],
    }
    const lines = ['FROM node', 'COPY missing-file.txt /app/', 'CMD ["node"]']
    const loc = locateHunk(lines, hunk)
    expect(loc).not.toBeNull()
    expect(loc.index).toBe(1)
    expect(loc.oldLines).toEqual(['COPY missing-file.txt /app/'])
    expect(loc.newLines).toEqual(['COPY real-file.txt /app/'])
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
  it('opens a partial PR when only some hunks apply, warning about the rest', async () => {
    const octokit = mockOctokit(content)
    const warn = vi.fn()
    const files = parseDiff(DIFF)
    files[0].hunks.push({ lines: [{ op: '-', text: 'nonexistent line' }, { op: '+', text: 'x' }] })
    const url = await openFixPr(octokit, {
      owner: 'o', repo: 'r', prNumber: 1, runId: 42, headRef: 'feature-x', headSha: 'h',
      files, warn,
      diagnosis: { rootCause: 'missing file', suggestedFix: 'remove the COPY line' },
    })
    expect(url).toBe('https://x/pr/9')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not locate hunk(s) 2'))
    const tree = octokit.rest.git.createTree.mock.calls[0][0]
    expect(tree.tree[0].content).toBe('WORKDIR /app\nCOPY . .\nCMD ["node", "app.js"]')
  })
  it('throws when no hunk in any file can be applied', async () => {
    const octokit = mockOctokit('completely unrelated content')
    const warn = vi.fn()
    await expect(openFixPr(octokit, {
      owner: 'o', repo: 'r', prNumber: 1, runId: 42, headRef: 'feature-x', headSha: 'h',
      files: parseDiff(DIFF), warn,
      diagnosis: { rootCause: 'x', suggestedFix: 'y' },
    })).rejects.toThrow(/no hunk of the diagnosed diff could be applied/)
    expect(octokit.rest.pulls.create).not.toHaveBeenCalled()
  })
  it('skips unreadable files but still fixes readable ones', async () => {
    const octokit = mockOctokit(content)
    octokit.rest.repos.getContent
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({ data: { type: 'file', content: Buffer.from(content).toString('base64') } })
    const warn = vi.fn()
    const files = parseDiff(`--- a/Missing\n+++ b/Missing\n@@\n-gone\n+here\n${DIFF}`)
    const url = await openFixPr(octokit, {
      owner: 'o', repo: 'r', prNumber: 1, runId: 42, headRef: 'feature-x', headSha: 'h',
      files, warn,
      diagnosis: { rootCause: 'x', suggestedFix: 'y' },
    })
    expect(url).toBe('https://x/pr/9')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cannot read Missing'))
    expect(octokit.rest.pulls.create.mock.calls[0][0].body).toContain('could not be applied')
  })
})
