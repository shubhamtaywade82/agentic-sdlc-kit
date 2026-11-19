# Architecture Patterns

Each entry: Problem / When / When NOT / Trade-offs / Testing / Anti-patterns.
These shape the whole system — an ADR is usually warranted when adopting one
(skill `design-pattern-selection`: five questions + ADR rule).

## Modular Monolith

- **Problem** — one deployable, but the codebase becomes a tangle with no
  enforceable boundaries.
- **When** — single team or tightly-coupled teams; one deployment unit is fine;
  you want domain boundaries WITHOUT distributed-systems cost.
- **When NOT** — teams need independent deploy cadences, or separate scaling
  per domain.
- **Trade-offs** — boundaries are conventions (enforce by lint/import rules),
  not process walls; a monolith can still rot if module boundaries decay.
- **Testing** — per-module unit tests; cross-module only through public module
  APIs (a test importing another module's internals is a boundary violation).
- **Anti-patterns** — "modular" monolith where every module imports every
  other; shared database tables as the real coupling.

## Hexagonal (Ports & Adapters)

- **Problem** — business logic fused to framework/DB, untestable and hostile
  to replacement.
- **When** — the core rules are the product (pricing, eligibility, workflows);
  infrastructure is interchangeable detail.
- **When NOT** — CRUD-dominant app where the DB schema IS the design; the
  ceremony buys nothing.
- **Trade-offs** — indirection between core and adapters; mapping layers to
  keep honest (entity ↔ port DTO).
- **Testing** — core tested with fake adapters only; one integration suite
  proves each real adapter against the port contract.
- **Anti-patterns** — ORM entities leaking into the core; a "port" that
  exposes SQL semantics.

## Clean Architecture

- **Problem** — like hexagonal, but with more layers (entities → use cases →
  adapters → framework) and a strict dependency rule.
- **When** — long-lived systems where outer layers churn (frameworks, UIs,
  delivery mechanisms) and the use-case layer must survive them.
- **When NOT** — layers would be pass-through for most flows; small apps
  (use hexagonal-lite instead).
- **Trade-offs** — most ceremony of the set; mapping/mappers everywhere.
- **Testing** — use cases tested framework-free; entities have invariant tests.
- **Anti-patterns** — "Clean" with the framework imported in the core;
  use-case objects that are anemic pass-throughs to entities.

## Vertical Slice

- **Problem** — horizontal layers force every feature to touch N layers, and
  features don't ship incrementally.
- **When** — features evolve independently; small teams own slices
  end-to-end; you want each PR to be one complete outcome (matches this kit's
  slicing rules — skill `implementation-planning`).
- **When NOT** — shared logic would fork across slices; teams are organized by
  layer.
- **Trade-offs** — shared infrastructure needs deliberate extraction;
  slice-local duplication until a pattern emerges.
- **Testing** — slice tests read like the feature's acceptance criteria;
  cross-slice regression suite for shared kernels.
- **Anti-patterns** — slices sharing one giant mutable model (that's a layer
  cake standing up); copying a slice's bugs instead of extracting.

## Domain-Driven Design (light)

- **Problem** — complex, evolving business rules spread across services and
  controllers, language drifting from the business.
- **When** — the domain has real complexity (invariants, state machines,
  policy rules); a ubiquitous language exists or can be built with experts.
- **When NOT** — thin CRUD over simple data (use Transaction Script); "DDD"
  as a dress code for anemic models.
- **Trade-offs** — requires domain-expert access; aggregates/vallues are a
  discipline, not a library.
- **Testing** — invariant tests per aggregate; domain events tested as facts.
- **Anti-patterns** — anemic entities + god services; one aggregate spanning
  the whole domain; ubiquitous language only in the docs.

## Event-Driven

- **Problem** — independent components must react to facts without coupling
  to their producers.
- **When** — reactions are genuinely independent (notify, audit, project
  read models); temporal decoupling is a feature; consumers scale apart.
- **When NOT** — the "reactions" are actually one business transaction (use
  a transactional workflow); you'd need distributed tracing to explain a
  single user flow.
- **Trade-offs** — eventual consistency everywhere; debugging = event logs +
  correlation IDs; delivery semantics (at-least-once) leak into consumers
  (see `resilience.md`: idempotency, outbox).
- **Testing** — consumer contract tests per event schema; end-to-end scenario
  tests assert the event chain, not just the endpoint.
- **Anti-patterns** — events as commands in disguise ("DoXRequested" is a
  command); unversioned event schemas; chains so long nobody can draw them.
