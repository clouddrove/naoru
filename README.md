<div align="center">

# 🩺 naoru

### Heal your broken CI with AI

**When a pipeline fails, naoru reads the logs + your PR diff, finds the root cause, and comments the fix right on your pull request.**

[![Release](https://img.shields.io/github/v/release/clouddrove/naoru?style=for-the-badge&color=e11d48&label=release)](https://github.com/clouddrove/naoru/releases)
[![Marketplace](https://img.shields.io/badge/GitHub-Marketplace-2ea44f?style=for-the-badge&logo=github)](https://github.com/marketplace/actions/naoru)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge)](LICENSE)

[![CI](https://img.shields.io/github/actions/workflow/status/clouddrove/naoru/ci.yml?style=flat-square&label=CI)](https://github.com/clouddrove/naoru/actions/workflows/ci.yml)
[![Container](https://img.shields.io/badge/ghcr.io-clouddrove%2Fnaoru-1f6feb?style=flat-square&logo=docker&logoColor=white)](https://github.com/clouddrove/naoru/pkgs/container/naoru)
[![Made by CloudDrove](https://img.shields.io/badge/made%20by-CloudDrove-ff6a00?style=flat-square)](https://clouddrove.com)

</div>

---

> **naoru** (直る) is Japanese for *"to be fixed / to heal."* That's the whole job — your pipeline breaks, naoru tells you **why** and **how** to make it right.

```text
  ❌ build failed                        🩺 naoru
  ───────────────                        ─────────
  TypeError: Cannot read    ──────▶      Root cause: `user` is undefined at src/auth.ts:42
  properties of undefined                Fix:  - if (user.id)
  (reading 'id')                               + if (user?.id)
                                         Confidence: High
```

- 🔎 **Root-cause, not noise** — reads the *failed* job's logs and the PR diff, then explains the actual cause.
- 💬 **One sticky comment** — updates in place on every re-run. No comment spam.
- 🧠 **Any LLM** — Anthropic, OpenAI, OpenRouter, xAI (Grok), Groq, or any OpenAI-compatible endpoint.
- 🐳 **Runs anywhere** — GitHub Action **or** a portable Docker image for GitLab dind, Jenkins, and local.
- 🛟 **Never breaks your build** — diagnosis is comment-only and always exits 0.

---

## 🚀 Setup in 3 steps

### 1️⃣ Add your LLM API key as a repository secret

naoru reads the key from **GitHub Actions secrets** — never hard-code it in YAML.

**Via the GitHub UI:**
> Your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
> - **Name:** `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`, etc.)
> - **Secret:** *paste your key*

**Or via the CLI:**
```bash
gh secret set ANTHROPIC_API_KEY --repo your-org/your-repo
# paste the key when prompted
```

> 🔑 Where to get a key: [Anthropic](https://console.anthropic.com/) · [OpenAI](https://platform.openai.com/api-keys) · [OpenRouter](https://openrouter.ai/keys) · [xAI/Grok](https://console.x.ai/) · [Groq](https://console.groq.com/keys)

### 2️⃣ Add a `naoru` job to your workflow

Drop this into any workflow file (e.g. `.github/workflows/ci.yml`). It runs **only when your build fails**:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: make build          # ← your real build/test job

  naoru:
    needs: [build]
    if: ${{ always() && needs.build.result == 'failure' }}
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write       # ← post the comment
      actions: read              # ← read the failed run's logs
    steps:
      - uses: clouddrove/naoru@v0
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}   # ← the secret from step 1
          provider: anthropic                          # anthropic | openai | openrouter | xai | groq | custom
```

### 3️⃣ Open a PR and let a job fail

On the next failing run, naoru posts a 🩺 comment with the root cause and a suggested fix. Done.

> ⚠️ The `permissions` block is **required** — without `actions: read` naoru can't fetch logs, and without `pull-requests: write` it can't comment.

📄 Full example: [`examples/usage.yml`](examples/usage.yml)

---

## 🖼️ What you get

A single comment on the PR, updated in place every run:

> ## 🩺 naoru
> **Failed job:** `build`
>
> **Root cause:** Type error in `src/auth.ts:42` — `user` is possibly `undefined`.
>
> **Suggested fix:**
> ```diff
> - if (user.id)
> + if (user?.id)
> ```
> **Confidence:** High · _react 👍 / 👎_

---

## 🤖 Pick your LLM

naoru talks to **Anthropic natively** and to everything else through the **OpenAI-compatible API** (driven by `base-url`). Just set `provider` — override `model`/`base-url` when you want.

| `provider` | default model | endpoint | key secret (example) |
|---|---|---|---|
| `anthropic` | `claude-sonnet-4-6` | Anthropic SDK | `ANTHROPIC_API_KEY` |
| `openai` | `gpt-4o` | `https://api.openai.com/v1` | `OPENAI_API_KEY` |
| `openrouter` | `anthropic/claude-3.5-sonnet` | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| `xai` | `grok-2` | `https://api.x.ai/v1` | `XAI_API_KEY` |
| `groq` | `llama-3.3-70b-versatile` | `https://api.groq.com/openai/v1` | `GROQ_API_KEY` |
| `custom` | — | **set `base-url`** | any |

```yaml
# Example: cheap & fast with Groq
- uses: clouddrove/naoru@v0
  with:
    api-key: ${{ secrets.GROQ_API_KEY }}
    provider: groq
```

---

## 🐳 Run it outside GitHub Actions (Docker / GitLab dind / Jenkins / local)

The same engine ships as a `node:20-alpine` image — **`ghcr.io/clouddrove/naoru`** — so it runs anywhere, including docker-in-docker runners. It reads the failed-job log from `--log-file`/stdin and prints the diagnosis. Give it `--repo` + `--pr` + `GITHUB_TOKEN` and it also posts the GitHub PR comment.

```bash
# Pipe a failed build log straight into the container
cat build.log | docker run -i \
  -e NAORU_API_KEY=$LLM_KEY \
  -e NAORU_PROVIDER=anthropic \
  ghcr.io/clouddrove/naoru:latest
```

<details>
<summary><b>GitLab CI (docker-in-docker)</b></summary>

```yaml
naoru:
  stage: .post
  image: ghcr.io/clouddrove/naoru:latest
  when: on_failure
  variables:
    NAORU_PROVIDER: xai
    NAORU_MODEL: grok-2
  script:
    - cat build.log | node /app/dist-cli/index.js
  # NAORU_API_KEY set as a masked CI/CD variable (Settings → CI/CD → Variables)
```

See [`examples/gitlab-dind.yml`](examples/gitlab-dind.yml).
</details>

<details>
<summary><b>CLI env vars / flags</b></summary>

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

With no GitHub target, the CLI prints the diagnosis to stdout and exits 0.
</details>

---

## ⚙️ Action reference

<details>
<summary><b>Inputs</b> (mirrors <a href="action.yml"><code>action.yml</code></a>)</summary>

| input | required | default | description |
|---|---|---|---|
| `api-key` | ✅ | — | LLM API key (provider-specific). |
| `provider` | | `anthropic` | `anthropic` \| `openai` \| `openrouter` \| `xai` \| `groq` \| `custom` |
| `base-url` | | per-provider | Override endpoint. Required when `provider: custom`. |
| `model` | | per-provider | Model id. |
| `github-token` | | `${{ github.token }}` | Token for reading logs and posting comments. |
| `max-log-lines` | | `500` | Tail this many log lines. |
| `failed-job-name` | | auto-detect | Explicit failed job name. |

</details>

<details>
<summary><b>Outputs</b></summary>

| output | description |
|---|---|
| `root-cause` | Diagnosed root cause. |
| `confidence` | `high` \| `medium` \| `low` |
| `comment-url` | URL of the posted/updated PR comment. |

</details>

---

## 💡 Good to know

- **Sticky comment** — naoru embeds a hidden marker (`<!-- naoru -->`) and updates the same comment in place every run, so PRs never fill with duplicate diagnoses.
- **Cost** — each diagnosis is a single LLM call over the *tailed* logs (`max-log-lines`, default 500) plus the PR diff. Want it cheaper? Use `provider: groq` or `openai` with `model: gpt-4o-mini`, and keep `max-log-lines` modest.
- **Fail-safe** — if the LLM call, log fetch, or comment post errors, naoru emits a warning (Action) or stderr line (CLI) and exits 0. A broken diagnostician should never block your pipeline.

---

## 🤝 Contributing

Issues and PRs welcome. `npm ci && npm test` runs the suite; the CI gate also checks the committed `dist/` + `dist-cli/` bundles are fresh (`npm run build && npm run build:cli`).

## 📜 License

[Apache-2.0](LICENSE) © 2026 [CloudDrove Inc.](https://clouddrove.com)

<div align="center">
<sub>Built with 🩺 by <a href="https://clouddrove.com">CloudDrove</a> — we build and run cloud infrastructure.</sub>
</div>
