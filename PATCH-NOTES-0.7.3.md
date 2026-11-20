# Patch Notes 0.7.3 — Verification-Driven Correctness Release

This release fixes every defect found during a full behavioral verification
of 0.7.2 (fresh clone, pinned pnpm 9.12.0, all 485 tests green, then the
CLI exercised end to end against real projects). The theme of the release:
**nothing may be silently fabricated** — no fake git state, no invented stack
labels, no dropped YAML commands, no "executed" tasks that executed nothing,
no plugin manifests pointing at files that do not exist.

---

## 1. Runtime plugins: hooks module paths + real `kit install` (P0)

**Finding.** All four plugins (`model-router`, `run-observer`, `sdlc-guard`,
`secret-guard`) failed the Claude Code plugin validator: `hooks/hooks.json`
declared `"modules": ["./hooks/register.js"]`, but the repository ships only
`hooks/register.ts` and the build emits to `dist/hooks/register.js`. The
declared path never existed — not in a fresh clone, not after
`pnpm run build`. Additionally, `kit install` never touched the plugins at
all: every profile wrote only `.ai-kit/` scaffolding, despite the `runtime`
profile help text ("Runtime governance, secret protection, and model routing
mods") and `docs/HOST_INTEGRATIONS.md` ("To enable the 4 guard plugins …
`kit install --profile full-sdlc`") promising otherwise.

**Fix.**

- All four `hooks/hooks.json` manifests now declare `../dist/hooks/register.js`
  — the path the TypeScript build actually produces, resolved relative to the
  `hooks/` directory (the same base the real Claude Code plugin validator
  uses; the repository's own guard tests and the installer now resolve it the
  same way).
- The hooks module itself is now a **self-contained ES bundle**: each plugin's
  build runs `scripts/bundle-hooks.mjs` (esbuild) after `tsc`, inlining all
  workspace dependencies. The real validator forbids hooks modules to import
  anything but their own files and `claude-code` — no `@agentic-sdlc-kit/*`
  workspace imports and not even `node:` builtins survive into the shipped
  module. `sideEffects: false` on core/contracts/mod-sdk lets the bundler
  tree-shake the workspace barrels down to the pure functions the guards use.
- `register` is exported as a top-level **function declaration** (the
  validator rejects `var`-bound arrow exports in bundled output).
- `turn.step` — a streaming event — uses the required `async function*`
  generator form; the MockRuntime drains generator handlers and uses their
  return value.
- `$.state` references use `{ plugin, key }` literals, and each plugin ships a
  `contract.d.ts` type contract (declared via the `types` field of
  `.claude-plugin/plugin.json`) naming its state keys in
  `interface PluginState`. Manifest guard tests keep the contract and the
  code in sync.
- **All four plugins now pass `claude plugin validate`** (the remaining
  icon/marketplace README notes are listing advisories, not errors).
- `kit install --profile full-sdlc` and `--profile runtime` now link the four
  guard plugins into `<project>/.claude/plugins/` (resolving the kit's
  `plugins/` directory relative to the CLI's own location), and validate each
  plugin's hooks module path _before_ linking. An unbuilt kit repo produces
  an explicit per-plugin warning ("run `pnpm install && pnpm run build` in
  the kit repository, then re-run `kit install`") and links nothing for that
  plugin — never a silently broken install.
- New per-plugin manifest tests assert that declared module paths point into
  `dist/`, that the `.ts` sources exist, and that after a build the compiled
  modules exist at the declared paths (mirroring what
  `claude plugin validate` checks).
- New `packages/cli/src/commands/plugin-linker.ts` (+ tests) encapsulates
  resolution, validation, and idempotent linking.

## 2. Feature workflow: real phase-gated TDD with recorded evidence (P0)

**Finding.** `kit feature` reported `PASSED` and "2 tasks executed" in ~16 ms
with zero files changed. Root cause (three defects compounding):

1. `feature-workflow.ts` ran the _same_ profile verification twice per task
   with nothing in between — the code comment admitted the implementation
   was "simulated here". Nothing ever invoked an agent, wrote a test, or
   touched the repo.
2. The per-task TDD state machine (`TddSession`) _does_ enforce the Red
   invariant ("targeted test must fail before implementing") — but the
   workflow **ignored the Result returned by every `session.advance()` call**,
   so a passing Red run (i.e. no failing test) advanced anyway.
3. `tasksExecuted` counted task IDs unconditionally — including dry runs,
   which also printed a misleading top-level `FAILED` (skipped/zero checks
   roll up to `blocked`, which the CLI mapped to `failed`).

**Fix.** The workflow is now an explicitly phase-gated, resumable state
machine (the kit is runtime-agnostic: your agent writes the code; the kit
verifies each gate and records the evidence):

```
kit feature FEATURE-001                    start / status
kit feature FEATURE-001 --red TASK-101     gate: task.verification.command MUST fail
kit feature FEATURE-001 --green TASK-101   gate: after implementing, MUST pass
kit feature FEATURE-001 --refactor TASK-101 gate: behavior stays green
kit feature FEATURE-001 --verify           final regression (needs all evidence)
```

- Each gate runs the task's own `verification.command` (from the plan
  contract) through the safe process runner (shell: false, bounded timeouts).
- **Red gate invariant**: if the command _passes_ at the red gate, the
  workflow refuses to advance ("the failing test is missing or does not
  exercise the new behavior").
- Evidence (status, duration, output tail, timestamp) for every gate is
  persisted in `.ai-kit/state/feature-runs/<featureId>.json` and echoed in
  every report.
- Completion requires red+green+refactor evidence for **every** task plus a
  passing final regression. Missing evidence blocks completion by
  construction.
- `--dry-run` now executes nothing, writes no state, reports
  `status: planned` with `Tasks Planned` — never "Tasks Executed".
- The workflow also cross-checks `spec.id` and `plan.featureId` against the
  requested feature ID (a mismatched directory is an error, not a silent
  substitution).

## 3. Profile YAML parser: no more silently dropped commands (P0)

**Finding.** The committed fixture profile parsed to `test: []`: its
single-quoted flow array (`- ['node', '--test']` — prettier's canonical
formatting of the kit's own double-quoted output) was rejected by
`JSON.parse` inside the hand-rolled parser and **silently ignored**. With an
empty command list, `kit verify` reported `BLOCKED` with zero checks and no
explanation.

**Fix.**

- The parser now accepts the serializer's output, single- and double-quoted
  flow arrays, plain scalar commands (`- node --test` → argv), and flow-style
  category values (`test: ['node', '--test']`).
- Anything unparseable is now a **hard error with a line number** (unknown
  top-level keys, unknown command categories, empty command arrays, garbage
  entries) — silent drops are gone.
- The serializer emits prettier-stable single-quoted arrays, so
  `pnpm format` no longer rewrites profiles into a format the kit itself
  could not previously read.
- `kit verify` with zero checks now prints an explicit hint showing the
  expected `commands:` YAML shape.
- A regression test parses the committed fixture and asserts
  `test: [['node', '--test']]`.

## 4. `kit inspect`: no fabricated git state

**Finding.** `kit inspect` on a folder with no `.git` reported
`branch=main, dirty=false, commit=0000000` — `git-scanner.ts` substituted
defaults (`'main'`, a zero SHA) whenever git failed, presenting fabricated
state as real.

**Fix.** `GitState` now carries `isRepo: boolean`; the scanner checks
`git rev-parse --is-inside-work-tree` first and returns
`{ isRepo: false, branch: '', headSha: '' }` for non-repositories.
`kit inspect` prints `Git Status: (not a git repository)`.

## 5. Stack detection: evidence-based labels

**Finding.** Two flaws: (1) any `Gemfile` labeled the project `ruby-rails` —
a plain Ruby project was mislabeled as a Rails app; (2) any
`pyproject.toml`/`requirements.txt` reported `pytest` (and `pip`)
unconditionally, even for projects with no pytest anywhere.

**Fix.**

- Ruby: `ruby-rails` requires Rails evidence (`config/application.rb`,
  `bin/rails`, or a `rails` gem in the Gemfile); otherwise a Gemfile yields
  the honest `ruby` label.
- Python: `pytest` is reported only with evidence (pytest dependency in
  `requirements.txt`/`pyproject.toml`, `pytest.ini`, or `conftest.py`);
  package manager detection recognizes `poetry` (lock file or
  `[tool.poetry]`) and `uv` before defaulting to `pip`.

## 6. Spec parser: no silent `FEATURE-001`

**Finding.** A `SPEC.md` without a well-formed `# FEATURE-NNN: Title` heading
silently parsed as `id: FEATURE-001, title: Untitled Feature`.

**Fix.** Missing or malformed title lines are now a hard `SPEC_INVALID`
error that names the expected format.

---

## Verification

`pnpm verify` (architecture check → build → lint → typecheck → test) passes:
**527 tests across 11 packages** (485 → 527: +42 new tests covering the
plugin manifests and type contracts, the self-contained bundle guard, the
plugin linker (including hooks/-relative resolution), the YAML parser, the
stack detector, the git scanner, spec parser strictness, streaming handler
drainage, and the full phase-gated TDD cycle including all
invariant-violation paths).

All four plugins pass the **real** Claude Code validator
(`npx @anthropic-ai/claude-code plugin validate <plugin>`), exercised
through the symlinks `kit install --profile runtime` creates.

All versions aligned at **0.7.3** (root, packages, plugins, plugin
manifests, CLI VERSION constant, ownership manifest entries).
