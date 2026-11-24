# CI Agent — Ollama Cloud review & autofix for the Agentic SDLC Kit

Advisory AI agents that run in GitHub Actions on [Ollama Cloud](https://ollama.com),
using [`@nemesis-oss/ollama-sdk`](https://www.npmjs.com/package/@nemesis-oss/ollama-sdk).
They continuously improve the kit: every PR gets a semantic review, and every
failed `CI` run gets a bounded, human-gated repair proposal.

This package is **standalone npm tooling** — it is deliberately _not_ a pnpm
workspace member, so the kit's deterministic `verify` pipeline, its lockfile,
and `pnpm install --frozen-lockfile` are untouched. The deterministic `CI`
workflow stays offline and hermetic; all cloud dependency lives in the three
separate workflows below.

## Workflows

| Workflow           | Trigger                                                | What it does                                                                                                                                               |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai-review.yml`    | PR opened / synchronized / ready                       | Posts one advisory `COMMENT` review with inline findings (≤ 6 files per PR).                                                                               |
| `ai-autofix.yml`   | `CI` run fails (same repo), or manual dispatch         | Extracts failing steps, reads the failing revision's files, proposes a patch, opens a **draft** PR against the failing branch. Max 2 attempts per failure. |
| `ollama-cloud.yml` | Weekly, on demand, or PRs touching `tools/ci-agent/**` | Runs the agent's offline unit tests, then a live connectivity canary (auth + model tag + schema-conformant inference).                                     |

## Setup (repository settings)

1. **Secret `OLLAMA_API_KEY`** — create a key at <https://ollama.com/settings/keys>
   and add it as a repository secret. Without it, all three workflows degrade
   to an explicit skip (never a failure).
2. **Variables (optional)** — `OLLAMA_MODEL_REVIEW` and `OLLAMA_MODEL_FIX`
   (Settings → Secrets and variables → Actions → Variables). Default:
   `glm-5.3-flash:cloud`. Verify the tag you pin appears in
   `GET https://ollama.com/api/tags` for your subscription; the weekly canary
   will catch a retired tag.
3. **Optional GitHub App for autofix** — pushes made with the default
   `GITHUB_TOKEN` do not trigger workflow runs, so the agent's fix PR would
   never get a `CI` run of its own. To close that loop: create a GitHub App
   with **Contents: Read and write** and **Pull requests: Read and write** on
   this repository, then set the secrets `CI_AGENT_APP_ID` and
   `CI_AGENT_APP_PRIVATE_KEY`. When present, `ai-autofix.yml` mints an
   installation token via the pinned `actions/create-github-app-token` action.
   Without the App the agent still works; it just cannot re-trigger CI.

## Non-negotiable invariants

1. **The agent never executes PR code.** Agent tooling is checked out from the
   default branch only; PR diffs, logs, and file contents enter exclusively as
   data through the GitHub API. Both system prompts state that all repository
   content is untrusted data and instructions inside it must never be followed
   (prompt-injection defense in depth).
2. **The agent never merges, never approves, never requests changes.** Its
   output is a review comment or a draft PR; `CI` plus human review remain the
   only gates.
3. **Fail-closed on parse.** Model output is schema-validated
   (`parseStructuredOutput`); any violation, low confidence, or guard rejection
   aborts the run — no partial application. Note: the JSON schema is embedded
   in the system prompt rather than the `format` parameter because Ollama
   Cloud rejects the wire `format` parameter.
4. **Bounded writes.** The autofix agent can only patch paths matching
   `packages/<pkg>/src/**` and is hard-denied on `.github/**`, every
   `package.json` (root and workspace), lockfiles, `pnpm-workspace.yaml`,
   tsconfigs, `.env*`, lint/format configs, and `AGENTS.md`/`GEMINI.md`
   (see `src/security-guards.ts`). Max 5 files, 60 KB each, and no-op patches
   are skipped.
5. **Cost discipline.** Review is capped at 6 file-chunks per PR; autofix runs
   only on genuine failures with at most 2 attempts per failure branch; every
   workflow has a hard `timeout-minutes`; per-PR concurrency cancels superseded
   review runs.

## Layout

```
tools/ci-agent/
  src/llm.ts             # single Ollama Cloud seam (fail-closed structured output)
  src/schemas.ts          # zod contracts: ReviewResult, FixProposal
  src/github.ts           # GitHub REST client (diff, review, refs, contents)
  src/diff-parser.ts      # unified-diff chunking + valid right-side line numbers
  src/log-minimizer.ts    # ANSI strip, error-frame extraction, file mapping
  src/security-guards.ts  # allow/deny path policy + proposal validation
  src/review.ts           # PR review orchestrator (npm run review)
  src/autofix.ts          # failure-repair orchestrator (npm run autofix)
  scripts/probe-cloud.ts  # connectivity canary (npm run probe)
  test/                   # offline unit tests (mocked fetch; no cloud calls)
```

## Developing the agent

```bash
cd tools/ci-agent
npm ci          # install from the committed lockfile
npm test        # offline unit suite
npm run typecheck
```

The unit tests mock the LLM transport; nothing in `test/` touches Ollama
Cloud. Local live probe: `OLLAMA_API_KEY=... npm run probe`.

Manual autofix run for a specific failed CI run:
Actions → **AI CI Autofix** → _Run workflow_ → paste the run ID.
