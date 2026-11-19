# TESTING.md — Agentic SDLC Kit

Status: M0 frozen. Test strategy and verification policy. Defines what we
test, where the tests live, what "passing" means, and what the Definition of
Done requires before a milestone is accepted.

## 1. Test pyramid

```
        ┌──────────────┐
        │  End-to-end  │   ← workflow acceptance (M7 feature → verified diff)
        └──────────────┘
        ┌──────────────────┐
        │   Integration    │   ← multi-package (cli → core → contracts)
        └──────────────────┘
        ┌──────────────────────────┐
        │       Contract           │   ← zod round-trip, schema invariants
        └──────────────────────────┘
        ┌──────────────────────────────────┐
        │             Unit                 │   ← pure functions, evaluators
        └──────────────────────────────────┘
```

End-to-end is reserved for milestone acceptance (M7+). Unit and contract
tests dominate the M1 suite.

## 2. Test runner

- **Vitest** for all TypeScript unit, contract, and integration tests.
- Configuration: `vitest.config.ts` per package, root `vitest.config.ts`
  for the workspace.
- Tests live next to source: `foo.ts` ↔ `foo.test.ts`.
- Coverage threshold (M1 baseline): 80% statements, 80% branches for
  `packages/contracts` and `packages/core`. No threshold yet for `cli` and
  `testing` packages (M2 raises the bar).

## 3. Test categories

| Category     | What it proves                                           | First milestone |
| ------------ | -------------------------------------------------------- | --------------- |
| Unit         | A pure function returns the expected result              | M1              |
| Contract     | A zod schema round-trips a sample without losing data    | M1              |
| Architecture | The dependency graph has no cycles; invariants hold      | M1              |
| Integration  | cli → core → contracts composition works                 | M1              |
| Smoke        | `kit --version` and `kit doctor` exit cleanly            | M1              |
| Adversarial  | Destructive ops, malformed input, scanner failures       | M10, M11, M17   |
| Fixture      | A real repository survives `kit inspect` without changes | M2              |
| Acceptance   | A real repository completes `/kit:feature` end-to-end    | M7              |

## 4. M1 test plan

### 4.1 `packages/contracts`

| Test file                         | What it proves                                                   |
| --------------------------------- | ---------------------------------------------------------------- |
| `common/result.test.ts`           | `ok` and `err` construct correctly; `Result` discriminates.      |
| `common/errors.test.ts`           | `KitError` carries code, message, cause, details.                |
| `common/identifier.test.ts`       | Valid IDs accepted; invalid IDs rejected.                        |
| `project/project-profile.test.ts` | Schema accepts a valid profile; rejects string commands, missing |
|                                   | `schemaVersion`, unknown stacks.                                 |
| `workflow/workflow.test.ts`       | `WorkflowMode` and `WorkflowStatus` unions are exhaustive.       |
| `verification/report.test.ts`     | `CheckStatus` cannot be coerced; `passed` ≠ `skipped`.           |
| `policy/policy.test.ts`           | `PolicyDecision` discriminated union; deny ≠ allow.              |
| `index.test.ts`                   | Every public symbol is exported; no circular import.             |

### 4.2 `packages/core`

| Test file                           | What it proves                                                       |
| ----------------------------------- | -------------------------------------------------------------------- |
| `workflows/engine.test.ts`          | State machine allows only declared transitions; terminal states      |
|                                     | cannot transition.                                                   |
| `project-profile/validator.test.ts` | Valid profile → ok; invalid profile → err with code PROFILE_INVALID. |
| `project-profile/generator.test.ts` | A scan produces a valid profile; missing fields produce a structured |
|                                     | error, never a throw.                                                |
| `policy/evaluator.test.ts`          | Each action × context produces the expected verdict; deny never      |
|                                     | silently becomes allow.                                              |
| `artifacts/writer.test.ts`          | Writes under `.ai-kit/` and `docs/` succeed; writes outside fail.    |

### 4.3 `packages/cli`

| Test file                        | What it proves                                                |
| -------------------------------- | ------------------------------------------------------------- |
| `application/dispatcher.test.ts` | Known commands dispatched; unknown command exits non-zero.    |
| `commands/version.test.ts`       | `kit --version` prints `0.1.0`.                               |
| `commands/help.test.ts`          | `kit --help` lists every registered command.                  |
| `commands/doctor.test.ts`        | `kit doctor` checks Node, pnpm, and per-package build status. |

