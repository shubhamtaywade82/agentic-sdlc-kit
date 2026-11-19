# Data Access Patterns

How domain logic talks to persistence. Each entry: Problem / When / When NOT /
Trade-offs / Testing / Anti-patterns.

## Repository

- **Problem** — query construction scatters across services; persistence
  details (ORM idioms, SQL) leak into business logic and tests.
- **When** — multiple callers need the same queries; domain logic should be
  testable with an in-memory fake; data source may be swapped/extended.
- **When NOT** — thin CRUD app where the ORM already IS the repository
  (ActiveRecord apps: often the right call is a well-named scope, not a
  repository layer).
- **Trade-offs** — an interface per aggregate + mapping; generic
  repository-of-anything loses domain meaning (prefer
  `OrderRepository.findByPlacementWindow`, not `find(criteria)`).
- **Testing** — domain tests run against in-memory fakes; one integration
  suite proves the real repository's contract (same test file shape as the
  fake).
- **Anti-patterns** — repository that returns ORM entities (leak); `save()`
  god-methods; repositories per table instead of per aggregate.

## Unit of Work

- **Problem** — several writes must commit or roll back together, but each
  repository call opens its own transaction.
- **When** — multi-aggregate operations with atomicity requirements within one
  process/DB.
- **When NOT** — single-write transactions (the DB transaction already is
  your UoW); cross-service transactions (that's a saga/outbox problem).
- **Trade-offs** — a transaction-scoped context threaded through operations;
  implicit state (current UoW) invites bugs — inject it explicitly.
- **Testing** — force a failure mid-operation → zero partial writes; success
  path → all writes visible together.
- **Anti-patterns** — hidden global transaction ambient context; UoW spanning
  HTTP requests; mixing UoW with repository-per-table (aggregate confusion).

## CQRS

- **Problem** — read and write models fight each other: reads want wide
  denormalized shapes, writes want normalized integrity.
- **When** — read load and shape genuinely diverge from writes (dashboards,
  search, feeds); projections can be rebuilt from events/audit log.
- **When NOT** — reads ≈ writes in shape and volume — you're buying two
  schemas to keep in sync for nothing. Most apps: NO.
- **Trade-offs** — eventual consistency on reads; projection rebuild
  machinery; duplicated invariants (write side guards, read side shapes).
- **Testing** — write-then-read integration test with a projection-lag
  tolerance; rebuild-from-zero test (projector must be deterministic).
- **Anti-patterns** — CQRS as an excuse to skip write-side validation; CQRS
  + ES adopted together by default (they're independent); "eventual
  consistency" that's actually "sometimes".

## Transaction Script

- **Problem** — you need to organize straightforward business operations
  without a domain object model.
- **When** — linear procedures (calculate → validate → persist → notify);
  low domain complexity; the team values obviousness.
- **When NOT** — logic accumulates: same validations/invariants duplicated
  across scripts — that's the pressure signal toward a domain model (see
  `architecture.md`: DDD light).
- **Trade-offs** — zero framework ceremony; duplication is the failure mode.
- **Testing** — one test per script branch; shared validations get their own
  tests once reused.
- **Anti-patterns** — 300-line scripts; scripts calling scripts calling
  scripts; copy-paste "parameterized" variants.

## Data Mapper

- **Problem** — objects must stay persistence-ignorant, but ActiveRecord-style
  active records fuse object and table.
- **When** — rich domain objects with invariants; persistence layer may
  change; you accept explicit mapping code.
- **When NOT** — active record is working fine and the domain is thin —
  mappers are pure ceremony then.
- **Trade-offs** — mapping code (the honest cost of separation); identity-map
  management; slower to write than AR.
- **Testing** — round-trip tests (object → row → object equality); mapper
  tests independent of domain tests.
- **Anti-patterns** — mappers that grow business logic; half-migrated
  codebases where both styles fight (migrate by module).

## Selection heuristic

Start with whatever the stack's default is (ActiveRecord / ORM entities).
Reach for Repository when queries multiply or tests fake persistence; Unit of
Work only when multi-write atomicity spans repository calls; Data Mapper when
the domain deserves ignorance of storage; CQRS only under evidence of
read/write divergence. ADR before CQRS or event-sourced persistence —
see skill `design-pattern-selection`.
