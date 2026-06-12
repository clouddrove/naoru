# naoru 🩺

**Heal your broken CI with AI.** When a job fails, naoru reads the failed logs and your PR diff, asks an LLM for a root cause and a concrete fix, and posts a sticky comment on the pull request.

> **naoru** (直る) is Japanese for *"to be fixed / to heal."* That's the whole job: your pipeline breaks, naoru tells you why and how to make it right.

It works as a **GitHub Action** and as a **portable Docker CLI** for GitLab dind, Jenkins, or local runs. It supports Anthropic, OpenAI, OpenRouter, xAI (Grok), Groq, and any OpenAI-compatible endpoint. It never fails your build — diagnosis is comment-only.

---

## 30-second quickstart

Add a diagnosing job that runs only when your build fails:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps: [ { run: make build } ]

  naoru:
    needs: [build]
    if: ${{ always() && needs.build.result == 'failure' }}
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      actions: read
    steps:
      - uses: clouddrove/naoru@v1
        with:
          api-key: ${{ secrets.OPENAI_API_KEY }}
          provider: openai          # or anthropic | openrouter | xai | groq | custom
          model: gpt-4o
```

That's it. On the next failing PR you'll get a 🩺 comment with the root cause and a suggested fix.

The `permissions` block matters: naoru needs `actions: read` to pull the failed run's logs and `pull-requests: write` to post the comment.

See [`examples/usage.yml`](examples/usage.yml) for the full workflow.

---

## Docker / CLI (GitLab dind, Jenkins, local)

The same diagnosis logic ships as a `node:20-alpine` image — `ghcr.io/clouddrove/naoru` — so you can run it anywhere, including docker-in-docker runners that aren't GitHub Actions. It reads `NAORU_*` env vars (or flags), takes the failed-job log from `--log-file`/stdin, and prints the diagnosis to stdout. Give it `--repo` + `--pr` + `GITHUB_TOKEN` and it will also post the GitHub PR comment.

```bash
# Pipe a failed build log straight into the container.
cat build.log | docker run -i \
  -e NAORU_API_KEY=$LLM_KEY \
  -e NAORU_PROVIDER=anthropic \
  ghcr.io/clouddrove/naoru:v1
```

### GitLab CI (docker-in-docker)

```yaml
naoru:
  stage: .post
  image: ghcr.io/clouddrove/naoru:v1
  when: on_failure
  variables:
    NAORU_PROVIDER: xai
    NAORU_MODEL: grok-2
  script:
    - cat build.log | node /app/dist-cli/index.js
  # NAORU_API_KEY set as a masked CI/CD variable.
```

See [`examples/gitlab-dind.yml`](examples/gitlab-dind.yml).

### CLI env vars / flags

| env | flag | meaning |
|---|---|---|
| `NAORU_API_KEY` | `--api-key` | LLM key |
| `NAORU_PROVIDER` | `--provider` | provider preset (default `anthropic`) |
| `NAORU_MODEL` | `--model` | model id |
| `NAORU_BASE_URL` | `--base-url` | endpoint override |
| `NAORU_LOG_FILE` | `--log-file` | path to failed-job log (else read stdin) |
| `NAORU_DIFF_FILE` | `--diff-file` | path to diff (optional) |
| `NAORU_JOB_NAME` | `--job-name` | name of the failed job (default `pipeline`) |
| `NAORU_MAX_LOG_LINES` | `--max-log-lines` | tail N lines of log (default `500`) |
| `GITHUB_TOKEN` | `--github-token` | post a comment (optional) |
| — | `--repo owner/name` | GitHub repo for comment (optional) |
| — | `--pr N` | PR number for comment (optional) |

When no GitHub PR target is supplied, the CLI just prints the diagnosis to stdout and exits 0 — the fail-safe always holds.

---

## Providers

naoru talks to Anthropic natively and to everything else through the OpenAI-compatible API, driven by `base-url`. Pick a preset with `provider`; override `model` and `base-url` as needed.

| provider | default model | base URL | notes |
|---|---|---|---|
| `anthropic` | `claude-sonnet-4-6` | (Anthropic SDK) | native Anthropic tool-calling |
| `openai` | `gpt-4o` | `https://api.openai.com/v1` | |
| `openrouter` | `anthropic/claude-3.5-sonnet` | `https://openrouter.ai/api/v1` | any OpenRouter model id |
| `xai` | `grok-2` | `https://api.x.ai/v1` | Grok |
| `groq` | `llama-3.3-70b-versatile` | `https://api.groq.com/openai/v1` | |
| `custom` | (none) | **required** via `base-url` | any OpenAI-compatible endpoint |

---

## Inputs

Mirrors [`action.yml`](action.yml).

| input | required | default | description |
|---|---|---|---|
| `api-key` | yes | — | LLM API key (provider-specific). |
| `provider` | no | `anthropic` | `anthropic` \| `openai` \| `openrouter` \| `xai` \| `groq` \| `custom` |
| `base-url` | no | (per-provider) | Override LLM endpoint. Required when provider is `custom`. |
| `model` | no | (per-provider default) | Model id. |
| `github-token` | no | `${{ github.token }}` | Token for reading logs and posting comments. |
| `max-log-lines` | no | `500` | Tail this many log lines. |
| `failed-job-name` | no | (auto-detect) | Explicit failed job name. |

## Outputs

| output | description |
|---|---|
| `root-cause` | Diagnosed root cause. |
| `confidence` | `high` \| `medium` \| `low` |
| `comment-url` | URL of the posted/updated PR comment. |

---

## How the sticky comment works

naoru posts a single comment per PR and keeps it up to date. It embeds a hidden marker (`<!-- naoru -->`) in the comment body; on the next run it finds that marker and **updates the existing comment in place** instead of stacking new ones. The comment shows the failed job, the root cause, the suggested fix (a `diff` block when one applies), and a confidence level you can react to with 👍 / 👎.

## Cost

Each diagnosis is a single LLM call over the tailed logs (capped by `max-log-lines`, default 500) plus the PR diff. The default model is Anthropic `claude-sonnet-4-6` — swap in a cheaper model (e.g. `provider: groq` or `provider: openai` with `model: gpt-4o-mini`) to cut cost. Keeping `max-log-lines` modest is the simplest lever on token spend.

## Fail-safe

naoru is comment-only and **never fails your build.** If the LLM call, log fetch, or comment post errors out, it surfaces a warning annotation (Action) or prints to stderr (CLI) and exits 0. A broken diagnostician should never block your pipeline.

## License

[Apache-2.0](LICENSE) © 2026 CloudDrove Inc.
