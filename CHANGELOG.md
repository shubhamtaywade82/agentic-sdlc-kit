# Changelog

All notable changes to the AI Dev Kit. Format: Keep a Changelog; versioning: SemVer.

## [5.0.0] — 2026-11-19

Major release: the kit becomes the **Agentic SDLC Kit** per the architecture
proposal — three installable components, a deterministic `kit` CLI, and a
runtime governance layer built on the (now official) Claude Code Mods API.
Everything v4 is preserved (installer security model, MCP server, five tested
adapters, MIT license) — see `docs/migration-v4-to-v5.md`.

### Added — `kit` CLI (component: kit-cli, zero runtime deps, Node ≥ 18)
- `kit doctor / inspect / init` — environment check, project inventory,
  profile + skeleton generation (`.ai/project.yml`).
- `kit validate-spec / validate-plan` — structural gates for feature specs
  and task plans (frontmatter + sections; dependency graph with cycle
  detection; precise line-numbered errors; exit codes 0/1/2/3).
- `kit verify` — quality gate runner: profile commands executed strictly as
  argument arrays with `shell:false` and timeouts; machine-readable
  VerificationReport (PASS/FAIL/SKIPPED/BLOCKED — skipped is never passed)
  written to `.ai/reports/verification/`.
- `kit audit` — secret scan (canonical high-confidence patterns + allowlist)
  and dependency audit (npm/bundle) with truncated previews only.
- `kit changed / release-check / scaffold` — diff classification, release
  readiness (changelog, evidence recency, tag, tree, audit), and conforming
  artifact scaffolding.

### Added — sdlc-runtime (optional component, Claude Code ≥ 2.1.287)
- Four mods under `runtime/` installed to `.ai/mods/` via `--runtime`:
  **sdlc-guard** (destructive command + protected-path governance, approval
  asks for migrations/deploys), **model-router** (opt-in subagent model/effort
  routing; main-conversation rewrites only with explicit profile opt-in),
  **secret-guard** (write/commit secret detection, same canonical patterns
  as `kit audit`), **run-observer** (tool/turn/agent telemetry to
  `.ai/reports/runs/`, `/kit:status` command).
- Policy cores are pure TypeScript unit-tested in CI (74 tests); every
  denying hook fails closed via `.catch`.

### Changed — sdlc-core restructured
- **Six commands** (`/kit:init /kit:app /kit:feature /kit:fix /kit:review
  /kit:release`) replace the seven v4 commands; three execution modes
  (new app / existing-app feature / fix+refactor) documented in the rewritten
  `workflows/00-overview.md` (10-stage lifecycle).
- **Nine skills** (repo-discovery, requirements-engineering, system-design,
  implementation-planning, tdd-bdd, design-pattern-selection, code-quality,
  security-engineering, release-engineering); pattern catalogs moved into
  stack packs (`.ai/stack/<name>/patterns/`); new stack-agnostic references:
  selection policy, 7-category catalog, architecture/resilience/data/testing
  patterns.
- **Four agents** (repository-analyst, architecture-reviewer, code-reviewer,
  security-reviewer) — read-only analysis roles; implementation stays with
  the primary agent.
- Docs taxonomy: `docs/product`, `docs/specifications/{features,technical}`,
  `docs/architecture/adr`, `docs/testing`, `docs/security`, `docs/releases`.
- Definition of Done is now the 11-gate table with verification-report
  evidence; `workflows/09-operations.md` closes the lifecycle loop.
- MCP server: v5 data (10 stages, three modes, spec/plan templates, updated
  checklists); server version 5.0.0.

### Added — M0 architecture documentation
- `docs/architecture/` — system design (layers, components, runtime
  independence, milestone status), security model, versioning policy.
- Contracts: project profile, verification report, spec/plan formats,
  canonical secret patterns.
- Eight ADRs + `docs/migration-v4-to-v5.md`; `components.json` registry.

### Engineering
- `scripts/check.sh` v5: components/structure validation (6 commands, 9
  skills, 4 agents, 4 mods, 4 stacks), kit CLI build+test, runtime policy
  tests, regression suite, MCP smoke.
