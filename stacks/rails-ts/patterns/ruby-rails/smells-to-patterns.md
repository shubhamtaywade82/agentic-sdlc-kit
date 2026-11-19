# Smells → Refactorings → Patterns (Ruby / Rails)

Smell and refactoring catalog: https://refactoring.guru/refactoring/smells · https://refactoring.guru/refactoring/techniques

| Smell (what you see) | Refactoring | Target pattern |
|---|---|---|
| `case gateway when "stripe" ... when "paypal"` repeated in several methods | Replace Conditional with Polymorphism | Strategy / Factory Method + Adapter |
| `if status == "paid" ... elsif status == "shipped"` in many model methods | Replace Type Code with State/Strategy | State |
| Fat controller action (> ~15 lines, multiple models, external calls) | Extract Class | Facade / Command (service object) |
| `after_save` callbacks sending emails, calling APIs | Extract side effects; move to `after_commit` | Observer (Notifications) or explicit Command |
| Vendor SDK calls scattered across app (`Stripe::...` in 10 files) | Encapsulate external dependency | Adapter (+ Proxy for caching) |
| Same 6-step algorithm copy-pasted with tweaks (CSV/XLSX/JSON importers) | Form Template Method | Template Method |
| Constructor with 8+ args or many optional params | Introduce Parameter Object | Builder or `Data.define` |
| Subclass explosion: `SmsUrgentNotifier`, `EmailUrgentNotifier`, `SmsDigestNotifier` | Separate dimensions | Bridge |
| Model with presentation methods (`full_name_html`, `formatted_price`) | Move Method | Decorator / Presenter |
| Long `if` chain of validations/checks that can short-circuit | Decompose Conditional | Chain of Responsibility |
| Objects calling each other in a web (A→B→C→A) | Move Method / Hide Delegate | Mediator |
| Global `$config` or class variables mutated at runtime | Replace Global with Injection | Singleton (immutable) or `CurrentAttributes` |
| Recursive `children.each` logic duplicated for leaves and groups | Extract uniform interface | Composite (+ Iterator) |
| `.all.each` over huge tables / manual pagination loops | Extract Enumerator | Iterator (`find_each`, `Enumerator`) |
| "Duplicate this" implemented by copying attributes by hand | Extract method `#duplicate` | Prototype |
| Undo/redo or "revert" built ad hoc | Encapsulate snapshot | Memento + Command |
| Many operations added to a stable class hierarchy (`to_html`, `to_pdf`, `to_md` on each node) | Move Method to visitor | Visitor (or pattern matching) |
| Expensive object always loaded even when unused | Lazy initialization | Proxy (virtual) |
| Millions of objects duplicating identical data | Extract intrinsic state | Flyweight |

## Review checklist (run before approving a pattern PR)

- [ ] The PR states the smell it removes, and the old conditional/duplication is actually deleted.
- [ ] There are ≥ 2 concrete variants now (or a dated, committed plan for the second).
- [ ] A Ruby idiom (block, lambda, module, `SimpleDelegator`, `Enumerable`, Rails built-in) was considered first.
- [ ] Public API is one method (`call`/domain verb) where possible; collaborators injected with defaults.
- [ ] No mutable shared state on class-level/singleton objects (thread-safe under Puma/Sidekiq).
- [ ] No `constantize` / `send` on user input without an allowlist.
- [ ] External side effects happen after commit, and are idempotent.
- [ ] Shared examples enforce the polymorphic contract across all variants.
- [ ] Files live where Zeitwerk expects them; names describe the domain, not the pattern (`Shipping::ByWeight`, not `ShippingStrategyImpl2`).
- [ ] `bundle exec rspec` and `bundle exec rubocop` pass.
