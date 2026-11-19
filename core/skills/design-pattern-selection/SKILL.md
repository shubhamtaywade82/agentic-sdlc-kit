---
name: design-pattern-selection
description: Choose design patterns from demonstrated need, not preference — selection policy, seven-category catalog, architecture/resilience/data/testing pattern references. Use when considering a pattern, when code shows structural smells, when asked to add an abstraction, or when reviewing whether a pattern was justified.
license: MIT
---

# Design Pattern Selection

Patterns solve demonstrated design problems. They are not implementation
requirements, not vocabulary for its own sake, and never a default. **Pattern
inflation is an architectural smell.**

## The policy: five questions before introducing any pattern

1. **What specific problem exists?** (name the smell in the current code, with
   a file/line example)
2. **Why is the current design insufficient?** (what hurts: duplication,
   coupling, untestability — concretely)
3. **What simpler alternative was considered?** (extract function, union type,
   module, config table — the boring options first)
4. **What complexity does the pattern introduce?** (new participant types,
   indirection, files; who must understand it to change the code later)
5. **How will the implementation be tested?** (the test strategy exists before
   the pattern exists)

If you cannot answer all five in the PR/plan, you are not selecting a pattern —
you are decorating.

## First check: does an abstraction already exist?

Before introducing any new abstraction, search for an existing one doing the
same job (skill `repo-discovery` techniques). A second parallel abstraction is
architectural regression — extend the existing one or migrate to it.

## ADR or not?

- **Inline five-question justification** (in the plan/PR) for class-level
  patterns.
- **ADR** (`templates/ADR.md`) when the decision has meaningful architectural
  consequence: crosses module boundaries, constrains future changes, or is hard
  to reverse (e.g. adopting CQRS, event-driven core, hexagonal boundaries).

## Catalog

Seven categories, each pattern with when/when-not — see `references/catalog.md`.
Per-language implementations live in the installed stack pack:
`.ai/stack/<name>/patterns/` (creational, structural, behavioral, testing —
22 GoF patterns with idiomatic TypeScript / Ruby implementations and tests).

Stack-agnostic references (this skill):

| Reference | Covers |
|---|---|
| `references/selection-policy.md` | The five questions applied — worked example |
| `references/architecture.md` | Modular monolith, Hexagonal, Clean, Vertical Slice, DDD, Event-driven |
| `references/resilience.md` | Retry+backoff, Circuit Breaker, Bulkhead, Timeout, Idempotency, Outbox |
| `references/data.md` | Repository, Unit of Work, CQRS, Transaction Script, Data Mapper |
| `references/testing.md` | Test pyramid, contract, property-based, mutation, test doubles |

## Smell → candidate map (entry point, not a shortcut)

Repeated switch-on-type → Strategy/union; multi-step construction → Builder;
interface mismatch → Adapter; cross-cutting addition → Decorator; heavy
duplication across siblings → Template Method/extract; multi-source events →
Observer; request-scoped side effects → Command; retry-prone external calls →
Resilience set; persistence coupling → Repository. **The map names candidates;
the five questions decide.**
