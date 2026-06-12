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
- Bring-your-own LLM key (Anthropic, OpenAI, OpenRouter, xAI/Grok, Groq, any OpenAI-compatible). No secret custody by us.
- Clean GitHub Marketplace listing — public product front door.

## Non-Goals (v1)

- Auto-fix commits or fix PRs.
- Re-running / merging pipelines.
- Multi-platform (GitLab, Jenkins) — GitHub Actions only.
- Provider abstraction is in v1 (Anthropic + OpenAI-compatible covers OpenAI/OpenRouter/xAI/Groq). Bespoke non-OpenAI-compatible SDKs (e.g. Gemini native) deferred — reachable via OpenRouter meanwhile.
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
├── action.yml              # composite action: inputs, outputs, runs (node20)
├── Dockerfile              # portable CLI image (node:20-alpine) → ghcr.io/clouddrove/naoru
├── src/
│   ├── index.js            # GitHub Action entry (reads @actions/core inputs)
│   ├── cli.js              # standalone CLI entry (reads env + flags) — runs anywhere
│   ├── core.js            # shared orchestration: diagnose(ctx) → result
│   ├── github.js           # fetch logs, fetch PR diff, upsert comment
│   ├── prompt.js           # build prompt + JSON schema (provider-agnostic)
│   ├── providers/
│   │   ├── index.js        # resolve provider from input → client
│   │   ├── anthropic.js    # Anthropic SDK, tool-call structured output
│   │   └── openai.js       # OpenAI SDK + base-url (openai/openrouter/xai/groq/...)
│   └── parse.js            # normalize structured output → comment markdown
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

## Two run modes

Both modes share `src/core.js` (`diagnose(ctx)`), which takes a plain context object — no GitHub Actions globals inside core.

| mode | entry | inputs from | trigger | comment target |
|---|---|---|---|---|
| **GitHub Action** | `src/index.js` → `dist/index.js` | `@actions/core` inputs + `github.context` | `if: failure()` job | sticky PR comment |
| **Docker CLI** | `src/cli.js` | env vars + flags | any runner (GitLab dind, Jenkins, local) | GitHub PR comment if `--repo`/`--pr` given, else stdout |

**Docker CLI / dind:** image `ghcr.io/clouddrove/naoru` runs as a normal container — works inside docker-in-docker runners (GitLab `image:` + dind service), Jenkins docker agents, or `docker run` locally. The CLI reads `NAORU_*` / standard env vars; it does not require the GitHub Actions environment. When no GitHub PR target is supplied, it prints the diagnosis to stdout (and exits 0 — fail-safe holds).

CLI env / flags:

| env | flag | meaning |
|---|---|---|
| `NAORU_API_KEY` | `--api-key` | LLM key |
| `NAORU_PROVIDER` | `--provider` | provider preset |
| `NAORU_MODEL` | `--model` | model id |
| `NAORU_BASE_URL` | `--base-url` | endpoint override |
| `NAORU_LOG_FILE` | `--log-file` | path to failed-job log (else stdin) |
| `NAORU_DIFF_FILE` | `--diff-file` | path to diff (optional) |
| `GITHUB_TOKEN` | `--github-token` | post comment (optional) |
| — | `--repo owner/name` | GitHub repo for comment (optional) |
| — | `--pr N` | PR number for comment (optional) |

## Tech Stack

- Node 20
- `@actions/core` — inputs, outputs, annotations
- `@actions/github` — Octokit client, context
- `@anthropic-ai/sdk` — native Anthropic calls
- `openai` — OpenAI SDK, also drives OpenRouter / xAI (Grok) / Groq / any OpenAI-compatible endpoint via `base-url`
- `@vercel/ncc` — bundle to single `dist/index.js`

## Inputs

| input | required | default | notes |
|---|---|---|---|
| `api-key` | yes | — | LLM key, stored as repo secret |
| `provider` | no | `anthropic` | `anthropic` \| `openai` \| `openrouter` \| `xai` \| `groq` \| `custom` |
| `base-url` | no | (per-provider) | override endpoint; required when `provider: custom` |
| `model` | no | (per-provider default) | e.g. `claude-sonnet-4-6`, `gpt-4o`, `grok-2`, `x-ai/grok-2` (openrouter) |
| `github-token` | no | `${{ github.token }}` | needs `pull-requests: write`, `actions: read` |
| `max-log-lines` | no | `500` | tail N lines of log for token control |
| `failed-job-name` | no | (auto-detect) | optional explicit job to diagnose |

## Outputs

| output | notes |
|---|---|
| `root-cause` | short text of diagnosis |
| `confidence` | `high` / `medium` / `low` |
| `comment-url` | URL of posted/updated comment |

## LLM Integration (multi-provider)

- **Provider abstraction:** `src/providers/index.js` resolves the `provider` input to a client exposing one method: `diagnose(prompt, schema) → { rootCause, suggestedFix, confidence, files[] }`.
  - `anthropic.js` — native Anthropic SDK, structured output via tool-call.
  - `openai.js` — OpenAI SDK; structured output via function/tool-call or `response_format: json_schema`. One client serves all OpenAI-compatible endpoints by swapping `base-url`:
    | provider | base-url | example model |
    |---|---|---|
    | `openai` | `https://api.openai.com/v1` | `gpt-4o` |
    | `openrouter` | `https://openrouter.ai/api/v1` | `x-ai/grok-2`, `anthropic/claude-3.5-sonnet` |
    | `xai` | `https://api.x.ai/v1` | `grok-2` |
    | `groq` | `https://api.groq.com/openai/v1` | `llama-3.3-70b` |
    | `custom` | user-supplied | any |
- **Structured output:** JSON schema `{ rootCause, suggestedFix, confidence, files[] }`. Reliable parse, no regex on prose. `parse.js` normalizes both provider shapes to the same object.
- **Prompt contents:** failed job name, tailed+ANSI-stripped logs, PR diff, changed file list. Prompt is provider-agnostic (`prompt.js`).
- **Per-provider default model:** sane cheap default per provider when `model` omitted.

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

## Testing & CI

Test runner: **Vitest** (Node 20).

- **Unit:**
  - `parse.js` — both provider output shapes → normalized object → markdown.
  - `github.js` — log tailing, ANSI strip, sticky-marker detect/upsert (mocked Octokit).
  - `providers/index.js` — provider resolution, base-url defaults, `custom` validation.
  - `providers/*.js` — request shape + response normalization (mocked SDK / `fetch`, no real API calls).
- **Dogfood (`self-test.yml`):** intentionally-failing job → naoru job → assert sticky comment posted. Runs only when an LLM key secret is present (skips on forks).

### `.github/workflows/` (CI for the repo itself)

| workflow | trigger | does |
|---|---|---|
| `ci.yml` | push, PR | `npm ci`, lint, `vitest run`, **`dist` freshness check** (rebuild `ncc`, fail if `dist/` differs from committed) |
| `self-test.yml` | PR (key present) | live dogfood end-to-end |
| `release.yml` | tag `v*` | build `dist/`, GitHub Release, move major tag `v1` |

`dist` freshness check is critical — Actions run committed `dist/`, so stale bundle = silently wrong behavior.

## Release

- Tag `vX.Y.Z` → `release.yml` builds `dist/`, creates GitHub Release, moves major tag (`v1`) to point at it (Marketplace convention).

## Future (post-v1)

- GitHub App phase: central service, cross-repo analytics, billing.
- Auto-fix mode: open a fix commit/PR (opt-in).
- Multi-platform: GitLab CI, Jenkins.
- Feedback loop: learn from 👍/👎 reactions.
