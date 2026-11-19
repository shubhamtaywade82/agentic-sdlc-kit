# Testing Patterns with Vitest (Jest-compatible)

## Setup

```bash
npm i -D vitest @vitest/coverage-v8 typescript
```
```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', coverage: { provider: 'v8' }, restoreMocks: true } });
```
Jest equivalents: `vi.fn` → `jest.fn`, `vi.useFakeTimers` → `jest.useFakeTimers`, `describe.each` identical.

## Prefer fakes over module mocks

Patterns introduce seams — use them. Pass an in-memory fake instead of `vi.mock('stripe')`.

```ts
class FakeGateway implements PaymentGateway {
  calls: ChargeInput[] = [];
  constructor(private behavior: (i: ChargeInput) => Promise<Charge> = async (i) => ({ id: 'ch_1', status: 'succeeded', amountCents: i.amountCents })) {}
  charge(i: ChargeInput) { this.calls.push(i); return this.behavior(i); }
}
```

## Contract suites (Adapter, Strategy, Abstract Factory, Repository)

```ts
// test/contracts/payment-gateway.contract.ts
export function paymentGatewayContract(name: string, make: () => PaymentGateway) {
  describe(`${name} satisfies PaymentGateway`, () => {
    it('returns a Charge with the requested amount', async () => {
      const c = await make().charge({ amountCents: 100, currency: 'INR', token: 'tok_ok' });
      expect(c).toMatchObject({ amountCents: 100, status: expect.stringMatching(/succeeded|failed/) });
    });
    it('maps declines to CardDeclinedError', async () => {
      await expect(make().charge({ amountCents: 100, currency: 'INR', token: 'tok_declined' })).rejects.toBeInstanceOf(CardDeclinedError);
    });
  });
}

// stripe.adapter.test.ts
paymentGatewayContract('StripeAdapter', () => new StripeAdapter('k', fakeStripeClient()));
paymentGatewayContract('FakeGateway', () => new FakeGateway(fakeBehavior));
```

Strategy table:
```ts
describe.each(Object.entries(strategies))('%s shipping strategy', (_name, strategy) => {
  it('returns a non-negative integer', () => {
    const v = strategy(order({ weightKg: 2.5 }));
    expect(Number.isInteger(v) && v >= 0).toBe(true);
  });
});
```

## Chain of Responsibility

```ts
it('short-circuits blocklisted emails', async () => {
  const next = vi.fn().mockResolvedValue({ status: 'pass' });
  const v = await blocklist({ has: async () => true })(order(), next);
  expect(v).toEqual({ status: 'block', reason: 'blocklisted' });
  expect(next).not.toHaveBeenCalled();
});
```

## State — table-driven

```ts
it.each([
  ['pending', { type: 'PAY', paymentId: 'p' }, 'paid'],
  ['pending', { type: 'CANCEL', reason: 'x' }, 'cancelled'],
  ['paid', { type: 'SHIP', tracking: 't' }, 'shipped'],
  ['shipped', { type: 'PAY', paymentId: 'p' }, InvalidTransition],
] as const)('%s + %o → %s', (from, ev, expected) => {
  const s = stateFixture(from);
  if (typeof expected === 'string') expect(transition(s, ev).status).toBe(expected);
  else expect(() => transition(s, ev)).toThrow(expected);
});
```

## Decorator / Proxy with time

```ts
it('retries retryable errors', async () => {
  let n = 0;
  const inner = new FakeGateway(async (i) => { if (++n < 3) throw new PaymentError('net', true); return { id: 'x', status: 'succeeded', amountCents: i.amountCents }; });
  const gw = new RetryingGateway(inner, 3, async () => {}); // no-op sleep
  await expect(gw.charge(input)).resolves.toMatchObject({ id: 'x' });
  expect(inner.calls).toHaveLength(3);
});

it('caches and coalesces', async () => {
  const real = { rate: vi.fn().mockResolvedValue(83.2) };
  let now = 0;
  const fx = new CachedFxRates(real, 1000, () => now);
  await Promise.all([fx.rate('USD', 'INR'), fx.rate('USD', 'INR')]);
  expect(real.rate).toHaveBeenCalledTimes(1);
  now = 2000; await fx.rate('USD', 'INR');
  expect(real.rate).toHaveBeenCalledTimes(2);
});
```

## Observer

```ts
it('isolates failing subscribers', async () => {
  const onError = vi.fn();
  const bus = new EventBus<DomainEvents>(onError);
  const ok = vi.fn();
  bus.on('order.paid', () => { throw new Error('boom'); });
  bus.on('order.paid', ok);
  bus.emit('order.paid', { orderId: '1' });
  await vi.waitFor(() => { expect(ok).toHaveBeenCalled(); expect(onError).toHaveBeenCalled(); });
});
```

## Iterator

```ts
it('stops fetching when consumer breaks', async () => {
  const listForOrg = vi.fn().mockResolvedValueOnce({ data: [r1, r2] }).mockResolvedValueOnce({ data: [r3] }).mockResolvedValue({ data: [] });
  for await (const _ of listRepos('o', { rest: { repos: { listForOrg } } } as never)) break;
  expect(listForOrg).toHaveBeenCalledTimes(1);
});
```

## Compile-time tests (Builder type-state, Visitor exhaustiveness)

```ts
// builder.test-d.ts — run with `vitest --typecheck`
import { expectTypeOf } from 'vitest';
// @ts-expect-error build() requires to() and subject()
EmailBuilder.create().to('a@b.c').build();
expectTypeOf(EmailBuilder.create().to('a').subject('s').build()).toEqualTypeOf<Email>();
```

## Coverage of the pattern itself

1. Each concrete variant: unit tests.
2. All variants: shared contract suite.
3. Selection/registry: picks correct variant, rejects unknown keys.
4. Client: exercised through the interface with a fake.
5. Types: `tsc --noEmit` / `vitest --typecheck` proves exhaustiveness and required steps.
