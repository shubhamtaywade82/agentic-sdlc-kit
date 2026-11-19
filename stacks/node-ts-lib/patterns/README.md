# TypeScript / Node Library Design Patterns (node-ts-lib)

22 classic GoF patterns (refactoring.guru catalog) with idiomatic strict
TypeScript 5.x implementations tuned for published libraries: public API
boundaries, plugin/extension registries, async pipelines, streaming, and
tooling — with Vitest tests and anti-patterns.

Files:

- `creational.md` — Factory Method, Abstract Factory, Builder, Prototype, Singleton
- `structural.md` — Adapter, Decorator, Facade, Composite, Proxy, Bridge
- `behavioral.md` — Strategy, Observer, Command, State, Chain of Responsibility, Mediator, Template Method, Iterator, Memento
- `smells-to-patterns.md` — smell → candidate-pattern map
- `testing.md` — testing each pattern family (contract tests exported from the package, property tests for parsers)

Selection policy first: the `design-pattern-selection` skill (five questions +
"does an abstraction already exist?") governs WHEN to use any of these; this
pack is the HOW for TypeScript libraries on Node.

Library extra rule: patterns that shape the PUBLIC API surface are ADR-worthy
(a published interface is hard to reverse) — see the `design-pattern-selection`
skill's ADR rule.
