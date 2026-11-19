# @agentic-sdlc-kit/contracts

Shared types and zod schemas for the Agentic SDLC Kit. Depends on **nothing**.

## Architectural invariant

This package imports nothing from sibling packages. Adding an import from
any other `@agentic-sdlc-kit/*` package is a Critical bug and fails the
`scripts/check-architecture.ts` gate.

See `docs/architecture/ARCHITECTURE.md` §6 and ADR-0007.

## Public surface

- `common/` — `Result<T,E>`, `KitError`, `Errors`, identifier schemas.
- `project/` — `ProjectProfile`, `RepositoryScan`.
- `workflow/` — `WorkflowMode`, `WorkflowStatus`, `WorkflowState`.
- `specification/` — `FeatureSpecification`, `BddScenario`.
- `planning/` — `Task`, `ImplementationPlan`, `DependencyEdge`.
- `verification/` — `Check`, `VerificationReport`, `rollupReportStatus`.
- `policy/` — `PolicyAction`, `PolicyDecision`, `Approval`.

See `docs/contracts/CONTRACTS.md` for the full contract documentation.

## Usage

```ts
import {
  ProjectProfileSchema,
  ok,
  err,
  Errors,
} from "@agentic-sdlc-kit/contracts";

const parsed = ProjectProfileSchema.safeParse(input);
if (!parsed.success) {
  return err(Errors.profileInvalid(parsed.error.message));
}
return ok(parsed.data);
```

## Build

```bash
pnpm install
pnpm --filter @agentic-sdlc-kit/contracts build
pnpm --filter @agentic-sdlc-kit/contracts test
```
