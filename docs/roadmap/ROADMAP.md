# ROADMAP.md — Agentic SDLC Kit

Status: M0 frozen. Milestones, dependencies, and acceptance gates. The first
concrete implementation package (M0 + M1 + CI baseline + reference fixture)
is the scope of this release; later milestones are planning labels.

## 1. Milestone overview

| Milestone | Title                                          | Release     |
| --------- | --------------------------------------------- | ----------- |
| M0        | Product and architecture baseline              | 0.1 (this)  |
| M1        | Core platform foundation                       | 0.1 (this)  |
| M2        | Repository discovery and project init          | 0.2         |
| M3        | Requirements engineering                       | 0.3         |
| M4        | Architecture and implementation planning       | 0.3         |
| M5        | TDD implementation engine                      | 0.4         |
| M6        | Deterministic verification engine              | 0.4         |
| M7        | Complete incremental feature workflow          | **0.5**     |
| M8        | Greenfield application workflow                | 0.6         |
| M9        | Bug-fix and refactoring workflows              | 0.6         |
| M10       | Runtime governance Mod                         | 0.7         |
| M11       | Secret Guard Mod                               | 0.7         |
| M12       | Model and effort Router Mod                    | 0.8         |
| M13       | Run Observer Mod                               | 0.8         |
| M14       | Technology stack packs                         | 0.9         |
| M15       | CLI installer and plugin distribution          | 1.0         |
| M16       | CI/CD, compatibility, release engineering      | 1.0         |
| M17       | Security, reliability, production hardening    | 1.0         |
| M18       | Ecosystem integrations and extensibility       | 1.x         |

**M7 is the first major product release.** A sophisticated router or
dashboard before M7 is infrastructure around an incomplete product.

## 2. M0 — Product and architecture baseline

**Scope:** Freeze what we are building before any implementation.

**Required artifacts (all delivered in this release):**

| Artifact        | Path                                       | Status   |
| --------------- | ----------------------------------------- | -------- |
| PRODUCT.md      | `docs/product/PRODUCT.md`                  | frozen   |
| REQUIREMENTS.md | `docs/requirements/REQUIREMENTS.md`        | frozen   |
| ARCHITECTURE.md | `docs/architecture/ARCHITECTURE.md`        | frozen   |
| MODULES.md      | `docs/modules/MODULES.md`                  | frozen   |
| WORKFLOWS.md    | `docs/workflows/WORKFLOWS.md`              | frozen   |
| CONTRACTS.md    | `docs/contracts/CONTRACTS.md`              | frozen   |
| SECURITY.md     | `docs/security/SECURITY.md`                | frozen   |
| TESTING.md      | `docs/testing/TESTING.md`                  | frozen   |
| ROADMAP.md      | `docs/roadmap/ROADMAP.md` (this file)      | frozen   |
| ADRs            | `docs/adr/ADR-0001..0009.md`               | frozen   |

**Frozen decisions:**

| Concern                          | Decision                                       | ADR          |
| -------------------------------- | --------------------------------------------- | ------------ |
| Primary language                 | TypeScript                                    | ADR-0001     |
| Package manager                  | pnpm workspaces                               | ADR-0002     |
| Architecture                     | Modular monorepo                              | ADR-0003     |
| Core                             | Runtime-independent                           | ADR-0004     |
| First runtime                    | Claude Code                                   | ADR-0005     |
| Plugin model                     | Independently installable plugins             | ADR-0006     |
| Workflow engine                  | Shared contracts and workflow orchestration   | ADR-0007     |
| Knowledge                        | Skills, agents, commands, pattern references  | (M3+)        |
| Automation                       | Deterministic TypeScript scripts              | (M1)         |
| Project configuration            | `.ai-kit/project.yml`                         | ADR-0008     |
| Persistent engineering artifacts | Markdown + validated structured metadata      | ADR-0007     |
| Testing                          | Unit, integration, contract, e2e              | (TESTING.md) |
| Security                         | Explicit approval, least privilege            | ADR-0009     |
| Initial target                   | Existing-project incremental feature dev      | (PRODUCT.md) |

