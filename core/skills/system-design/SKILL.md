---
name: system-design
description: Design systems — architecture, ADRs, data models, API contracts, security — before implementation. Use when a change affects architecture, database schema, or API contracts, when writing an ADR, or when choosing an architecture style.
license: MIT
---

# System Design

Design is choosing what to build and what NOT to build. Output goes to
`docs/architecture/` where it outlives the conversation.

## Prerequisites (do not skip)

Read the validated spec (`docs/specifications/`), the discovery output (skill
`repo-discovery`), and the existing ADRs. New designs must either extend or
explicitly supersede prior decisions.

## Design steps

1. **Boundaries first** — which parts of the system own which responsibility?
   Prefer the simplest architecture that fits (see `design-pattern-selection`
   references: architecture patterns with when/when-not).
2. **Data model** — entities, relationships, constraints, indexes, migration path.
   Every schema change must be **backward-compatible**: additive columns, nullable
   first, backfill before constraint; destructive migrations are separate,
   approved steps (AGENTS.md §6).
3. **API contracts** — request/response shapes, status codes, error envelope,
   versioning stance. Breaking a published contract needs an explicit ADR.
4. **Failure behavior** — what happens when dependencies are slow, down, or
   return garbage (see resilience patterns: timeout, retry, circuit breaker).
5. **Security posture** — authn/authz boundary, input validation, secret storage,
   threat notes for the touched surface (skill `security-engineering`).

## ADRs (template `templates/ADR.md`, output `docs/architecture/adr/`)

An ADR is required when a decision has **meaningful architectural consequence**:
crosses module boundaries, constrains future changes, or is hard to reverse.
NOT for every class-level choice — that is pattern selection (skill
`design-pattern-selection`), which answers five questions inline instead.

ADR = Context → Decision → Consequences (including what we give up). Numbered,
dated, immutable once accepted; supersede, never edit history.

## Vertical slices

Design so the system stays **working after every slice**: auth, then core
resource, then integrations — each slice a complete, tested, shippable outcome.
An architecture that only works when 100% finished is a wrong architecture.

## Validation

- Walk each acceptance criterion through the design: which component satisfies
  it, and where would its test live? Unmappable criterion = design gap.
- Present the design with a one-diagram overview (ASCII is fine) and the list of
  decisions delegated to implementation.
