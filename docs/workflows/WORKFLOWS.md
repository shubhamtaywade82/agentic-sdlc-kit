# WORKFLOWS.md — Agentic SDLC Kit

Status: M0 frozen. Declares the four workflow lifecycles the kit will support
across milestones. M1 implements only the state-transition table for
`WorkflowStatus` in `packages/core`; the orchestration logic ships in later
milestones.

## 1. Workflow modes

```ts
type WorkflowMode = 'app' | 'feature' | 'fix' | 'refactor';
```

| Mode     | Entry command   | First milestone | What it produces                                   |
| -------- | --------------- | --------------- | -------------------------------------------------- |
| app      | `/kit:app`      | M8              | A new application from a product brief             |
| feature  | `/kit:feature`  | M7              | An incremental feature on an existing repository   |
| fix      | `/kit:fix`      | M9              | The smallest valid correction plus regression test |
| refactor | `/kit:refactor` | M9              | Behavior-preserving structural change              |

## 2. Workflow status state machine

```ts
type WorkflowStatus =
  | 'pending' // created, not started
  | 'in_progress' // a task is currently being executed
  | 'blocked' // waiting on approval, dependency, or external input
  | 'completed' // all tasks done and verification passed
  | 'failed'; // a task failed or verification failed
```

Allowed transitions (enforced by `core.workflows.engine`):

```
pending ──start──▶ in_progress
in_progress ──block──▶ blocked
blocked ──resume──▶ in_progress
in_progress ──complete──▶ completed
in_progress ──fail──▶ failed
blocked ──fail──▶ failed
```

`completed` and `failed` are terminal. No transition may turn `failed` back
into `completed` without a new run. This invariant is enforced by the state
machine and tested in `packages/core/src/workflows/engine.test.ts`.

## 3. Workflow state

```ts
interface WorkflowState {
  runId: string; // stable, reproducible (not a timestamp)
  mode: WorkflowMode;
  status: WorkflowStatus;
  startedAt: string; // ISO 8601, set when transitioned to in_progress
  currentTaskId?: TaskId;
  taskHistory: Array<{ taskId: TaskId; status: CheckStatus; evidence?: string[] }>;
}
```

`runId` is content-derived (hash of mode + target + plan) where possible; a
counter fallback is allowed but documented in the run record.

## 4. Feature workflow (`/kit:feature`, M7)

```
1. Inspect repository               (M2)  core.discovery
2. Load / generate project profile  (M2)  core.project-profile
3. Identify affected modules        (M2)  core.discovery
4. Generate feature specification   (M3)  Skill: requirements-engineering
5. Generate acceptance + BDD        (M3)  Skill: requirements-engineering
6. Architecture analysis            (M4)  Agent: repository-analyst
7. Produce implementation plan      (M4)  Skill: implementation-planning
8. Validate plan                    (M4)  kit validate-plan
9. For each vertical-slice task:    (M5)  Skill: tdd-bdd
     a. Understand existing code
     b. Write a failing test
     c. Implement minimum change
     d. Run focused tests
     e. Refactor under test
     f. Record task evidence
10. Run regression verification     (M6)  core.verification
11. Independent code review         (M7)  Agent: architecture-reviewer
12. Update documentation            (M7)  core.artifacts
13. Produce completion report       (M7)  core.artifacts
```

Each step persists an artifact under `docs/` or `.ai-kit/`. Each step that
performs a destructive action goes through `core.policy.evaluator` (M10).

### 4.1 Test-strength stage (`kit feature ... strength`, ADR-0022)

After a task completes its Red -> Green -> Refactor chain, an optional
strength stage measures whether the suite would actually catch a
regression (mutation testing), budgeted and capped:

```yaml
# .ai-kit/project.yml
verification:
  strength:
    enabled: true # opt-in; default false in v1
    threshold: 60 # mutation score percentage
    budgetMs: 300000 # hard cap; a timeout is recorded 'incomplete'
    scope: diff # mutate the task's likelyFiles (per-task speed)
    gateMode: warn # warn | enforce
```