**Exit criteria (all met in this release):**
- Product scope and non-goals are documented.
- Package boundaries are approved.
- Core contracts are defined.
- Runtime adapter boundary is documented.
- Project profile schema is specified.
- Workflow states and transitions are defined.
- Security and approval policies are documented.
- Test and Definition of Done policies are agreed.
- M1 implementation tasks are approved.

M0 explicitly protects against scope explosion. No Mod, no stack pack, no
slash command is implemented in M0. Their absence is correct.

## 3. M1 — Core platform foundation

**Scope:** A buildable, testable TypeScript monorepo that provides the
foundation for every later milestone. The complete SDLC workflow is **not**
implemented in M1.

### 3.1 Repository structure

```
agentic-sdlc-kit/
├── .github/workflows/
├── docs/                    # M0 artifact freeze
├── packages/
│   ├── contracts/
│   ├── core/
│   ├── cli/
│   ├── testing/
│   └── claude-code-adapter/
├── fixtures/
│   └── fixture-node-fullstack/
├── scripts/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── eslint.config.js
├── .gitignore
└── README.md
```

The `claude-code-adapter` exists as an architectural boundary in M1; the
host SDK is not imported until M10.

### 3.2 Task breakdown

| ID    | Task                                | Deliverable                                                   | Status |
| ----- | ----------------------------------- | ----------------------------------------------------------- | ------ |
| M1-01 | Initialize monorepo                 | pnpm workspace and package structure                        | done   |
| M1-02 | Configure TypeScript                | Shared compiler configuration and build conventions         | done   |
| M1-03 | Establish contracts package         | Initial shared types and schemas                            | done   |
| M1-04 | Establish core package              | Runtime-independent application boundaries                  | done   |
| M1-05 | Establish cli package               | Executable CLI skeleton                                     | done   |
| M1-06 | Establish testing package           | Fixtures and common test utilities                          | done   |
| M1-07 | Add project profile schema          | Versioned project configuration contract                    | done   |
| M1-08 | Add error and result conventions    | Consistent error handling and output contracts              | done   |
| M1-09 | Add quality gates                   | Lint, format, typecheck, tests, build                       | done   |
| M1-10 | Add repository documentation        | Contribution and architecture instructions                  | done   |
| M1-11 | Add baseline CI                     | Automated checks for pull requests                          | done   |

### 3.3 Acceptance criteria (all must be met for 0.1)

1. All workspace packages build successfully.
2. Shared contracts can be imported without circular dependencies.
3. Core does not depend on Claude Code APIs.
4. CLI launches and displays help/version information.
5. Project profile validation has tests.
6. CI runs tests, lint, typecheck and build.
7. A clean checkout can reproduce the successful build.
8. No placeholder package is presented as a working feature.

Each criterion has a corresponding test enumerated in `TESTING.md` §4.

## 4. M2 — Repository discovery and project initialization

**Objective:** Make the kit understand an existing repository before it
changes anything.

**Tasks:**

| ID    | Task                       | Acceptance criteria                                  |
| ----- | -------------------------- | --------------------------------------------------- |
| M2-01 | Repository scanner         | Detect supported project structures                 |
| M2-02 | Stack detection            | Identify frameworks and tooling                     |
| M2-03 | Convention discovery       | Capture existing naming and directory patterns      |
| M2-04 | Git-state discovery        | Report branch, dirty files, current commit          |
| M2-05 | Project profile generator  | Generate proposed configuration                     |
| M2-06 | Profile validator          | Reject malformed or unsupported profiles            |
| M2-07 | `kit init`                 | Require approval before writing project config      |
| M2-08 | `kit inspect`              | Produce a read-only repository report               |
| M2-09 | `kit doctor`               | Check toolchain and configuration health            |

