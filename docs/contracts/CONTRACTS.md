# CONTRACTS.md — Agentic SDLC Kit

Status: M0 frozen. The contracts declared here are implemented as TypeScript
types and zod schemas in `packages/contracts/src/`. Changes to these
contracts require an ADR and a `schemaVersion` bump where persistent.

The keyword "MUST" follows RFC 2119.

## 1. Common

### 1.1 Result and error conventions (M1-08)

```ts
// packages/contracts/src/common/result.ts
export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E = KitError> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

// packages/contracts/src/common/errors.ts
export type KitErrorCode =
  | 'CONTRACT_INVALID'
  | 'PROFILE_INVALID'
  | 'PLAN_INVALID'
  | 'VERIFICATION_FAILED'
  | 'APPROVAL_DENIED'
  | 'APPROVAL_REQUIRED'
  | 'POLICY_VIOLATION'
  | 'DISCOVERY_FAILED'
  | 'ARTIFACT_WRITE_DENIED'
  | 'TIMEOUT'
  | 'INTERNAL';

export interface KitError {
  code: KitErrorCode;
  message: string;
  cause?: unknown;
  details?: Record<string, unknown>;
}
```

Every function in `core` and `cli` returns `Result<T>` rather than throwing.
Exceptions are reserved for programmer errors (e.g., violating an
architectural invariant). This is enforced by ESLint.

### 1.2 Identifiers

```ts
export type FeatureId = string; // FEATURE-NNN
export type TaskId = string; // TASK-NNN
export type RunId = string; // RUN-NNN or content-derived
export type CheckId = string; // e.g., "unit-tests"
```

Identifiers MUST match `/^[A-Z]+-[0-9]{3,}$/` or `/^[a-z][a-z0-9-]{0,63}$/`.
The validator lives in `packages/contracts/src/common/identifier.ts`.

## 2. Project (M1-07)

### 2.1 ProjectProfile

```ts
// packages/contracts/src/project/project-profile.ts
export interface ProjectProfile {
  schemaVersion: 1;
  name: string;
  stack: string[]; // e.g., ["node-typescript", "react"]
  commands: {
    test?: string[][]; // argument arrays, never shell strings
    lint?: string[][];
    typecheck?: string[][];
    build?: string[][];
  };
}
```

Every command MUST be an array of arguments. The executor (M6) MUST run
these with `shell: false`. A string command is a contract violation.

The zod schema `ProjectProfileSchema` is exported alongside the type and is
the single source of truth for validation.

### 2.2 RepositoryScan (declared; implemented in M2)

```ts
export interface RepositoryScan {
  root: string; // absolute path
  detectedStacks: string[];
  packageManagers: string[];
  entryPoints: string[];
  testFrameworks: string[];
  hasMigrations: boolean;
  hasCi: boolean;
  agentInstructionFiles: string[]; // CLAUDE.md, AGENTS.md, etc.
  git: { branch: string; dirty: boolean; headSha: string };
}
```

Repository scanning is **read-only** and MUST NOT execute any
discovered script.

## 3. Workflow

```ts
// packages/contracts/src/workflow/workflow.ts
export type WorkflowMode = 'app' | 'feature' | 'fix' | 'refactor';

export type WorkflowStatus = 'pending' | 'in_progress' | 'blocked' | 'completed' | 'failed';

export interface WorkflowState {
  runId: RunId;
  mode: WorkflowMode;
  status: WorkflowStatus;
  startedAt?: string; // ISO 8601
  currentTaskId?: TaskId;
  taskHistory: Array<{
    taskId: TaskId;
    status: CheckStatus;
    evidence?: string[];
  }>;
}

export type WorkflowTransition = 'start' | 'block' | 'resume' | 'complete' | 'fail';
```

The transition table is enforced by `core.workflows.engine` and is the only
allowed way to mutate `WorkflowState.status`.

## 4. Specification (M3)

```ts
// packages/contracts/src/specification/specification.ts
export interface FeatureSpecification {
  id: FeatureId;
  title: string;
  overview: string;
  problem: string;
  scope: { in: string[]; out: string[] };
  actors: Array<{ name: string; role: string }>;
  functionalRequirements: Array<{ id: string; statement: string }>;
  nonFunctionalRequirements: Array<{ id: string; statement: string }>;
  acceptanceCriteria: Array<{ id: string; criterion: string }>;
  edgeCases: string[];
  dependencies: string[];
  risks: Array<{ id: string; severity: 'low' | 'medium' | 'high'; description: string }>;
  openQuestions: Array<{ id: string; question: string; resolved: boolean }>;
}

export interface BddScenario {
  feature: string;
  scenario: string;
  given: string[];
  when: string[];
  then: string[];
}
```

