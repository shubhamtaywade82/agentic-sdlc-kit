# Structural Patterns — TypeScript / Node.js

Reference: https://refactoring.guru/design-patterns/structural-patterns

---

## Adapter

**Intent:** Convert an interface into the one clients expect.
**Use when:** Wrapping SDKs (Stripe, AWS, Twilio), legacy modules, or multiple vendors behind one port.
**TS idiom:** Class (or factory function) that `implements` the domain port and translates inputs, outputs, and errors.

```ts
// src/domain/payments/errors.ts
export class PaymentError extends Error { constructor(msg: string, readonly retryable: boolean) { super(msg); } }
export class CardDeclinedError extends PaymentError { constructor(msg: string) { super(msg, false); } }

// src/infrastructure/adapters/payments/stripe.adapter.ts
import Stripe from 'stripe';
import type { Charge, ChargeInput, PaymentGateway } from '../../../domain/payments/payment-gateway';
import { CardDeclinedError, PaymentError } from '../../../domain/payments/errors';

export class StripeAdapter implements PaymentGateway {
  private readonly stripe: Stripe;
  constructor(apiKey: string, client?: Stripe) { this.stripe = client ?? new Stripe(apiKey); }

  async charge({ amountCents, currency, token }: ChargeInput): Promise<Charge> {
    try {
      const pi = await this.stripe.paymentIntents.create(
        { amount: amountCents, currency: currency.toLowerCase(), payment_method: token, confirm: true,
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' } },
        { idempotencyKey: `${token}:${amountCents}` },
      );
      return { id: pi.id, status: pi.status === 'succeeded' ? 'succeeded' : 'failed', amountCents: pi.amount };
    } catch (e) {
      if (e instanceof Stripe.errors.StripeCardError) throw new CardDeclinedError(e.message);
      if (e instanceof Stripe.errors.StripeError) throw new PaymentError(e.message, e.type === 'StripeConnectionError');
      throw e;
    }
  }
}
```
Function-style adapter (when no state):
```ts
export const legacyUserAdapter = (legacy: LegacyUserApi): UserDirectory => ({
  async findByEmail(email) { const r = await legacy.lookup({ mail: email }); return r ? { id: String(r.uid), email: r.mail, name: r.cn } : null; },
});
```
**Test:** shared contract suite (see `testing.md`) run against each adapter with the SDK client faked; plus an opt-in integration test against the sandbox API (`describe.runIf(process.env.STRIPE_TEST_KEY)`).
**Pitfalls:** Returning SDK types (`Stripe.PaymentIntent`) from the adapter leaks the vendor into the domain.

---

## Bridge

**Intent:** Separate abstraction from implementation so both vary independently.
**Use when:** N notification types × M channels; N report types × M renderers (PDF/HTML).

```ts
// implementor
export interface Channel { deliver(to: string, subject: string, body: string): Promise<void> }
export class EmailChannel implements Channel { constructor(private mailer: Mailer) {} deliver(to: string, s: string, b: string) { return this.mailer.send({ to, subject: s, text: b }); } }
export class SmsChannel implements Channel { constructor(private sms: SmsClient) {} deliver(to: string, s: string, b: string) { return this.sms.send(to, `${s}: ${b}`); } }

// abstraction
export abstract class Notification {
  constructor(protected readonly channel: Channel) {}
  async sendTo(address: string) { await this.channel.deliver(address, this.subject(), this.body()); }
  protected abstract subject(): string;
  protected abstract body(): string;
}
export class OrderShipped extends Notification {
  constructor(channel: Channel, private order: { id: string; tracking: string }) { super(channel); }
  protected subject() { return `Order #${this.order.id} shipped`; }
  protected body() { return `Tracking: ${this.order.tracking}`; }
}

await new OrderShipped(new SmsChannel(twilio), order).sendTo('+91...');
```
**Test:** abstractions with a recording fake `Channel`; channels separately.
**Pitfalls:** One dimension of variation → it's just Strategy.

---

## Composite

**Intent:** Treat single objects and groups uniformly in a tree.
**Use when:** Menus, category trees, bundles, permission groups, file systems, nested rules.
**TS idiom:** Recursive discriminated union + one recursive function, or a shared interface.

```ts
export type PriceNode =
  | { kind: 'item'; name: string; priceCents: number }
  | { kind: 'bundle'; name: string; discount: number; children: PriceNode[] };

