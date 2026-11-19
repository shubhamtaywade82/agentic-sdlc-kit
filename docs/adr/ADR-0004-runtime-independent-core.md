# ADR-0004: The core is runtime-independent

Status: Accepted
Date: 2026-11-19
Milestone: M0 (frozen), implemented M1-04

## Context

The kit's primary value is the SDLC workflow logic: how to inspect a repo,
generate a profile, plan a feature, execute tasks, verify changes, and gate
destructive operations. If that logic is tangled with a specific host
runtime (Claude Code today, Codex or others tomorrow), every runtime change
forces a workflow refactor, and every new runtime requires reimplementing
the workflow.

## Decision

`packages/core` is **runtime-independent**. It depends only on
`@agentic-sdlc-kit/contracts` and the Node.js standard library. It does not
import any host runtime SDK.

Runtime-specific concerns (event translation, host approval application,
tool dispatch) live in adapter packages (`packages/claude-code-adapter` for
M1+M10, future `packages/<runtime>-adapter` for M18).

The boundary contract is `RuntimeEvent`
(`packages/claude-code-adapter/src/contracts/runtime-event.ts`). The core
consumes `RuntimeEvent` values; the adapter produces them.

## Alternatives considered

- **Core that depends on Claude Code APIs.** Faster M1, but locks the
  workflow to one runtime and makes every adapter a fork. Rejected.
- **Core that depends on a "runtime abstraction" library we publish.**
  Tempting, but introduces a third layer that has to be designed before we
  have a second runtime to validate it against. Defer to M18 when we have
  real evidence.
- **No core; everything is a plugin.** Maximum flexibility, minimum
  guarantee that two plugins compose. Rejected: the kit's value is a
  coherent workflow, not a bag of plugins.

## Consequences

- `core` MUST NOT import `@anthropic-ai/*`, Claude Code SDK symbols, or the
  `claude-code-adapter` package. Enforced by `scripts/check-architecture.ts`
  and ESLint `no-restricted-imports`.
- The M1 `claude-code-adapter` is a **boundary declaration**, not a working
  integration. It compiles, exports `RuntimeEvent` and translator
  interfaces, and is exercised by unit tests. The host SDK is not imported
  until M10. This is documented in ADR-0005.
- Any future runtime adapter mirrors the `claude-code-adapter` boundary:
  import `contracts`, translate host events to `RuntimeEvent`, apply core
  decisions to the host.
- Workflow logic (state machine, profile generator, policy evaluator,
  verification runner) lives in `core` and is unit-tested without a runtime.

## References

- `docs/architecture/ARCHITECTURE.md` §1, §2.2, §2.5, §6
- `docs/security/SECURITY.md` §2
- `docs/modules/MODULES.md` §2, §10
- `packages/core/`
- `packages/claude-code-adapter/src/contracts/runtime-event.ts`
