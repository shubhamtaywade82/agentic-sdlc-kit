# Rails + TypeScript Design Patterns (rails-ts)

Two pattern sets for this full-stack profile — use each on its side of the
boundary:

- `ruby-rails/` — 22 GoF patterns, idiomatic Ruby for the Rails backend
  (models, services, jobs, mailers), RSpec tests, anti-patterns.
- `typescript-node/` — 22 GoF patterns, idiomatic strict TypeScript for the
  frontend and the TS build toolchain (Hotwire/React interop, API clients,
  bundled JS), Vitest tests, anti-patterns.

Cross-boundary rule: patterns do not cross the API boundary. A Ruby strategy
and its TS client share a CONTRACT (schema types), never an implementation.
Boundary design lives in `.cursor/rules/34-api-boundary.mdc`.

Selection policy first: the `design-pattern-selection` skill (five questions +
"does an abstraction already exist?") governs WHEN to use any pattern; these
packs are the HOW for each side of the stack.
