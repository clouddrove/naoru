# naoru — Design Spec

**Date:** 2026-06-12
**Status:** Approved (design), pending implementation
**Repo target:** `github.com/clouddrove/naoru`
**License:** Apache-2.0

## Name

**naoru** (直る) — Japanese for "to be fixed / to heal". The broken pipeline heals.

Tagline: *"Heal your broken CI with AI — naoru diagnoses why your pipeline failed and comments the fix on your PR."*

## Summary

`naoru` is an open-source **composite GitHub Action**. Teams add it as an `if: failure()` job in their workflow. When CI fails, naoru fetches the failed job logs and the PR diff, asks Claude for a root-cause analysis plus a suggested fix, and posts (or updates) a single sticky comment on the pull request.

**v1 is comment-only.** No auto-fix commits, no merging. Diagnosis is additive and never fails the build.

## Goals

- Cut time-to-diagnosis on failed CI runs.
- Zero backend / zero hosting for adopters — runs inside their own CI.
- Bring-your-own `ANTHROPIC_API_KEY`. No secret custody by us.
- Clean GitHub Marketplace listing — public product front door.

## Non-Goals (v1)

- Auto-fix commits or fix PRs.
- Re-running / merging pipelines.
- Multi-platform (GitLab, Jenkins) — GitHub Actions only.
- Central dashboard, cross-repo learning, billing. (Future GitHub App phase.)

## Architecture

Single composite Action, Node 20 runtime, bundled to `dist/` with `@vercel/ncc` (Actions consume committed JS, no `npm install` at runtime).

### Flow

```
CI job fails
  └─ naoru job runs (needs: [<failed-job>], if: failure())
       1. Fetch failed job logs        (GitHub API via github-token)
       2. Fetch PR diff + changed files (GitHub API)
       3. Build prompt → Claude         (anthropic-api-key)
       4. Parse structured output       (rootCause, fix, confidence, files)
       5. Upsert sticky PR comment      (find by marker, edit or create)
```

The Action itself never fails the build — all errors are caught and surfaced as a warning annotation, not a non-zero exit.

## Repo Layout

```
naoru/
├── action.yml              # composite action: inputs, outputs, runs
├── src/
│   ├── index.js            # entry: orchestrates the flow
│   ├── github.js           # fetch logs, fetch PR diff, upsert comment
│   ├── claude.js           # Anthropic SDK call + prompt construction
│   └── parse.js            # structured tool-call output → comment markdown
├── dist/                   # ncc-bundled output (committed)
├── .github/
│   └── workflows/
│       ├── self-test.yml   # dogfood: intentionally-failing job to verify
│       └── release.yml     # tag → marketplace release, move major tag
├── examples/               # copy-paste usage snippets
├── README.md               # marketplace listing
├── LICENSE                 # Apache-2.0
└── package.json
```

## Tech Stack

- Node 20
- `@actions/core` — inputs, outputs, annotations
- `@actions/github` — Octokit client, context
- `@anthropic-ai/sdk` — Claude calls
- `@vercel/ncc` — bundle to single `dist/index.js`

## Inputs

| input | required | default | notes |
|---|---|---|---|
| `anthropic-api-key` | yes | — | team's own key, stored as repo secret |
| `github-token` | no | `${{ github.token }}` | needs `pull-requests: write`, `actions: read` |
| `model` | no | `claude-sonnet-4-6` | default cheap; opt into `claude-opus-4-8` |
| `max-log-lines` | no | `500` | tail N lines of log for token control |
| `failed-job-name` | no | (auto-detect) | optional explicit job to diagnose |

## Outputs

| output | notes |
|---|---|
| `root-cause` | short text of diagnosis |
| `confidence` | `high` / `medium` / `low` |
| `comment-url` | URL of posted/updated comment |

## Claude Integration

- **Structured output:** force a tool-call with JSON schema — `{ rootCause, suggestedFix, confidence, files[] }`. Reliable parse, no regex on prose.
- **Prompt contents:** failed job name, tailed+ANSI-stripped logs, PR diff, changed file list.
- **Model default:** `claude-sonnet-4-6` for cost; `claude-opus-4-8` opt-in via `model` input.

## Comment Behavior

- **Sticky:** comment carries hidden marker `<!-- naoru -->`. On each run, search PR comments for the marker; edit if found, create if not. No spam on re-runs.
- **Shape:**

```md
## 🩺 naoru
<!-- naoru -->
**Failed job:** `build`
**Root cause:** Type error in `src/auth.ts:42` — `user` possibly undefined.

**Suggested fix:**
```diff
- if (user.id)
+ if (user?.id)
```
**Confidence:** High · _react 👍 / 👎_
```

## Key Decisions

- **Sticky comment** — one comment per PR, updated in place.
- **Structured tool-call output** — reliable parsing.
- **Log truncation** — tail `max-log-lines`, strip ANSI, keep tokens bounded.
- **Cost guard** — sonnet default, opus opt-in.
- **Fail-safe** — naoru never fails the build; diagnosis is additive.

## Testing

- **Unit:** `parse.js` (tool-call JSON → markdown), `github.js` log tailing / ANSI strip / marker detection (mocked Octokit).
- **Dogfood:** `.github/workflows/self-test.yml` runs an intentionally-failing job, then naoru, and asserts a comment was posted on the PR.

## Release

- Tag `vX.Y.Z` → `release.yml` builds `dist/`, creates GitHub Release, moves major tag (`v1`) to point at it (Marketplace convention).

## Future (post-v1)

- GitHub App phase: central service, cross-repo analytics, billing.
- Auto-fix mode: open a fix commit/PR (opt-in).
- Multi-platform: GitLab CI, Jenkins.
- Feedback loop: learn from 👍/👎 reactions.
