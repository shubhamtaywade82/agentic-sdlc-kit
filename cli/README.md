# `kit` — the Agentic SDLC Kit engineering CLI

`kit` is the deterministic engineering CLI of the [Agentic SDLC Kit](../README.md) (v5.0.0).
It turns workflow advice into verifiable engineering gates: structure validators for specs
and plans, a quality-gate runner with machine-readable reports, secret scanning, and
release-readiness checks — all with predictable exit codes.

- **Zero runtime dependencies** (Node.js standard library only, Node >= 18).
- **Ships prebuilt**: `dist/` is committed, so the CLI works inside user projects after
  installation (the installer copies this directory to `.ai/kit/`).
- **No network at runtime, no telemetry.** Report files carry ISO timestamps and a `runId`.

## Usage

```
kit <command> [options]

Commands:
  doctor          Detect environment, runtime and available tools
  inspect         Inventory project structure and conventions
  init            Create the project profile and directory skeleton
  validate-spec   Validate specification structure and acceptance criteria
  validate-plan   Validate tasks, dependencies and verification steps
  verify          Run project-specific quality gates
  audit           Secret scanning and dependency audit
  changed         Summarize changed files and affected boundaries
  release-check   Validate release readiness
  scaffold        Generate standardized engineering artifacts

Global options:
  --json          Machine-readable output on stdout
  --help, -h      Show help for a command
  --version       Show the kit CLI version
```

Run the CLI from the repository (`node bin/kit.js …` or after `npm install` via
`npx kit …` in this package). Every command prints human-readable output by default and
JSON with `--json`; diagnostics always go to stderr.

## Exit codes

Every command documents and obeys the same contract:

| Code | Meaning                       |
| ---- | ----------------------------- |
| 0    | OK / checks passed            |
| 1    | check or validation FAILED    |
| 2    | usage or configuration error  |
| 3    | blocked (prerequisite missing) |

Examples: `kit verify` exits 3 when `.ai/project.yml` is missing (run `kit init` first),
2 when the profile is invalid, and 1 when any quality gate fails or was skipped/blocked.
`kit validate-spec missing.md` exits 2; `kit changed` exits 3 outside a git repository.

## Security model — no shell, ever

The kit **never executes shell strings**. Every external process is spawned as a
validated **argument array**:

```js
spawn(command[0], command.slice(1), { shell: false, cwd: projectRoot, timeout });
```

- Quality commands in `.ai/project.yml` must be non-empty arrays of non-empty strings;
  anything else is rejected at load time with a schema error.
- All git and tool invocations (`git`, `npm audit`, `bundle audit`, …) use fixed argument
  arrays with `shell: false`, a bounded timeout, and the project root as working directory.
- The CLI never prompts for or prints full secrets: audit previews are the first 8
  characters of a match plus an ellipsis.

## Commands

### `kit doctor [--json]`
Environment checklist: node >= 18 (FAIL below), git, package managers (npm/yarn/pnpm/bundler),
project detection (package.json/Gemfile), kit integrity (`.ai/manifest` non-empty),
`claude` CLI version >= 2.1.287 (absent = INFO), MCP build state. Exit 1 only when a
required check FAILs.

### `kit inspect [--json]`
Read-only inventory: file counts by extension (top 8), manifests and frameworks, test
frameworks, lint/typecheck configs, git state, and kit state (profile, specs, plans, ADRs).
Always exits 0.

### `kit init [--mode existing|greenfield] [--stack rails|rails-ts|nextjs|node-ts-lib] [--force] [--json]`
Discovers the project and writes `.ai/project.yml` (refuses to overwrite without
`--force`, exit 1) plus the standard directory skeleton under `docs/` and `.ai/`.
Quality commands are prefilled **only** for scripts that actually exist: node stacks get
`typecheck/lint/unit/build` → `["npm","run",…]` when those scripts are in package.json;
rails/rails-ts get `lint` → `bundle exec rubocop` and `unit` → `bundle exec rspec` when a
Gemfile exists.

### `kit validate-spec <file> [--json]`
Validates spec structure: frontmatter (`kind: spec`, `mode: feature|app|fix`,
`status: draft|approved`), H1 title, and H2 sections Problem, Scope (with *In scope* /
*Out of scope*), Acceptance Criteria (>= 1 GIVEN/WHEN/THEN/should/must bullet — counted),
Non-functional Requirements and Open Questions. Draft specs downgrade the soft sections to
warnings; approved specs treat them as errors. Exit 0/1; missing file exits 2.

### `kit validate-plan <file> [--json]`
Validates plan structure: frontmatter (`kind: plan`, `spec:` path that must exist and be a
spec, `mode`), non-empty Approach, `TASK-###` tasks with `Depends:` lines, `Acceptance:`
and `Verification:` lists, dependency existence, cycle detection (`CYCLE_DETECTED` reports
the cycle path), task size (> 15 acceptance+verification items = warning), and Checkpoints
containing *design review* and *test review*. Exit 0/1/2.

### `kit verify [--check id1,id2] [--keep-going] [--json]`
The quality gate runner. Loads `.ai/project.yml` (missing → exit 3, "run kit init") and
runs `quality.commands` in declaration order. Per-check status:

- `passed` — exit code 0
- `failed` — non-zero exit or timeout (exit code, signal and the last 30 lines of output
  are captured as evidence)
- `skipped` — id absent from the profile or executable not found (ENOENT); reason recorded
- `blocked` — not run because an earlier check failed (`stopOnFailure` without `--keep-going`)

