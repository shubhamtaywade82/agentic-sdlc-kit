# Pattern Catalog — seven categories

One-line selection guides: when / when-not. Implementations: stack pack
(`.ai/stack/<name>/patterns/`) for language-specific patterns; the dedicated
references in this skill for the stack-agnostic categories (architecture,
resilience, data, testing).

## 1. Architecture (see `architecture.md`)

| Pattern | Use when | Avoid when |
|---|---|---|
| Modular monolith | One deployable, clear module boundaries | Team independence needs separate deploys |
| Hexagonal (ports & adapters) | Core logic must be testable w/o infrastructure | CRUD app where the DB IS the app |
| Clean Architecture | Long-lived core, many outer layers churn | Layers would be pass-through for 90% of cases |
| Vertical Slice | Features evolve independently, small teams | Shared logic would fork across slices |
| DDD (light) | Complex, evolving business rules, ubiquitous language | Thin CRUD over simple data |
| Event-driven | Loose coupling of independent reactions | You'd need distributed tracing to debug flows |

## 2. Creational (stack pack)

| Pattern | Use when | Avoid when |
|---|---|---|
| Factory Method | Creation varies by type; callers shouldn't know concrete class | One implementation, no variation |
| Abstract Factory | Families of related objects must stay consistent | Family of one |
| Builder | Multi-step optional construction, immutable targets | 2–3 flat params |
| Prototype | Clone beats re-constructing expensive state | Deep-copy semantics would surprise |
| Singleton | Genuine process-wide resource (config, pool) | Hidden global state, test seams die — prefer module/DI |

## 3. Structural (stack pack)

| Pattern | Use when | Avoid when |
|---|---|---|
| Adapter | Third-party interface must match yours | You own both sides — just change one |
| Decorator | Add responsibilities without touching the wrapped type | Conditional behavior (that's Strategy) |
| Facade | Subsystem complexity leaks into callers | It would become a god-object dumping ground |
| Composite | Tree structures treated uniformly | Fixed two-level structure |
| Proxy | Lazy/protected/remote access must be transparent | Plain delegation would do |
| Bridge | Two orthogonal dimensions vary independently | One dimension varies (Adapter/Strategy) |

## 4. Behavioral (stack pack)

| Pattern | Use when | Avoid when |
|---|---|---|
| Strategy | Algorithm varies, workflow stable | 2 variants chosen once — config flag |
| Observer | Multiple independent reactions to one event | Fixed single reaction; ordering matters (chain) |
| Command | Requests as objects (queue, undo, audit) | Direct call suffices |
| State | Behavior changes with mode/phase, transitions matter | 2 states w/ simple flag |
| Chain of Responsibility | Handler resolved at runtime among candidates | Fixed sequence — just call them |
| Mediator | N peers would otherwise know each other (N²) | Hub becomes the god-object |
| Template Method | Algorithm skeleton fixed, steps vary | Steps don't vary — drop the base class |

## 5. Resilience (see `resilience.md`)

| Pattern | Use when | Avoid when |
|---|---|---|
| Retry with backoff | Transient failures provably occur | Non-idempotent ops without dedup key |
| Circuit Breaker | Dependency outages cascade | Internal in-process calls |
| Bulkhead | One slow pool must not starve others | Single-purpose service, one workload |
| Timeout | Any call you don't control | — (always set one) |
| Idempotency keys | Retries/at-least-once delivery can occur | Read-only ops |
| Outbox | DB write + event publish must be atomic | Direct fire-and-forget is acceptable |

## 6. Data (see `data.md`)

| Pattern | Use when | Avoid when |
|---|---|---|
| Repository | Domain logic must not see persistence details | Thin CRUD — the ORM IS the repository |
| Unit of Work | Multiple writes must commit atomically | Single-write transactions |
| CQRS | Read and write shapes genuinely diverge | Reads ≈ writes — it's just two schemas to keep alive |
| Transaction Script | Simple, linear business operations | Logic accumulates duplicated procedures |
| Data Mapper | Objects must stay persistence-ignorant | Active-record style is working fine |

## 7. Testing (see `testing.md`)

| Technique | Use when | Avoid when |
|---|---|---|
| Test pyramid | Always — shape it, don't obey it blindly | — |
| Contract testing | Services consume your API/queue schema | Single consumer, deployed in lockstep |
| Property-based | Invariants over huge input spaces | One happy-path example |
| Mutation testing | You suspect the suite passes vacuously | Every run (cost) — sample it |
| Test doubles | Real dependency is slow/nondeterministic | Mocking what you don't own's contract |
