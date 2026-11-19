# @agentic-sdlc-kit/core

Runtime-independent core: workflow engine, project-profile generator and
validator, artifacts writer, policy evaluator, and verification runner.

## Architectural invariant

This package imports **only** from `@agentic-sdlc-kit/contracts`. It MUST
NOT import any host runtime SDK, and MUST NOT import from
`@agentic-sdlc-kit/claude-code-adapter` or any future adapter package.

The boundary contract is `RuntimeEvent` (declared in
`packages/claude-code-adapter/src/contracts/runtime-event.ts`). Future
runtime adapters translate host events to `RuntimeEvent`; `core` consumes
that contract.

See `docs/architecture/ARCHITECTURE.md` §2.2, §6 and ADR-0004.

## Public surface (M1)

- `workflows/engine.ts` — pure workflow state machine.
- `project-profile/generator.ts` — `RepositoryScan → ProjectProfile`.
- `project-profile/validator.ts` — zod validation; never throws.
- `policy/evaluator.ts` — pure `evaluate(action, context) → PolicyDecision`.
  INVARIANT: `deny` cannot become `allow` via any later stage.
- `artifacts/writer.ts` — writes JSON/Markdown under `.ai-kit/` and `docs/`
  only; path escapes are rejected with `ARTIFACT_WRITE_DENIED`.
- `discovery/repository-scanner.ts` — interface + M1 stub (M2 implements).
- `verification/runner.ts` — interface + M1 dry-run (M6 implements real).

## Usage

```ts
import {
  createWorkflowState,
  transition,
  validateProfile,
  evaluate,
} from "@agentic-sdlc-kit/core";

const state = createWorkflowState("RUN-001", "feature");
const started = transition(state, "start"); // → in_progress
```

## Build

```bash
pnpm install
pnpm --filter @agentic-sdlc-kit/core build
pnpm --filter @agentic-sdlc-kit/core test
```