**A skipped check is never passed.** Writes a report to
`.ai/reports/verification/verify-<UTCtimestamp>-<6-hex>.json`:

```json
{
  "schema": "agentic-sdlc/verification-report/1",
  "runId": "verify-20250131T093012Z-a1b2c3",
  "timestamp": "2025-01-31T09:30:12.000Z",
  "command": ["kit", "verify"],
  "commitSha": null,
  "status": "failed",
  "summary": { "passed": 1, "failed": 1, "skipped": 0, "blocked": 1 },
  "checks": [
    {
      "id": "typecheck",
      "status": "passed",
      "command": ["npm", "run", "typecheck"],
      "exitCode": 0,
      "durationMs": 12,
      "evidence": ["output lines"],
      "errors": []
    }
  ]
}
```

Exit 0 only when the overall status is `passed`.

### `kit audit [--json] [--no-dependency-audit]`
Scans tracked files (`git ls-files`) or the directory tree (skipping node_modules, .git,
vendor, dist, .ai/reports, coverage; binary files with a NUL byte in the first 8 KB) with
the kit's canonical secret pattern set (AWS keys, private key blocks, GitHub/GitLab/Slack
tokens, Stripe keys, Google API keys, OpenAI keys, generic assignments). Placeholder
values (`${VAR}`, `<...>`, `{{...}}`, changeme/example/dummy/xxxxx/redacted/your…) are not
findings. Suppression: `.ai/audit-allowlist.txt` (one literal substring per line, `#`
comments) — matched findings are counted as allowlisted. Previews are truncated to 8
characters. When package.json + package-lock.json + npm are present it also runs
`npm audit --json` (critical+high > 0 → failed; failure to run → INFO). Ruby projects run
`bundle audit check --format json` when bundler is available. Exit 0/1.

### `kit changed [--base REF] [--json]`
`git status --porcelain` plus `git diff --name-only BASE...HEAD` (default base `main`,
fallback `master`; not a repo → exit 3), classified into test / migrations / docs /
config / source / other, with per-area lists and an affected-areas summary. Exit 0.

### `kit release-check [--version V] [--allow-dirty] [--allow-main] [--no-dependency-audit] [--json]`
Release readiness. Version resolution: `--version` | package.json `version` | first
`## x.y.z` heading in CHANGELOG.md (none → exit 3). Checks: changelog mentions the
version; newest `.ai/reports/verification/` report passed within 7 days; clean working
tree (unless `--allow-dirty`); branch not main/master (unless `--allow-main`); tag
`v<version>` does not exist; audit passes. Exit 0 ready, 1 not ready, 3 no version /
not a repo.

### `kit scaffold <spec|plan|adr|profile> <slug> [--force] [--json]`
Generates standardized artifacts. The **spec template ships valid** (it passes
`kit validate-spec` unchanged); the **plan template** intentionally references
`./missing-spec.md` until a real spec is linked; **adr** auto-increments its three-digit
number; **profile** delegates to init logic. Refuses to overwrite without `--force`
(exit 1) and prints the created path plus the validate command to run next.

## How `kit` maps to the six `/kit:` workflow commands

The kit exposes six workflow entry points. Each one uses the CLI as its deterministic
backbone:

| Workflow       | Uses                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `/kit:init`    | `kit doctor` → `kit inspect` → `kit init` (and `kit scaffold profile` to regenerate)             |
| `/kit:app`     | `kit scaffold spec` → `kit validate-spec` → `kit scaffold plan` → `kit validate-plan` → `kit verify` |
| `/kit:feature` | `kit validate-spec` / `kit validate-plan` as entry gates, `kit verify` per task, `kit changed` to check scope, `kit audit` before review |
| `/kit:fix`     | `kit verify --check unit` for regression runs, `kit changed --base` for blast-radius, `kit verify` for the full gate |
| `/kit:review`  | `kit changed` (what changed), `kit verify --keep-going` (all gates), `kit audit` (security evidence) |
| `/kit:release` | `kit release-check` (changelog, verification report, clean tree, branch, tag, audit), then `kit verify` for the release evidence |

Workflows never proceed to the next stage while a mandatory gate fails — that is the
point of deterministic exit codes.

## Examples

```console
$ kit doctor
kit doctor — environment check

  [OK  ] node-version: node v20.11.0 (>= 18 required)
  [OK  ] git-present: git version 2.43.0
  [OK  ] package-managers: npm 10.2.4
  [INFO] project-detection: no package.json or Gemfile found — run kit init inside a project
  ...

$ kit verify --check typecheck,unit
kit verify — quality gates

  typecheck      passed    0.4s
  unit           failed    2.1s  exit 1
      | FAIL  tests/orders.test.ts
      |   ✖ applies the discount

Summary: 1 passed, 1 failed, 0 skipped, 0 blocked → failed
Report: .ai/reports/verification/verify-20250131T093012Z-a1b2c3.json

$ kit scaffold spec password-reset
Created docs/specifications/features/password-reset.md
Next: kit validate-spec docs/specifications/features/password-reset.md
```

## Development

```bash
npm install        # installs typescript + @types/node only (devDependencies)
npm test           # builds (tsc) and runs the ESM test suite against the built dist/
```

The test suite (`tests/*.test.mjs`, `node:test`) imports the **built** `dist/` — it tests
what ships. `dist/` is committed and must be rebuilt (`npm run build`) after any source
change.