### 4.4 `packages/testing`

| Test file                      | What it proves                                             |
| ------------------------------ | ---------------------------------------------------------- |
| `validators/contracts.test.ts` | Every public schema round-trips a fixture.                 |
| `helpers/temp-dir.test.ts`     | Temp dir created and cleaned up.                           |
| `assertions/result.test.ts`    | `assertOk` / `assertErr` work and fail loudly on mismatch. |

### 4.5 `packages/claude-code-adapter`

| Test file                         | What it proves                                                      |
| --------------------------------- | ------------------------------------------------------------------- |
| `contracts/runtime-event.test.ts` | `RuntimeEvent` discriminated union; every kind is constructable.    |
| `events/translator.test.ts`       | The translator interface compiles; the no-op impl returns identity. |

The adapter is a boundary, not a working integration. Its tests prove the
contract surface compiles and is internally consistent. The host SDK is not
imported in M1.

### 4.6 Architecture check

`scripts/check-architecture.ts` runs in CI and asserts:

1. `contracts` imports no sibling.
2. `core` imports only `contracts`.
3. `cli` imports only `core` and `contracts`.
4. `testing` imports only `contracts` and `vitest`.
5. `claude-code-adapter` imports only `contracts`.
6. No package imports from a sibling's `dist/`.

Failure exits non-zero and fails CI.

## 5. Definition of Done (per task)

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

A task without evidence is not done, even if it appears complete.

## 6. Adversarial cases (M10+, declared here)

| Domain        | Adversarial input                                         |
| ------------- | --------------------------------------------------------- |
| Installer     | Interrupted install; rollback; uninstall of unowned files |
| Discovery     | Malformed manifests; huge repos; unusual layouts          |
| Workflow      | Interrupted workflow; resumed session; state drift        |
| Planning      | Cycles; missing dependencies; invalid task IDs            |
| Executor      | Timeouts; signals; path escapes; malicious arguments      |
| Secret Guard  | Encoded secrets; partial matches; redaction gaps          |
| Runtime Guard | Bypass attempts; non-interactive execution                |
| Router        | Incorrect classifications; unavailable providers          |
| Observer      | Missing events; oversized logs; retention overflow        |
| Stack packs   | Compatibility against real repositories                   |

## 7. Reference fixtures

Three fixtures are maintained across milestones:

| Fixture                  | Purpose                                                     |
| ------------------------ | ----------------------------------------------------------- |
| `fixture-node-fullstack` | Existing Node + React + TS app with database and tests      |
| `fixture-rails-api`      | Existing Rails API with models, services, migrations, RSpec |
| `fixture-greenfield`     | Empty or minimal repo for new app creation                  |

Fixtures deliberately include failure cases: failing tests, dirty git state,
invalid configuration, missing deps, secret-containing files, destructive
commands, interrupted runs, circular task dependencies. This makes them
acceptance environments, not showcase examples.

**For M0/M1**: only `fixture-node-fullstack` is shipped (a minimal but real
Node + TS + Express app with one passing test). It is the target of the
first M2 `kit inspect` dry-run.

## 8. Verification policy

- `pnpm verify` runs typecheck → lint → test → build in that order, failing
  on the first error.
- CI runs `pnpm verify` on every pull request and on `main`.
- A release (M16) requires `pnpm verify` green on Node 20 and Node 22,
  Ubuntu and macOS.
- No release ships with a skipped check counted as passed
  (`CONTRACTS.md` §6).
- No release ships with an untested public contract
  (`REQUIREMENTS.md` NFR-6.3).

## 9. Test data policy

- Tests do not read or write outside `os.tmpdir()` or the package's
  `__tests__/` directory.
- Tests do not embed real secrets. The `secret-guard` adversarial suite
  uses synthetic secrets that match real patterns without being valid.
- Tests do not depend on network access. Any test that would need network
  is skipped in CI and marked `// @ci-skip` with a rationale.

## 10. What M1 does not test

- Workflow acceptance (M7).
- Real runtime integration with Claude Code (M10+).
- Stack pack compatibility (M14).
- Adversarial installer / discovery / executor cases (M17).

These gaps are correct for 0.1 and are closed by later milestones per
`ROADMAP.md`.