- CI adds dedicated `kit-cli` and `kit-runtime` jobs (SHA-pinned actions);
  regression suite extended to ~160 assertions covering component selection,
  CLI-in-target behavior, mods layout, and all v4 security gates.

## [4.0.0] — 2026-11-19

Response to the independent review of `ai-dev-kit (3).zip` (see `REVIEW-RESPONSE.md`).

### Fixed — installer safety (review Critical/High findings)
- **Symlink traversal:** the installer now rejects a symlinked target root and any
  symlink on a managed path (`.claude`, `.cursor`, `.windsurf`, `.ai`, `.github`,
  `docs/...`) BEFORE writing anything; a dangling symlink at a file target is skipped,
  never written through.
- **Silent modification of pre-existing files:** all path rewriting now happens on
  staged copies in a private temp directory; pre-existing project files are never read
  or modified. Verified byte-identical by SHA-256 in the test suite.
- **Non-existent destinations:** `install.sh <new/path>` now creates the target when
  its parent exists and fails with a clear message when it does not.
- **`/tdd` command:** uses the documented `$ARGUMENTS` form (no shell-style
  `${ARGUMENTS:-...}`), with the no-argument fallback stated in plain text.
- **Leading-slash references:** adapters now say "the repository-root `AGENTS.md`"
  (relative) instead of the ambiguous `/AGENTS.md`.
- **Release approval gates:** merge, tag creation/push, release publication, and
  deployment are each named as human-approval-required, consistently in `AGENTS.md`,
  stack `AGENTS.md` files, `commands/ship.md`, and `workflows/08-release.md`.

### Added
- `tests/run-tests.sh` — ~90 assertions in 13 groups: symlink escape, byte
  preservation, idempotency, destination creation, spaces in paths, argument
  errors, manifest/uninstall behavior, installed-content checks.
- `scripts/uninstall.sh` — manifest-based removal; never follows symlinks, never
  deletes non-empty directories; supports `--dry-run`.
- Agent Skills (agentskills.io): `skills/` with `sdlc-lifecycle`, `tdd-discipline`,
  `code-review`, `debug-protocol`, plus the two design-pattern skill packs
  (Ruby/Rails and TypeScript/Node, 22 GoF patterns each); installed to `.claude/skills/`.
- MCP integration (modelcontextprotocol.io): read-only `ai-dev-kit-sdlc` server
  (stages, workflow, next-stage, templates, checklists tools), `.mcp.json.example`
  with verified community servers, `mcp/README.md` guide, stdio smoke test.
- Windsurf adapter (`.windsurf/rules/`), Gemini pointer (`GEMINI.md`),
  OpenCode/Gemini documented as native `AGENTS.md` readers.
- `stacks/node-ts-lib/` preset: published-library rules (public API discipline,
  zero-dep default, pack review, npm publish gates) + Cursor rules.
- `LICENSE` (MIT), `CHANGELOG.md`, `REVIEW-RESPONSE.md`.
- `docs/skills.md` guide; kit docs now install into `.ai/docs/`.
- `.ai/manifest` records exactly what the installer added.

### Changed
- CI: `actions/checkout` pinned to the verified v7.0.1 commit SHA
  (`3d3c42e5aac5ba805825da76410c181273ba90b1`), runs on **ubuntu-latest and
  macos-latest**, lints `scripts/` and `tests/`, and adds a dedicated MCP
  build + smoke-test job.
- README: support claims narrowed to the five tested adapters (Claude Code,
  Cursor, Windsurf, GitHub Copilot, Gemini CLI/OpenCode); removed untested
  Codex/Cline/Aider/Perplexity claims.
- `scripts/check.sh` rewritten: syntax + ShellCheck + structure checks
  (stacks, frontmatter, Agent Skills spec validation, adapter path references,
  CI SHA pin) + full regression test suite + optional MCP smoke test.

## [3.x] — earlier
Initial layout: workflows, prompts, templates, checklists, agents, commands,
stacks (rails, rails-ts, nextjs), install/check scripts.