- `kit feature <id> strength <task-id>` runs the stack's mutation tool
  (StrykerJS for `node-typescript`; mutmut, mutant, go-mutesting,
  cargo-mutants, Stryker.NET adapters for other stacks), records a
  `StrengthEvidence` entry on the task and a `strength.recorded`
  journal event, and reports the score.
- `kit verify --strength` runs the same measurement standalone.
- `gateMode: enforce` makes `verify` refuse completion below threshold
  (or on missing/`incomplete` evidence). `warn` never blocks.
- Honest limits: the mutation score is a proxy, not proof; diff scope
  can miss cross-file escapes; an unparsable report is `incomplete`,
  never a guessed score (ADR-0022).

## 5. App workflow (`/kit:app`, M8)

Vertical-slice-driven, never single-pass:

```
1. Product discovery       → docs/specifications/product/<id>/BRIEF.md
2. Requirements            → docs/specifications/product/<id>/PRD.md
3. System design           → docs/architecture/ + ADRs
4. Data design             → docs/architecture/data-model.md
5. API design              → docs/architecture/api/<contract>.openapi.json
6. Security design         → docs/security/threat-model.md
7. Planning                → docs/plans/<id>/PLAN.md + TASKS.md
8. Foundation scaffold     → repository + app skeleton
9. For each slice:         → vertical slice implementation
     a. Plan the slice
     b. Implement
     c. Verify
     d. Review
10. Final release          → docs/releases/<id>/RELEASE.md
```

The critical design choice (ADR-0006): never ask the AI to generate the
entire production application in one pass.

## 6. Fix workflow (`/kit:fix`, M9)

```
1. Capture expected vs actual behavior
2. Reproduce the bug
3. Identify root cause
4. Add a regression test that fails on the bug
5. Implement the smallest valid correction
6. Run focused tests
7. Run regression checks
8. Review the diff
9. Document the result
```

The system must **not** silently combine a behavior change with a
refactor or a performance optimization. The user explicitly declares the
mode; the kit does not infer it.

## 7. Refactor workflow (`/kit:refactor`, M9)

```
1. Identify current behavior
2. Discover callers and dependencies
3. Establish characterization tests where required
4. Define the intended structural change
5. Preserve observable behavior
6. Refactor in small increments
7. Run regression tests after each increment
8. Compare before/after structure and quality
```

## 8. Workflow → Milestone → Module traceability

| Step in any workflow  | Provided by (milestone) | Module                          |
| --------------------- | ----------------------- | ------------------------------- |
| Inspect repository    | M2                      | core.discovery                  |
| Generate profile      | M2                      | core.project-profile.generator  |
| Validate profile      | M2                      | core.project-profile.validator  |
| Generate spec         | M3                      | Skill: requirements-engineering |
| Validate spec         | M3                      | kit validate-spec (cli)         |
| Architecture analysis | M4                      | Agent: repository-analyst       |
| Plan                  | M4                      | Skill: implementation-planning  |
| Validate plan         | M4                      | kit validate-plan (cli)         |
| Implement task        | M5                      | Skill: tdd-bdd                  |
| Verify                | M6                      | core.verification.runner        |
| Code review           | M7                      | Agent: architecture-reviewer    |
| Approval gate         | M10                     | core.policy.evaluator + adapter |
| Secret guard          | M11                     | Mod: secret-guard               |
| Model routing         | M12                     | Mod: model-router               |
| Observability         | M13                     | Mod: run-observer               |

## 9. Cross-cutting standards (apply to every workflow)

### A. Every task is independently verifiable

A task has: an ID, an explicit description, acceptance criteria, a
verification procedure, dependencies, likely affected files, estimated
scope, risk classification, and a clear completion status. No task is
accepted merely because it appears complete.

### B. Definition of Done

| Dimension      | Completion requirement                      |
| -------------- | ------------------------------------------- |
| Requirements   | Acceptance criteria satisfied               |
| Architecture   | Consistent with approved boundaries         |
| Implementation | No unrelated changes                        |
| Tests          | Required tests executed successfully        |
| Regression     | Relevant existing behavior verified         |
| Quality        | Lint and typecheck pass where configured    |
| Security       | Relevant security checks completed          |
| Documentation  | Updated where behavior or contracts changed |
| Review         | Independent review completed                |
| Evidence       | Verification report persisted               |