`kit validate-spec` (M3) checks required sections, unique IDs, ambiguous
acceptance criteria, traceability from requirements to scenarios, unresolved
high-risk questions, and explicit scope boundaries.

## 5. Planning (M4)

```ts
// packages/contracts/src/planning/task.ts
export interface Task {
  id: TaskId;
  description: string;
  acceptanceCriteria: string[];
  verification: { command: string[]; expectedStatus: CheckStatus };
  dependencies: TaskId[];
  likelyFiles: string[];
  estimatedScope: 'xs' | 's' | 'm' | 'l' | 'xl';
  risk: 'low' | 'medium' | 'high';
}

export interface DependencyEdge {
  from: TaskId;
  to: TaskId;
  reason: string;
}

export interface ImplementationPlan {
  featureId: FeatureId;
  tasks: Task[];
  edges: DependencyEdge[];
  verticalSlices: TaskId[][]; // ordered
}
```

`kit validate-plan` (M4) checks missing dependencies, circular dependencies,
invalid task IDs, missing acceptance criteria, missing verification, tasks
that are too large, tasks without links to requirements, and missing
integration or regression coverage.

## 6. Verification (M6)

```ts
// packages/contracts/src/verification/report.ts
export type CheckStatus = 'passed' | 'failed' | 'skipped' | 'blocked';

export interface Check {
  id: CheckId;
  status: CheckStatus;
  command?: string[];
  durationMs?: number;
  evidence?: string[];
  errors?: string[];
}

export interface VerificationReport {
  runId: RunId;
  commitSha?: string;
  status: 'passed' | 'failed' | 'blocked';
  checks: Check[];
}
```

**Critical invariants:**

- `passed` means execution succeeded.
- `failed` means execution found a failure.
- `skipped` means the check was not performed.
- `blocked` means the check could not safely proceed.
- A skipped check MUST NOT be counted as `passed`.
- A scanner failure MUST be reported as `failed` (or `blocked` if the failure
  prevents a verdict), never as `passed`.

These invariants are enforced by `core.verification.runner` and tested in
`packages/testing/src/validators/verification.ts`.

## 7. Policy (M10)

```ts
// packages/contracts/src/policy/policy.ts
export type PolicyAction =
  | 'file.delete'
  | 'file.bulk-modify'
  | 'db.migrate'
  | 'db.production-mutate'
  | 'git.force-push'
  | 'release.deploy'
  | 'secret.modify'
  | 'dependency.remove';

export type PolicyDecision =
  | { action: PolicyAction; verdict: 'allow'; reason: string }
  | { action: PolicyAction; verdict: 'deny'; reason: string }
  | { action: PolicyAction; verdict: 'require-approval'; reason: string; approver: string };

export interface Approval {
  action: PolicyAction;
  approver: string;
  grantedAt: string; // ISO 8601
  rationale: string;
}
```

`core.policy.evaluator` is a pure function: `evaluate(action, context,
policy) => PolicyDecision`. It has deterministic unit tests for every action
× context combination. A bypass that silently turns `deny` into `allow`
is a Critical bug.

## 8. Adapter boundary (M1 declared, M10 wired)

```ts
// packages/claude-code-adapter/src/contracts/runtime-event.ts
export type RuntimeEvent =
  | { kind: 'lifecycle'; phase: 'session-start' | 'session-end' | 'task-start' | 'task-end' }
  | { kind: 'tool-call'; tool: string; input: unknown; output?: unknown }
  | { kind: 'model-request'; model: string; effort: string; tokensIn?: number; tokensOut?: number }
  | { kind: 'verification'; report: VerificationReport };
```

The adapter translates host events to `RuntimeEvent`. The core consumes
`RuntimeEvent` and never the raw host event. This is the boundary that makes
the core runtime-independent (ADR-0004).

## 9. Schema versioning

Persistent artifacts (`ProjectProfile`, `WorkflowState`, `VerificationReport`,
`ImplementationPlan`) carry a `schemaVersion` field. Breaking changes
require:

1. A new ADR documenting the change and migration path.
2. A `schemaVersion` bump.
3. A migration function in `packages/core/src/artifacts/migrations/`.
4. Updated tests in `packages/testing`.

The M1 `schemaVersion` values are:

- `ProjectProfile`: `1`
- `WorkflowState`: `1`
- `VerificationReport`: `1`
- `ImplementationPlan`: `1`

## 10. Contract test policy

Every contract above has a zod schema and a round-trip test in
`packages/testing/src/validators/`. The test parses a sample, validates it,
re-serializes it, parses again, and asserts equality. This catches
non-determinism (e.g., key ordering, undefined vs missing) before it reaches
a consumer.
