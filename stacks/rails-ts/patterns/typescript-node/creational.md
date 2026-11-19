# Creational Patterns — TypeScript / Node.js

Reference: https://refactoring.guru/design-patterns/creational-patterns

---

## Factory Method

**Intent:** Defer the choice of concrete class to a creation function so clients depend on an interface.
**Use when:** Implementation depends on config/runtime data; new variants are added over time.
**Avoid when:** There's only one implementation.
**TS idiom:** A typed registry of factory functions with `satisfies`.

```ts
// src/domain/payments/payment-gateway.ts
export interface Charge { id: string; status: 'succeeded' | 'failed'; amountCents: number }
export interface ChargeInput { amountCents: number; currency: string; token: string }
export interface PaymentGateway { charge(input: ChargeInput): Promise<Charge> }

// src/infrastructure/adapters/payments/gateway-factory.ts
import { StripeAdapter } from './stripe.adapter';
import { RazorpayAdapter } from './razorpay.adapter';
import type { PaymentGateway } from '../../../domain/payments/payment-gateway';

interface GatewayConfig { apiKey: string; apiSecret?: string }

const registry = {
  stripe: (c: GatewayConfig) => new StripeAdapter(c.apiKey),
  razorpay: (c: GatewayConfig) => new RazorpayAdapter(c.apiKey, c.apiSecret ?? ''),
} satisfies Record<string, (c: GatewayConfig) => PaymentGateway>;

export type GatewayName = keyof typeof registry;

export function isGatewayName(x: string): x is GatewayName {
  return Object.hasOwn(registry, x);
}

export function createGateway(name: GatewayName, config: GatewayConfig): PaymentGateway {
  return registry[name](config);
}

// usage
const name = process.env.GATEWAY ?? 'stripe';
if (!isGatewayName(name)) throw new Error(`Unknown gateway ${name}`);
const gateway = createGateway(name, { apiKey: process.env.PAYMENT_KEY! });
```

Classic subclass form (creator has shared logic):
```ts
abstract class ReportExporter {
  async export(rows: Row[]): Promise<Buffer> { return this.createFormatter().format(rows); }
  protected abstract createFormatter(): Formatter;
}
class CsvExporter extends ReportExporter { protected createFormatter() { return new CsvFormatter(); } }
```

**Test (Vitest)**
```ts
it('creates the requested gateway', () => {
  expect(createGateway('stripe', { apiKey: 'k' })).toBeInstanceOf(StripeAdapter);
});
it('guards unknown names', () => expect(isGatewayName('bogus')).toBe(false));
```
**Pitfalls:** Indexing a registry with an unchecked string (`registry[req.query.type]`) — always narrow with a type guard and `Object.hasOwn` (prototype keys like `constructor`).

---

## Abstract Factory

**Intent:** Create families of related objects that must be used together.
**Use when:** Per-region, per-cloud, or per-tenant sets that must match (tax + invoice + address validation; storage + queue).
**TS idiom:** An interface whose members are factory methods; implementations are plain objects.

```ts
// src/domain/regions/region-factory.ts
export interface TaxCalculator { compute(order: Order): number }
export interface InvoiceRenderer { render(order: Order, tax: number): Promise<Buffer> }
export interface AddressValidator { validate(a: Address): void }

export interface RegionFactory {
  taxCalculator(): TaxCalculator;
  invoiceRenderer(): InvoiceRenderer;
  addressValidator(): AddressValidator;
}

// src/infrastructure/regions/index.ts
export const indiaFactory: RegionFactory = {
  taxCalculator: () => new GstCalculator(),
  invoiceRenderer: () => new GstInvoiceRenderer(),
  addressValidator: () => new PincodeValidator(),
};
export const euFactory: RegionFactory = {
  taxCalculator: () => new VatCalculator(),
  invoiceRenderer: () => new VatInvoiceRenderer(),
  addressValidator: () => new PostcodeValidator(),
};
export const regionFactories = { IN: indiaFactory, EU: euFactory } as const satisfies Record<string, RegionFactory>;

// src/application/invoices/generate-invoice.ts
export async function generateInvoice(order: Order, region: RegionFactory): Promise<Buffer> {
  region.addressValidator().validate(order.billingAddress);
  const tax = region.taxCalculator().compute(order);
  return region.invoiceRenderer().render(order, tax);
}
```
The `RegionFactory` type guarantees at compile time that every family is complete.

**Pitfalls:** Adding a product type forces edits to all families (TS will flag them — good).

---

## Builder

**Intent:** Construct complex objects step by step.
**Use when:** Many optional parts, ordered steps, or query/payload construction; especially when you want compile-time enforcement of required steps.
**Avoid when:** An options object with defaults is enough: `function createServer({ port = 3000, host = '0.0.0.0' }: Partial<Opts> = {})`.

