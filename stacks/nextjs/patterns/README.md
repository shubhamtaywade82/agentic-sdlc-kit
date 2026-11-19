# TypeScript / Node Design Patterns (nextjs)

22 classic GoF patterns (refactoring.guru catalog) with idiomatic strict
TypeScript 5.x implementations — React component boundaries, server actions,
route handlers, and Node tooling — with Vitest/Jest tests and anti-patterns.

Files:

- `creational.md` — Factory Method, Abstract Factory, Builder, Prototype, Singleton
- `structural.md` — Adapter, Decorator, Facade, Composite, Proxy, Bridge
- `behavioral.md` — Strategy, Observer, Command, State, Chain of Responsibility, Mediator, Template Method, Iterator, Memento
- `smells-to-patterns.md` — smell → candidate-pattern map
- `testing.md` — testing each pattern family (contract tests via shared types, MSW-stubbed boundaries)

Selection policy first: the `design-pattern-selection` skill (five questions +
"does an abstraction already exist?") governs WHEN to use any of these; this
pack is the HOW for TypeScript on Next.js.