**Critical constraints:** read-only inspection; never execute discovered
scripts; never copy secret contents; preserve existing `CLAUDE.md` /
`AGENTS.md`; never silently overwrite.

**Exit:** the kit can inspect and initialize an existing Node.js or Rails
repository without modifying application source code.

## 5. M3 — Requirements engineering

**Skills:** `requirements-engineering`, `repo-discovery`, `tdd-bdd`.

**Commands:** `/kit:spec`, `/kit:requirements`.

**Validator:** `kit validate-spec` — required sections, unique IDs,
ambiguous acceptance, traceability, unresolved high-risk questions, explicit
scope boundaries.

**Exit:** a feature specification can be generated, reviewed, validated, and
stored before implementation begins.

## 6. M4 — Architecture and implementation planning

**Skills:** `system-design`, `implementation-planning`,
`design-pattern-selection`.

**Agents:** Repository Analyst, Architecture Reviewer.

**Validator:** `kit validate-plan` — missing dependencies, cycles, invalid
IDs, missing acceptance, missing verification, oversized tasks, missing
traceability, missing integration/regression coverage.

**Exit:** the kit produces an architecture-aware, validated implementation
plan with a dependency graph.

## 7. M5 — TDD implementation engine

**Lifecycle:** select task → understand code → write failing test →
implement minimum change → verify and refactor → record evidence.

**Skills:** `tdd-bdd`, `code-quality`, `design-pattern-selection`.

**Required behavior:** no multi-task uncontrolled ops; preserve architecture
unless approved; never change tests just to make impl pass; add regression
coverage for bug fixes; refactor only under test; stop when blocked.

**Exit:** a task can be implemented through a repeatable TDD loop with
progress and evidence preserved between sessions.

## 8. M6 — Deterministic verification engine

**Categories:** unit, integration, contract, e2e, static analysis, type
checking, security, performance, build.

**Commands:** `kit verify`, `kit verify --task TASK-001`,
`kit verify --changed`, `kit verify --report`.

**Execution model:** argument arrays, `shell: false`, scoped cwd, validated
arguments, bounded timeouts. Generated plans never become trusted shell
scripts.

**Result semantics:** `passed` ≠ `failed` ≠ `skipped` ≠ `blocked`. Skipped
checks never count as passed.

**Exit:** the kit executes configured quality checks and produces a
verifiable report with command, result, duration, and evidence.

## 9. M7 — Complete incremental feature workflow (first major product release)

**Public command:** `/kit:feature`.

**End-to-end experience:** inspect → profile → identify affected modules →
generate spec → generate acceptance+BDD → architecture analysis → recommend
patterns where necessary → produce dependency-aware plan → execute tasks
incrementally via TDD → run focused and regression verification → independent
code review → update documentation → completion report.

**Acceptance test:** uses an actual existing application fixture (not a toy
repo). The fixture has business logic, a database, backend APIs, frontend
components, existing tests, existing conventions, and at least one area with
meaningful regression risk. The kit completes a feature from specification
to verified implementation without losing the original repository state.

This is the first milestone considered a genuine product release.

## 10. M8 — Greenfield application workflow

**Command:** `/kit:app`.

**Workflow:** discovery → requirements → system design → data design → API
design → security design → planning → foundation scaffold → vertical
slices → verification → review → release.

**Critical design choice:** vertical slices only, never one-pass generation
of the entire production app.

## 11. M9 — Bug-fix and refactoring workflows

**Commands:** `/kit:fix`, `/kit:refactor`.

**Acceptance:** the system distinguishes behavior change, structural
refactor, bug correction, and performance optimization. It does not silently
combine all four.

## 12. M10 — Runtime governance Mod

**Plugin:** `plugins/sdlc-guard/`.

**Protects:** file deletion, bulk modification, db migration, production db
mutation, git force push, release/deploy, secret/config modification,
dependency removal.

**Design:** policy evaluation is a pure function in `core`; the adapter
applies the verdict to the host.

