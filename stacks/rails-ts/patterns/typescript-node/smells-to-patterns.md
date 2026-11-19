# Smells → Refactorings → Patterns (TypeScript / Node.js)

Smell and refactoring catalog: https://refactoring.guru/refactoring/smells · https://refactoring.guru/refactoring/techniques

| Smell (what you see) | Refactoring | Target pattern |
|---|---|---|
| `switch (provider)` duplicated across functions | Replace Conditional with Polymorphism | Strategy / Factory Method + Adapter |
| `if (order.status === 'paid') ... else if ...` scattered; optional fields valid only in some statuses | Replace Type Code with State | State (discriminated union) |
| Route handler with DB + payment + email + analytics calls | Extract Function/Class | Facade / Command handler (use case) |
| `import Stripe from 'stripe'` in many files; SDK types in domain | Encapsulate external dependency | Adapter (+ Proxy for caching/rate-limit) |
| Copy-pasted importer/exporter flows | Form Template Method | Template Method (or HOF with step functions) |
| Function with 6+ positional params / many optional flags | Introduce Parameter Object | Options object, Builder |
| Class explosion along two axes (`SmsUrgentNotifier`, `EmailDigestNotifier`) | Separate dimensions | Bridge |
| Try/catch-retry-log boilerplate copied around calls | Extract wrapper | Decorator (HOF or wrapper class) |
| Long `if` validation/check chain with early returns | Decompose Conditional | Chain of Responsibility (middleware) |
| Services importing each other circularly | Introduce mediator / events | Mediator or Observer |
| `getInstance()` classes, module-level mutable state | Replace Global with Injection | Module singleton (immutable) + DI; `AsyncLocalStorage` for request state |
| Manual pagination loops in many places | Extract Iterator | Async generator |
| Hand-written object copying for "duplicate" | Extract `clone()` | Prototype |
| Ad-hoc undo implementation | Encapsulate snapshot | Memento + Command |
| Growing set of `toHtml/toPdf/toMd` methods on each node class | Move Method to visitor | Visitor (typed handler map) |
| Fire-and-forget promises in services for side effects | Extract events | Observer (typed bus) / outbox |
| Recursive logic duplicated for leaves and groups | Extract uniform interface | Composite |
| Same expensive lookup repeated per request | Introduce cache | Proxy (caching, request coalescing) |
| Thousands of objects carrying identical config | Extract intrinsic state | Flyweight |

## Review checklist

- [ ] PR names the smell; the old switch/duplication is deleted, not just relocated.
- [ ] ≥ 2 real variants exist (or are imminently planned).
- [ ] A function type / union / module / framework feature was considered before a class hierarchy.
- [ ] Contracts are explicit `interface`/`type`; no `any`, no unchecked `as` in pattern code.
- [ ] Unions are exhaustively handled (`assertNever`) and compile with `strict`.
- [ ] Registries are typed with `satisfies` and indexed only with validated keys (`Object.hasOwn`, Zod enum).
- [ ] Dependencies injected; wiring lives in the composition root / DI module.
- [ ] No per-request state in module scope; async listeners have error handling.
- [ ] External side effects are idempotent and survive retries.
- [ ] Contract test suite runs against every implementation.
- [ ] `tsc --noEmit`, `eslint`, and `vitest run` pass.