```ts
// src/infrastructure/persistence/product-query.builder.ts (SQL via Knex/Drizzle-like API)
type Sort = 'newest' | 'price';

export class ProductQueryBuilder {
  private readonly where: string[] = [];
  private readonly params: unknown[] = [];
  private orderBy = 'created_at DESC';
  private limitN = 20;

  inCategory(id?: number) { if (id != null) { this.params.push(id); this.where.push(`category_id = $${this.params.length}`); } return this; }
  priceBetween(min?: number, max?: number) {
    if (min != null) { this.params.push(min); this.where.push(`price_cents >= $${this.params.length}`); }
    if (max != null) { this.params.push(max); this.where.push(`price_cents <= $${this.params.length}`); }
    return this;
  }
  inStock(flag = true) { if (flag) this.where.push('stock > 0'); return this; }
  sorted(by: Sort) { this.orderBy = by === 'price' ? 'price_cents ASC' : 'created_at DESC'; return this; }
  limit(n: number) { this.limitN = Math.min(n, 100); return this; }

  build(): { text: string; values: unknown[] } {
    const where = this.where.length ? `WHERE ${this.where.join(' AND ')}` : '';
    return { text: `SELECT * FROM products ${where} ORDER BY ${this.orderBy} LIMIT ${this.limitN}`, values: this.params };
  }
}

const q = new ProductQueryBuilder().inCategory(3).priceBetween(undefined, 1000).inStock().sorted('price').build();
await pool.query(q.text, q.values);
```

Type-state builder — required steps enforced at compile time:
```ts
type Req = { to: true; subject: true };
class EmailBuilder<S extends Partial<Req> = {}> {
  declare readonly __state: S; // phantom field so TS tracks S structurally
  private constructor(private readonly data: Partial<Email>) {}
  static create() { return new EmailBuilder({}); }
  to(addr: string) { return new EmailBuilder<S & { to: true }>({ ...this.data, to: addr }); }
  subject(s: string) { return new EmailBuilder<S & { subject: true }>({ ...this.data, subject: s }); }
  html(h: string) { return new EmailBuilder<S>({ ...this.data, html: h }); }
  build(this: EmailBuilder<Req>): Email { return this.data as Email; }
}
EmailBuilder.create().to('a@b.c').subject('Hi').html('<p>x</p>').build(); // ok
// EmailBuilder.create().to('a@b.c').build(); // compile error
```

**Test:** assert `build()` output (`text`, `values`) for combinations; for type-state builders add a `// @ts-expect-error` line in a `.test-d.ts` file (Vitest `expectTypeOf`).
**Pitfalls:** Never interpolate user values into SQL — only push to `params`.

---

## Prototype

**Intent:** Create objects by copying a configured instance.
**Use when:** Templates (campaign/document drafts), expensive-to-build configs, test fixtures.
**TS idiom:** `structuredClone` for plain data (deep, handles Date/Map/Set; drops functions and class prototypes); explicit `clone()` for class instances.

```ts
export interface Step { id: string; delayHours: number; templateId: string }
export class Campaign {
  constructor(
    public readonly id: string,
    public name: string,
    public status: 'draft' | 'active',
    public steps: Step[],
  ) {}

  /** Prototype: users duplicate an existing campaign as a template. */
  clone(newId: string, idGen: () => string): Campaign {
    return new Campaign(
      newId,
      `${this.name} (copy)`,
      'draft',
      this.steps.map((s) => ({ ...s, id: idGen() })), // deep-enough copy, fresh ids
    );
  }
}

const defaults = Object.freeze({ retries: 3, timeoutMs: 5_000, headers: { 'user-agent': 'svc' } });
const cfg = structuredClone(defaults); // mutable deep copy
```
**Test:** mutate the clone's nested arrays and assert the original is unchanged; assert new ids.
**Pitfalls:** Spread `{...obj}` is shallow. `structuredClone` loses class methods — don't use it on class instances.

---

## Singleton

**Intent:** One instance with a global access point.
**Use when:** Process-wide resources: DB pool, Redis client, logger, config, metrics.
**TS idiom:** ES modules are evaluated once and cached — export the instance. For lazy init, memoize the promise.

```ts
// src/infrastructure/db.ts
import { Pool } from 'pg';
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

// Lazy async singleton (avoid double-init races by caching the promise)
import { createClient, type RedisClientType } from 'redis';
let redisPromise: Promise<RedisClientType> | undefined;
export function getRedis(): Promise<RedisClientType> {
  redisPromise ??= (async () => {
    const c: RedisClientType = createClient({ url: process.env.REDIS_URL });
    c.on('error', (e) => logger.error({ e }, 'redis error'));
    await c.connect();
    return c;
  })();
  return redisPromise;
}

// Per-request context — NOT a singleton
import { AsyncLocalStorage } from 'node:async_hooks';
export const requestContext = new AsyncLocalStorage<{ requestId: string; userId?: string }>();
// middleware: requestContext.run({ requestId: randomUUID() }, next);
```
NestJS: providers are singleton-scoped by default; avoid `Scope.REQUEST` unless necessary (performance).

**Test:** inject the dependency into consumers instead of importing the singleton directly; in tests pass a fake. If you must, `vi.mock('../infrastructure/db')`.
**Pitfalls:** Two copies of a package (duplicate `node_modules` versions) produce two "singletons". Mutable singleton state leaks across requests.