**Non-negotiable limitation:** Mods are not an OS sandbox. Real isolation
comes from OS permissions, containers, restricted credentials, and
deployment controls. See `SECURITY.md` §4.

**Exit:** policy decisions have deterministic unit tests; destructive cases
covered by integration tests; non-interactive behavior explicitly defined;
fail-open/fail-closed documented per action; bypass cannot silently turn
deny into allow.

## 13. M11 — Secret Guard Mod

**Capabilities:** detect patterns, redact from tool output, inspect file
writes, scan staged changes, scan commits/pushes, integrate with Gitleaks,
explicit ignore policy, findings without printing secret values.

**Exit:** adversarial test suite proves representative credentials are
detected and redacted in every supported path; scanner failures cannot be
misreported as clean.

## 14. M12 — Model and effort Router Mod

**Decision inputs:** task type, complexity, risk, reasoning depth, repo
size, required tool capabilities, explicit user model selection.

**Critical distinction:** complexity and risk are separate. Rename a small
component (low/low); delete production records (low/high); design authz
(high/high); analyze a complex dependency graph (high/medium).

**Routing policy:** preserve explicit user choice; route main-turn and
subagent separately; route model and effort independently; deterministic
fallback; escalate when verification indicates inadequate results; suggest-
only mode initially; external classifiers optional.

**Exit:** routing test suite demonstrates correct selection, explicit-choice
preservation, fallback, risk-aware handling, and deterministic behavior
without a network classifier for ordinary decisions.

## 15. M13 — Run Observer Mod

**Collects:** session/workflow lifecycle, agent spawn/completion, tool calls
and outcomes, model/effort selection, duration, token usage, verification
results, escalations and retries, failures and blocked actions, cost where
reliable.

**Output:** `.ai-kit/reports/runs/<RUN-NNN>/{summary.json,events.jsonl,
verification.json,review.md}`.

**Interface:** CLI first (`kit runs`, `kit runs show RUN-001`, `kit runs
report RUN-001`); a dashboard is later, not a prerequisite.

**Acceptance:** stable event IDs and schemas; collection does not materially
block tool execution; sensitive values redacted; local retention and cleanup
defined; partial or missing telemetry represented honestly.

## 16. M14 — Technology stack packs

**Packs:** `node-typescript`, `react-typescript`, `ruby-rails`, `python`,
`go`. Each contains `manifest.json`, `skills/`, `references/`, `templates/`,
`scripts/`, `policies/`, `tests/`.

**Quality:** follow repo conventions; keep stack-specific instructions
isolated; do not duplicate core lifecycle logic; validate against real
fixtures; do not force patterns where simpler existing solutions suffice.

**Patterns catalog:** architecture, creational, structural, behavioral,
resilience, data, testing. Documented once as language-independent concepts,
linked to implementation examples in stack packs.

## 17. M15 — CLI installer and plugin distribution

**Profiles:** minimal, full-sdlc, runtime, stack-specific.

**Commands:** `kit install [--profile X] [--stack Y]`, `kit update`,
`kit doctor`, `kit uninstall [--dry-run]`.

**Requirements:** idempotent install; project and user scopes; explicit
overwrite confirmation; dry-run; ownership manifest; symlink protection;
file backup/preservation; version/compat checks; safe uninstall of only
kit-owned files; no silent modification of user configuration.

## 18. M16 — CI/CD, compatibility, release engineering

**CI checks:** workspace install, format, lint, typecheck, unit, integration,
contract, plugin validation, CLI integration, security scan, build,
packaging.

**Compatibility matrix:** Node.js, pnpm, TypeScript, Claude Code, plugin
API/types. No broad compatibility claims based on one local run.

**Release workflow:** change → tests → security scan → compat validation →
package validation → versioning → release notes → publish → post-release
smoke.

**Exit:** every release has an immutable version, verified package artifacts,
release notes, and a reproducible validation record.

## 19. M17 — Security, reliability, production hardening

**Test domains:** installer, discovery, workflow engine, planning, executor,
secret guard, runtime guard, router, observer, stack packs.