export function totalCents(node: PriceNode): number {
  switch (node.kind) {
    case 'item': return node.priceCents;
    case 'bundle': return Math.round(node.children.reduce((s, c) => s + totalCents(c), 0) * (1 - node.discount));
  }
}

const kit: PriceNode = { kind: 'bundle', name: 'Starter', discount: 0.1, children: [
  { kind: 'item', name: 'Keyboard', priceCents: 3000 },
  { kind: 'bundle', name: 'Cables', discount: 0, children: [{ kind: 'item', name: 'USB-C', priceCents: 500 }] },
]};
totalCents(kit); // 3150
```
OO form:
```ts
interface Component { total(): number }
class Item implements Component { constructor(readonly price: number) {} total() { return this.price; } }
class Group implements Component {
  private children: Component[] = [];
  add(c: Component) { this.children.push(c); return this; }
  total() { return this.children.reduce((s, c) => s + c.total(), 0); }
}
```
**Test:** leaf, empty group, nested groups, discount rounding.
**Pitfalls:** Deep recursion on untrusted input — cap depth. For DB trees use recursive CTEs, not N+1 loads.

---

## Decorator

**Intent:** Add behavior by wrapping an object/function with the same interface.
**Use when:** Logging, retries, caching, metrics, auth around services; layering optional behavior.
**TS idiom:** Higher-order functions for functions; wrapper classes implementing the same interface for objects; TC39 (TS 5) method decorators for cross-cutting concerns.

```ts
// Object decorators — stackable
export class LoggingGateway implements PaymentGateway {
  constructor(private inner: PaymentGateway, private log: Logger) {}
  async charge(input: ChargeInput) {
    this.log.info({ amount: input.amountCents }, 'charge.start');
    const r = await this.inner.charge(input);
    this.log.info({ id: r.id, status: r.status }, 'charge.done');
    return r;
  }
}

export class RetryingGateway implements PaymentGateway {
  constructor(private inner: PaymentGateway, private attempts = 3, private sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) {}
  async charge(input: ChargeInput) {
    for (let i = 1; ; i++) {
      try { return await this.inner.charge(input); }
      catch (e) {
        if (!(e instanceof PaymentError) || !e.retryable || i >= this.attempts) throw e;
        await this.sleep(100 * 2 ** i);
      }
    }
  }
}

const gateway: PaymentGateway = new LoggingGateway(new RetryingGateway(new StripeAdapter(key)), logger);

// Function decorator (HOF)
export function withTiming<A extends unknown[], R>(name: string, fn: (...a: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    const t = performance.now();
    try { return await fn(...args); } finally { metrics.timing(name, performance.now() - t); }
  };
}

// TC39 method decorator (TS 5+, no experimentalDecorators)
export function logged<This, A extends unknown[], R>(target: (this: This, ...a: A) => R, ctx: ClassMethodDecoratorContext<This>) {
  return function (this: This, ...args: A): R { console.log(`→ ${String(ctx.name)}`); return target.call(this, ...args); };
}
class Reports { @logged generate(year: number) { /* ... */ } }
```
**Test:** fake inner that fails N times; inject `sleep` as a no-op; assert call count and propagated non-retryable errors.
**Pitfalls:** Wrapper order matters (log outside retry logs once; inside logs every attempt) — document it in the composition root.

---

## Facade

**Intent:** Simple interface over a complex subsystem.
**Use when:** Route handlers orchestrate inventory, payments, persistence, email, analytics.
**TS idiom:** A use-case class/function with injected ports and a `Result` return.

```ts
// src/application/checkout/place-order.ts
import { ok, err, type Result } from '../../shared/result';

export interface PlaceOrderDeps {
  inventory: { reserve(items: LineItem[]): Promise<void>; release(items: LineItem[]): Promise<void> };
  orders: { create(o: NewOrder): Promise<Order>; markPaid(id: string, paymentId: string): Promise<Order> };
  gateway: PaymentGateway;
  events: EventBus<DomainEvents>;
}

export type PlaceOrderError = 'OUT_OF_STOCK' | 'PAYMENT_DECLINED' | 'PAYMENT_FAILED';

export class PlaceOrder {
  constructor(private readonly d: PlaceOrderDeps) {}

