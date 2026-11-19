# Rails Design Patterns (Ruby)

22 classic GoF patterns (refactoring.guru catalog) with idiomatic Ruby/Rails
implementations, placement guidance, RSpec tests, and anti-patterns.

Files:

- `creational.md` — Factory Method, Abstract Factory, Builder, Prototype, Singleton
- `structural.md` — Adapter, Decorator, Facade, Composite, Proxy, Bridge
- `behavioral.md` — Strategy, Observer, Command, State, Chain of Responsibility, Mediator, Template Method, Iterator, Memento, Command variants
- `smells-to-patterns.md` — smell → candidate-pattern map
- `testing.md` — testing each pattern family (shared examples as contract tests, etc.)

Selection policy first: the `design-pattern-selection` skill (five questions +
"does an abstraction already exist?") governs WHEN to use any of these; this
pack is the HOW for Ruby on Rails.