**Reliability:** bounded retries, explicit timeouts, failure recovery,
idempotent operations, structured logs, versioned persistent state, safe
handling of interrupted workflows, no false-positive verification success.

## 20. M18 — Ecosystem integrations and extensibility

**Runtime adapters:** Claude Code (M1 boundary, M10 wired), Codex (M18),
others after validating their APIs.

**Integrations:** GitHub Issues/PRs, Jira/Linear, CI providers, MCP servers,
docs systems, project knowledge systems.

**Extension API:** stack packs, skills, agents, commands, validators,
policy packs, runtime adapters. Every extension declares schema version,
compatibility range, required capabilities, dependencies, trust level,
installation behavior, and test/validation requirements.

**Exit:** extensions can be added without changes to the core workflow
engine.

## 21. Dependency map

```
M0 ─▶ M1 ─▶ M2 ─▶ M3 ─▶ M4 ─▶ M5 ─▶ M6 ─▶ M7
                                              │
                                              ▼ first product release
                                   ┌──── M8 / M9 ────┐
                                   │                  │
                              M10 / M11         M12 / M13
                                   │                  │
                                   └────── M14 ───────┘
                                              │
                                              ▼
                                  M15 ─▶ M16 ─▶ M17 ─▶ M18
```

Strict dependencies:
- M10–M13 require the Claude Code adapter contracts from M1.
- M12 and M13 require stable event and execution contracts.
- M15 depends on the CLI and plugin packaging conventions.
- M16 must validate all supported package types and versions.
- M17 must test the actual combined product, not isolated modules only.

## 22. Release gates

| Release | Includes  | What users can accomplish                          |
| ------- | --------- | ------------------------------------------------- |
| 0.1     | M0–M1     | Installable development foundation                |
| 0.2     | M2        | Safely inspect and initialize projects            |
| 0.3     | M3–M4     | Generate validated specifications and plans       |
| 0.4     | M5–M6     | Execute tasks and verify changes                  |
| 0.5     | M7        | Develop a complete existing-project feature       |
| 0.6     | M8–M9     | Build apps, fix bugs, refactor                    |
| 0.7     | M10–M11   | Protect sensitive and destructive operations      |
| 0.8     | M12–M13   | Route and observe execution                       |
| 0.9     | M14       | Use stack-specific engineering packs              |
| 1.0     | M15–M17   | Install, update, verify, maintain the kit         |
| 1.x     | M18       | Extend to additional runtimes and integrations    |

Release numbers are proposed planning labels, not published versions.

## 23. Recommended implementation order

Resist the temptation to start with visible Mods (router, dashboard, secret
detection, agent orchestration). The highest-value sequence is:

1. M0: freeze architecture, contracts, security, scope.
2. M1: clean, buildable TypeScript monorepo.
3. M2: reliable repository discovery.
4. M3–M4: validated requirements and plans.
5. M5–M6: controlled development and verification.
6. M7: prove the complete feature workflow against real repositories.
7. M8–M9: greenfield, fix, refactor.
8. M10–M11: safety and security Mods.
9. M12–M13: routing and observability.
10. M14–M17: stacks, distribution, CI, hardening.
11. M18: ecosystem.

## 24. Strongest recommendation

**M7 is the first major success criterion**, not M12 or M13.

A kit that takes a real existing Rails or Node.js repository, understands
its architecture, produces a valid feature specification, plans vertical
slices, writes tests, implements changes, verifies regressions, and produces
a trustworthy report — is already useful.

A sophisticated router or dashboard without that capability is just
infrastructure around an incomplete product.

## 25. Current release (0.1) scope

This release delivers:
- M0 artifact freeze (10 docs + 9 ADRs).
- M1 tasks M1-01 through M1-11.
- Baseline CI.
- Reference fixture `fixture-node-fullstack`.

Everything from M2 onward is intentionally out of scope and is described
above only so that the M1 architecture does not have to be refactored when
those milestones arrive.