  async execute(cart: Cart, userId: string, token: string): Promise<Result<Order, PlaceOrderError>> {
    try { await this.d.inventory.reserve(cart.items); }
    catch (e) { if (e instanceof OutOfStockError) return err('OUT_OF_STOCK'); throw e; }

    const order = await this.d.orders.create({ userId, items: cart.items, totalCents: cart.totalCents });
    try {
      const charge = await this.d.gateway.charge({ amountCents: order.totalCents, currency: 'INR', token });
      const paid = await this.d.orders.markPaid(order.id, charge.id);
      this.d.events.emit('order.paid', { orderId: paid.id });
      return ok(paid);
    } catch (e) {
      await this.d.inventory.release(cart.items);
      if (e instanceof CardDeclinedError) return err('PAYMENT_DECLINED');
      if (e instanceof PaymentError) return err('PAYMENT_FAILED');
      throw e;
    }
  }
}

// Express route stays thin
router.post('/checkout', async (req, res) => {
  const r = await placeOrder.execute(req.cart, req.user.id, req.body.token);
  if (r.ok) return res.status(201).json(r.value);
  res.status(r.error === 'OUT_OF_STOCK' ? 409 : 402).json({ error: r.error });
});
```
**Pitfalls:** One facade per use case; don't let it become `OrderService` with 20 methods.

---

## Flyweight

**Intent:** Share intrinsic immutable state among many objects.
**Use when:** Large numbers of objects repeating identical data (currencies, units, glyphs, tiles, parsed schemas).

```ts
export interface Currency { readonly code: string; readonly symbol: string; readonly minorUnits: number }
const DATA: Record<string, Omit<Currency, 'code'>> = { INR: { symbol: '₹', minorUnits: 2 }, USD: { symbol: '$', minorUnits: 2 }, JPY: { symbol: '¥', minorUnits: 0 } };
const cache = new Map<string, Currency>();

export function currency(code: string): Currency {
  const key = code.toUpperCase();
  let c = cache.get(key);
  if (!c) {
    const d = DATA[key];
    if (!d) throw new Error(`Unknown currency ${code}`);
    c = Object.freeze({ code: key, ...d });
    cache.set(key, c);
  }
  return c;
}

export interface Money { readonly cents: number; readonly currency: Currency } // extrinsic: cents
currency('inr') === currency('INR'); // true
```
**Pitfalls:** Must be immutable (`Object.freeze`, `readonly`). Unbounded caches leak memory — bound them (LRU) if keys are open-ended. Measure with `--heap-prof` before adopting.

---

## Proxy

**Intent:** Surrogate controlling access to a real object (caching, lazy init, auth, rate limiting, remote).
**TS idiom:** Explicit wrapper implementing the same interface (type-safe). JS `Proxy` only for generic cross-cutting wrappers.

```ts
// Caching proxy
export interface FxRates { rate(from: string, to: string): Promise<number> }

export class CachedFxRates implements FxRates {
  private cache = new Map<string, { v: number; exp: number }>();
  private inflight = new Map<string, Promise<number>>();
  constructor(private real: FxRates, private ttlMs = 3_600_000, private now = () => Date.now()) {}

  async rate(from: string, to: string) {
    const k = `${from}:${to}`;
    const hit = this.cache.get(k);
    if (hit && hit.exp > this.now()) return hit.v;
    let p = this.inflight.get(k);                // request coalescing
    if (!p) {
      p = this.real.rate(from, to).then((v) => { this.cache.set(k, { v, exp: this.now() + this.ttlMs }); return v; })
                                   .finally(() => this.inflight.delete(k));
      this.inflight.set(k, p);
    }
    return p;
  }
}

// Protection proxy
export class AuthorizedDocs implements DocRepo {
  constructor(private real: DocRepo, private user: User) {}
  find(id: string) { return this.real.find(id); }
  async delete(id: string) {
    const doc = await this.real.find(id);
    if (doc?.ownerId !== this.user.id && !this.user.roles.includes('admin')) throw new ForbiddenError();
    return this.real.delete(id);
  }
}

// Virtual (lazy) proxy via JS Proxy — generic
export function lazy<T extends object>(init: () => T): T {
  let target: T | undefined;
  return new Proxy({} as T, {
    get(_t, prop) { target ??= init(); const v = Reflect.get(target, prop); return typeof v === 'function' ? v.bind(target) : v; },
  });
}
```
**Test:** fake real subject with a call counter; use `vi.useFakeTimers()` or inject `now` to test TTL; fire two concurrent calls and assert one upstream call.
**Pitfalls:** Proxy vs Decorator — a Proxy controls access/lifecycle of the subject; a Decorator adds behavior and is freely stacked by the client.