### C. Keep agent context small

A root instruction file is short. Procedures live in on-demand Skills.
Path-scoped rules live next to the code they govern. Agents handle
independent analysis. Scripts handle deterministic checks.

### D. Separate deterministic and AI-driven work

| Activity                    | Mechanism                                |
| --------------------------- | ---------------------------------------- |
| Requirements analysis       | AI-assisted workflow                     |
| Architecture recommendation | AI-assisted workflow                     |
| Task planning               | AI plus deterministic validator          |
| Secret scanning             | Deterministic scanner                    |
| Destructive-action approval | Policy engine and host controls          |
| Unit tests                  | Test runner                              |
| Type checking               | TypeScript compiler                      |
| Lint                        | Linter                                   |
| Verification reporting      | Deterministic engine                     |
| Code review                 | Independent AI review plus static checks |
| Model routing               | Deterministic rules first                |

The kit MUST NOT use an LLM to validate facts a deterministic program can
verify more reliably. This is an architectural invariant
(`ARCHITECTURE.md` §6, enforced by `core.policy.evaluator` in M10).

## 5. Two ways to drive the feature workflow (M36, ADR-0019)

The feature lifecycle has ONE engine — the TDD state machine in
`packages/core` (ADR-0018) — and two ways to drive it. The modes produce
equivalent evidence; they never become two implementations.

### Mode 2 — agent-led (existing)

An external agent or developer executes each step and invokes the phase
gates between steps:

```
kit feature FEATURE-001 start          # validate spec/plan, init run state
kit feature FEATURE-001 red TASK-001   # task's verification MUST fail (assertion)
#   ... agent implements ...
kit feature FEATURE-001 green TASK-001 # task's verification MUST pass
kit feature FEATURE-001 refactor TASK-001
kit feature FEATURE-001 verify         # audit chain + whole-profile verification
```

### Mode 1 — kit-orchestrated (PR3, M36)

```
kit feature FEATURE-001 run [--provider <id>]   # default provider: claude-code (PR4)
```

The orchestrator, for every pending task phase (red, then green, then
refactor, in the plan's execution order):

1. builds one bounded `AgentExecutionRequest` (phase-specific
   instructions, the task's own verification command, the frozen policy
   snapshot and its hash, and the run's isolated git worktree as the
   explicit workspace);
2. executes it through the configured provider via the agent gateway;
3. if the provider reports anything other than `completed`, STOPS — the
   status is persisted and reported honestly;
4. if it reports `completed`, runs the SAME `runTddPhase` gate Mode 2
   uses. The gate decides: an assertion-classified failure advances Red,
   a pass advances Green/Refactor, and a lying agent is rejected
   (`phase_gate_rejected`).

When every task has a complete chain, the orchestrator runs the SAME
`finalizeFeatureRun` whole-profile verification, in the worktree.

**Evidence stores:** the TDD run state lives in the worktree at
`.ai-kit/state/feature-runs/<featureId>.json` (written by core, identical
to Mode 2). The orchestration linkage (run id, workspace identity,
execution ids) lives in the main repository at
`.ai-kit/state/orchestrations/<featureId>.json`, and the durable
execution records (frozen requests, policy snapshots, event streams,
audit trails) live at `.ai-kit/state/agent-executions/`.

**Resumability:** the worktree and its run state persist. Re-running
`kit feature <id> run` after a cancellation or crash resumes from the
first incomplete task/phase — derived from the run state, which is the
authority. A completed orchestration refuses to re-run.

**Cancellation:** SIGINT aborts the in-flight execution through the
gateway; the execution is recorded `cancelled` and the next invocation
resumes.

**Provider configuration is a prerequisite:** with no provider
registered, `run` fails with `AGENT_PROVIDER_NOT_CONFIGURED` (exit 3)
and never falls back to pretending a manual workflow completed. PR4
adds the first real provider (claude-code, headless).
