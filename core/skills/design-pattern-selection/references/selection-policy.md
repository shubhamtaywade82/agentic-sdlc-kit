# Pattern Selection Policy — worked example

The policy in five questions, applied to a real decision. Use this shape in
plans and PRs.

## Scenario (from the architecture proposal)

Three payment providers — Stripe, Razorpay, PayPal. The codebase has repeated
conditionals: every charge site switches on provider, and every refund site
switches again. Adding a provider means finding every switch.

### 1. What specific problem exists?

`app/services/charge.rb` and `app/services/refund.rb` both branch on
`provider` (2 sites × 3 branches); a fourth provider would touch both plus
`config/routes` dispatch — N×M growth between providers and operations.

### 2. Why is the current design insufficient?

- Duplication: the same provider discrimination is repeated per operation.
- Open/closed violation: adding a provider edits every operation site.
- Testing: each operation test must mock all providers.

### 3. What simpler alternative was considered?

- Config table of per-provider endpoints — handles data differences, not
  behavioral ones (retries, error mapping differ per provider). Rejected: the
  variation is algorithmic, not parametric.
- One service class with a case statement — that IS the current smell.

### 4. What complexity does the pattern introduce?

One `PaymentProvider` interface, three implementations, a factory/registry for
selection. Callers depend on the interface (+1 indirection). New concept count:
one. Payment logic remains independently testable per provider.

### 5. How will the implementation be tested?

- Contract test shared by every provider implementation (same charge input →
  same result type; provider-specific error mapping asserted per class).
- One test per operation proving dispatch to the registered provider.

## Decision

**Strategy** — the payment *algorithm* varies (per provider) while the calling
*workflow* stays stable. This is the textbook pressure for Strategy.

## Precondition checked first

Searched the codebase for an existing payment abstraction: found
`app/services/payment_gateway.rb` wrapping refunds only. Decision: **extend
the existing abstraction** rather than introduce a second one — a parallel
abstraction would be architectural regression.

## What this decision does NOT authorize

- No repository/Unit-of-Work/UoW introduction for payments (persistence
  unchanged).
- No ADR: class-level pattern with inline justification. An ADR would be
  warranted if we were choosing the payment *architecture* (e.g. async
  outbox-based settlement), not the provider *dispatch*.
- No speculative fourth provider implementation — the pattern must make the
  next provider cheaper, not prove it with dead code.

## Reference implementation sketch

```typescript
interface PaymentProvider {
  charge(input: ChargeInput): Promise<PaymentResult>
}

class PaymentService {
  constructor(private readonly provider: PaymentProvider) {}
  charge(input: ChargeInput) { return this.provider.charge(input) }
}
```

Ruby equivalent in the stack pack: `.ai/stack/<name>/patterns/behavioral.md`
(Strategy) — same contract test shape, DuckTyped interface.
