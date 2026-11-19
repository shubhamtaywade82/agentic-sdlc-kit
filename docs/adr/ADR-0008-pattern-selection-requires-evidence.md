# ADR-0008: Pattern selection requires evidence; ADRs only for architectural consequence

Date: 2026-11-19 · Status: accepted

## Context

The proposal (§7): "I don't want a kit that automatically introduces Factory,
Repository, Strategy, CQRS or DDD into every application." Pattern inflation
is an architectural smell; conversely, demanding an ADR for every class-level
pattern buries real decisions in ceremony.

## Decision

Two-tier rule, enforced by review guidance (`architecture-reviewer` agent)
and the `design-pattern-selection` skill:

1. **Class-level patterns** require an inline five-question justification
   (specific problem? why is the current design insufficient? simpler
   alternative considered? complexity introduced? test strategy?) plus a
   check that no existing abstraction already does the job. No ADR.
2. **Architecturally consequential decisions** — cross-boundary, constraining
   the future, hard to reverse (architecture styles, CQRS/event-sourcing,
   public API shapes — also an ADR trigger per stack packs) — get a real ADR
   in `docs/architecture/adr/`.

The pattern library is organized in seven categories (architecture,
creational, structural, behavioral, resilience, data, testing); each entry
documents when NOT to use it. Per-language implementations live in stack
packs; selection knowledge is stack-agnostic in the skill.

## Consequences

- (+) "Adopted Strategy" without a named smell is a review finding, not a
  style choice.
- (+) ADR volume stays low enough that each one is read.
- (−) The five questions are convention, not machine-enforceable (unlike
  spec/plan validation); enforced socially via review checklists.
