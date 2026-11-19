# Behavioral Patterns — TypeScript / Node.js

Reference: https://refactoring.guru/design-patterns/behavioral-patterns

---

## Chain of Responsibility

**Intent:** Pass a request along handlers; each handles it or delegates to the next.
**Use when:** Middleware, validation pipelines, fraud/risk checks, discount resolution, approval flows.
**TS idiom:** Array of handler functions composed with `reduceRight` — the Express/Koa model.

```ts
// src/application/fraud/chain.ts
export type Verdict = { status: 'pass' } | { status: 'review' | 'block'; reason: string };
export type FraudHandler = (order: Order, next: () => Promise<Verdict>) => Promise<Verdict>;

export function compose(handlers: FraudHandler[]): (order: Order) => Promise<Verdict> {
  return (order) =>
    handlers.reduceRight<() => Promise<Verdict>>(
      (next, h) => () => h(order, next),
      async () => ({ status: 'pass' }),
    )();
}

export const blocklist = (repo: BlocklistRepo): FraudHandler => async (o, next) =>
  (await repo.has(o.email)) ? { status: 'block', reason: 'blocklisted' } : next();

export const velocity = (orders: OrderRepo, max = 5): FraudHandler => async (o, next) =>
  (await orders.countSince(o.userId, Date.now() - 3_600_000)) > max ? { status: 'review', reason: 'velocity' } : next();

export const highValue = (limitCents = 500_000): FraudHandler => async (o, next) =>
  o.totalCents > limitCents ? { status: 'review', reason: 'high value' } : next();

export const checkFraud = compose([blocklist(blocklistRepo), velocity(orderRepo), highValue()]);
```

Express/Fastify middleware is the built-in chain:
```ts
app.use(requestId(), helmet(), rateLimit({ windowMs: 60_000, limit: 100 }), authenticate, router);
// Fastify: app.addHook('onRequest', authenticate); app.addHook('preHandler', authorize);
```
**Test:** each handler with a `next` spy (`vi.fn().mockResolvedValue({ status: 'pass' })`) — assert called on pass, not called on short-circuit; one test for composed order.
**Pitfalls:** Forgetting to `return next()` (or `await`) silently drops the result. In Express, always pass errors to `next(err)`.

---

## Command

**Intent:** Encapsulate a request as an object — queue, log, retry, undo.
**Use when:** Background jobs, CQRS write side, undo/redo, audit logs, outbox.
**TS idiom:** Discriminated-union command objects + a typed handler map; BullMQ/SQS jobs are serialized commands.

```ts
// src/application/commands.ts
export type Command =
  | { type: 'TransferFunds'; fromId: string; toId: string; amountCents: number; actorId: string }
  | { type: 'CloseAccount'; accountId: string; actorId: string };

type HandlerMap = { [K in Command['type']]: (cmd: Extract<Command, { type: K }>) => Promise<Result<unknown, string>> };

export function createCommandBus(handlers: HandlerMap, audit: AuditLog) {
  return async function dispatch<C extends Command>(cmd: C) {
    const handler = handlers[cmd.type] as (c: C) => Promise<Result<unknown, string>>;
    const result = await handler(cmd);
    await audit.record({ command: cmd, ok: result.ok, at: new Date() });
    return result;
  };
}

// handler with transaction (Prisma example)
export const transferFunds = (db: PrismaClient) => async (c: Extract<Command, { type: 'TransferFunds' }>) =>
  db.$transaction(async (tx) => {
    const from = await tx.account.findUniqueOrThrow({ where: { id: c.fromId } });
    if (from.balanceCents < c.amountCents) return err('INSUFFICIENT_FUNDS');
    await tx.account.update({ where: { id: c.fromId }, data: { balanceCents: { decrement: c.amountCents } } });
    await tx.account.update({ where: { id: c.toId }, data: { balanceCents: { increment: c.amountCents } } });
    return ok(undefined);
  });

// Queued command (BullMQ)
import { Queue, Worker } from 'bullmq';
const queue = new Queue<Command>('commands', { connection });
await queue.add('TransferFunds', cmd, { attempts: 5, backoff: { type: 'exponential', delay: 1000 }, jobId: idempotencyKey });
new Worker<Command>('commands', (job) => dispatch(job.data), { connection });
```

Undo/redo:
```ts
interface UndoableCommand { execute(): void; undo(): void }
class History {
  private done: UndoableCommand[] = []; private undone: UndoableCommand[] = [];
  run(c: UndoableCommand) { c.execute(); this.done.push(c); this.undone = []; }
  undo() { const c = this.done.pop(); if (c) { c.undo(); this.undone.push(c); } }
  redo() { const c = this.undone.pop(); if (c) { c.execute(); this.done.push(c); } }
}
```
**Test:** handler unit tests with an in-memory repo; dispatch test asserts audit recorded; HandlerMap type guarantees every command has a handler (compile-time).
**Pitfalls:** Job payloads must be JSON-serializable (no class instances, Dates become strings). Make handlers idempotent (`jobId` / idempotency keys).

---

## Iterator

**Intent:** Traverse a collection without exposing its structure.
**Use when:** Paginated APIs, DB cursors, streaming files, tree traversal.
**TS idiom:** Generators and async generators; consumers use `for...of` / `for await...of`.

```ts
// Paginated API as an async iterator
export async function* listRepos(org: string, gh: Octokit): AsyncGenerator<Repo> {
  for (let page = 1; ; page++) {
    const { data } = await gh.rest.repos.listForOrg({ org, per_page: 100, page });
    if (data.length === 0) return;
    yield* data;
  }
}

for await (const repo of listRepos('nodejs', gh)) {
  if (repo.fork) continue;
  console.log(repo.full_name);
}

// Keyset-paginated DB cursor (constant memory)
export async function* streamUsers(db: Pool, batch = 1000) {
  let lastId = 0;
  while (true) {
    const { rows } = await db.query<User>('SELECT * FROM users WHERE id > $1 ORDER BY id LIMIT $2', [lastId, batch]);
    if (!rows.length) return;
    yield* rows;
    lastId = rows.at(-1)!.id;
  }
}

// Tree iterator for Composite
export function* walk(node: PriceNode): Generator<PriceNode> {
  yield node;
  if (node.kind === 'bundle') for (const c of node.children) yield* walk(c);
}

// Custom iterable class
class Range implements Iterable<number> {
  constructor(private start: number, private end: number) {}
  *[Symbol.iterator]() { for (let i = this.start; i < this.end; i++) yield i; }
}
```
Node 22+: `Iterator.prototype.map/filter/take` helpers; Node streams are async iterables (`for await (const chunk of fs.createReadStream(p))`).

**Test:** fake client returning 2 pages then empty; collect with `Array.fromAsync` (Node 22) or a loop; assert breaking early stops fetching.
**Pitfalls:** OFFSET pagination on large tables is slow and unstable — use keyset. Always handle `return()` (break) to release resources (`try/finally` inside generator).

---

## Mediator

**Intent:** Centralize interaction between components so they don't reference each other.
**Use when:** Order ↔ inventory ↔ shipping ↔ loyalty interplay; UI widget coordination; chat rooms.
**TS idiom:** Orchestrator with injected collaborators, or a typed event bus (see Observer).

```ts
type LifecycleEvent = 'paid' | 'shipped' | 'cancelled';

export class OrderLifecycle {
  constructor(private inv: Inventory, private ship: Shipping, private loyalty: Loyalty, private notify: Notifier) {}

  async on(event: LifecycleEvent, order: Order): Promise<void> {
    switch (event) {
      case 'paid':      await this.inv.commit(order); await this.ship.schedule(order); break;
      case 'shipped':   await Promise.all([this.loyalty.award(order), this.notify.shipped(order)]); break;
      case 'cancelled': await this.inv.release(order); if (order.shipmentId) await this.ship.cancel(order); break;
      default: assertNever(event);
    }
  }
}

// Components only know the mediator interface
export class ShippingService {
  constructor(private repo: OrderRepo, private mediator: Pick<OrderLifecycle, 'on'>) {}
  async markShipped(id: string) { const o = await this.repo.update(id, { status: 'shipped' }); await this.mediator.on('shipped', o); }
}
```
**Pitfalls:** God mediator — split per bounded context. If no coordination logic is needed, prefer pub/sub.

---

## Memento

**Intent:** Capture and restore state without exposing internals.
**Use when:** Undo, drafts, version history, wizard rollback, optimistic UI rollback.

```ts
export class Editor {
  #content = ''; #cursor = 0;
  type(text: string) { this.#content = this.#content.slice(0, this.#cursor) + text + this.#content.slice(this.#cursor); this.#cursor += text.length; }
  save(): EditorMemento { return Object.freeze({ content: this.#content, cursor: this.#cursor, at: Date.now() }) as EditorMemento; }
  restore(m: EditorMemento) { this.#content = m.content; this.#cursor = m.cursor; }
  get text() { return this.#content; }
}
declare const brand: unique symbol;
export type EditorMemento = Readonly<{ content: string; cursor: number; at: number }> & { readonly [brand]: 'EditorMemento' };

export class Caretaker {
  private stack: EditorMemento[] = [];
  constructor(private editor: Editor, private limit = 100) {}
  checkpoint() { this.stack.push(this.editor.save()); if (this.stack.length > this.limit) this.stack.shift(); }
  undo() { const m = this.stack.pop(); if (m) this.editor.restore(m); }
}
```
Persistent versions: store snapshots in a `document_versions` table (JSONB) or use event sourcing.
**Pitfalls:** Use `#private` fields so only the originator reads state; cap history size; never snapshot secrets.

---

## Observer

**Intent:** Notify subscribers of state changes.
**Use when:** Decoupled side effects (emails, analytics, cache invalidation, webhooks, search indexing).
**TS idiom:** A typed wrapper over `EventEmitter`; for cross-process use a broker (Redis Streams, Kafka, SNS) or an outbox table.

```ts
// src/shared/event-bus.ts
import { EventEmitter } from 'node:events';

export type DomainEvents = {
  'order.paid': { orderId: string };
  'user.signedUp': { userId: string; email: string };
};

export class EventBus<E extends Record<string, unknown>> {
  private ee = new EventEmitter({ captureRejections: true });
  constructor(private onError: (e: unknown, event: keyof E) => void = console.error) {}

  on<K extends keyof E & string>(event: K, listener: (payload: E[K]) => void | Promise<void>): () => void {
    const wrapped = async (p: E[K]) => { try { await listener(p); } catch (e) { this.onError(e, event); } };
    this.ee.on(event, wrapped);
    return () => this.ee.off(event, wrapped);
  }
  emit<K extends keyof E & string>(event: K, payload: E[K]): void { this.ee.emit(event, payload); }
}

// composition-root.ts
export const events = new EventBus<DomainEvents>((e, ev) => logger.error({ e, ev }, 'subscriber failed'));
events.on('order.paid', ({ orderId }) => emailQueue.add('receipt', { orderId }));
events.on('order.paid', ({ orderId }) => analytics.track('order_paid', { orderId }));
```
Reliability: if a side effect must not be lost, write an `outbox` row in the same DB transaction and publish from a worker.

**Test:**
```ts
it('notifies subscribers', async () => {
  const bus = new EventBus<DomainEvents>();
  const fn = vi.fn();
  bus.on('order.paid', fn);
  bus.emit('order.paid', { orderId: 'o1' });
  await vi.waitFor(() => expect(fn).toHaveBeenCalledWith({ orderId: 'o1' }));
});
```
**Pitfalls:** Async listeners on raw `EventEmitter` cause unhandled rejections — wrap them. Remove listeners to avoid leaks (`MaxListenersExceededWarning`). In-process events vanish on crash.

---

## State

**Intent:** Change behavior when internal state changes.
**Use when:** Order/subscription/KYC/ticket lifecycles with guards and per-state behavior.
**TS idiom:** Discriminated union per state (each state carries only its valid data) + a transition function; XState for complex/hierarchical machines.

```ts
// src/domain/orders/order-state.ts
export type OrderState =
  | { status: 'pending'; items: LineItem[] }
  | { status: 'paid'; items: LineItem[]; paymentId: string }
  | { status: 'shipped'; items: LineItem[]; paymentId: string; tracking: string; shippedAt: Date }
  | { status: 'cancelled'; items: LineItem[]; reason: string; refundId?: string | undefined };

export type OrderEvent =
  | { type: 'PAY'; paymentId: string }
  | { type: 'SHIP'; tracking: string }
  | { type: 'CANCEL'; reason: string; refundId?: string | undefined };

export class InvalidTransition extends Error {
  constructor(from: string, ev: string) { super(`Cannot ${ev} when ${from}`); }
}

export function transition(s: OrderState, e: OrderEvent): OrderState {
  switch (s.status) {
    case 'pending':
      if (e.type === 'PAY') return { status: 'paid', items: s.items, paymentId: e.paymentId };
      if (e.type === 'CANCEL') return { status: 'cancelled', items: s.items, reason: e.reason };
      break;
    case 'paid':
      if (e.type === 'SHIP') return { ...s, status: 'shipped', tracking: e.tracking, shippedAt: new Date() };
      if (e.type === 'CANCEL') return { status: 'cancelled', items: s.items, reason: e.reason, refundId: e.refundId };
      break;
    case 'shipped':
    case 'cancelled':
      break;
    default:
      return assertNever(s);
  }
  throw new InvalidTransition(s.status, e.type);
}

// Per-state behavior lives with the state
export const canEdit = (s: OrderState): s is Extract<OrderState, { status: 'pending' }> => s.status === 'pending';
```
Classic OO State (when states have rich behavior):
```ts
interface State { pay(ctx: OrderCtx): void; ship(ctx: OrderCtx): void }
class Pending implements State { pay(c: OrderCtx) { c.setState(new Paid()); } ship() { throw new InvalidTransition('pending', 'ship'); } }
class Paid implements State { pay() { throw new InvalidTransition('paid', 'pay'); } ship(c: OrderCtx) { c.setState(new Shipped()); } }
```
**Test:** `it.each` over a (state, event, expected) table, including invalid transitions.
**Pitfalls:** Persist `status` + state-specific columns; validate on load (e.g., with Zod) before trusting the union.

---

## Strategy

**Intent:** Interchangeable algorithms selected at runtime.
**Use when:** Pricing, shipping, ranking, export formats, retry/backoff policies, auth providers.
**TS idiom:** A function type. Use a class only if the strategy needs configuration/state.

```ts
export type ShippingStrategy = (order: Order) => number; // cents

export const flat: ShippingStrategy = () => 5_000;
export const byWeight = (perKgCents = 2_000): ShippingStrategy => (o) => Math.ceil(o.weightKg * perKgCents);
export const free: ShippingStrategy = () => 0;
export const express = (base: ShippingStrategy): ShippingStrategy => (o) => base(o) * 2;

const strategies = {
  flat,
  weight: byWeight(),
  express: express(byWeight()),
} satisfies Record<string, ShippingStrategy>;

export type ShippingMethod = keyof typeof strategies;

export function selectShipping(o: Order & { method: ShippingMethod }): ShippingStrategy {
  return o.totalCents >= 99_900 ? free : strategies[o.method];
}

export const shippingCents = (o: Order & { method: ShippingMethod }, pick = selectShipping) => pick(o)(o);
```
**Test:** `it.each(Object.entries(strategies))` contract: returns non-negative integer; separate tests for selection rules.
**Pitfalls:** Validate `method` from requests (Zod `z.enum(Object.keys(strategies))`) before indexing.

---

## Template Method

**Intent:** Fixed algorithm skeleton; subclasses (or callers) supply steps.
**Use when:** Importers/ETL, report generation, webhook processing — same flow, different steps.
**TS idiom:** Abstract class with `protected abstract` steps and optional hooks; or a function taking a step object (composition-friendly).

```ts
export interface ImportResult { imported: number; failed: Array<{ line: number; error: string }> }

export abstract class Importer<Raw, Attrs> {
  /** Template method — do not override. */
  async run(source: NodeJS.ReadableStream): Promise<ImportResult> {
    const result: ImportResult = { imported: 0, failed: [] };
    let line = 1;
    for await (const raw of this.rows(source)) {
      line++;
      try {
        const attrs = this.transform(raw);
        if (this.skip(attrs)) continue;
        await this.upsert(attrs);
        result.imported++;
      } catch (e) {
        result.failed.push({ line, error: e instanceof Error ? e.message : String(e) });
      }
    }
    await this.afterImport(result);
    return result;
  }
  protected abstract rows(source: NodeJS.ReadableStream): AsyncIterable<Raw>;
  protected abstract transform(raw: Raw): Attrs;
  protected abstract upsert(attrs: Attrs): Promise<void>;
  protected skip(_a: Attrs): boolean { return false; }            // hook
  protected async afterImport(_r: ImportResult): Promise<void> {}   // hook
}

import { parse } from 'csv-parse';
export class ProductCsvImporter extends Importer<Record<string, string>, NewProduct> {
  constructor(private repo: ProductRepo) { super(); }
  protected rows(src: NodeJS.ReadableStream) { return src.pipe(parse({ columns: true, trim: true })); }
  protected transform(r: Record<string, string>) {
    return { sku: r.SKU ?? '', name: r.Name ?? '', priceCents: Math.round(Number(r.Price) * 100) };
  }
  protected skip(a: NewProduct) { return a.sku === ''; }
  protected upsert(a: NewProduct) { return this.repo.upsertBySku(a); }
}
```
Functional variant:
```ts
export const runImport = <R, A>(steps: { rows: () => AsyncIterable<R>; transform: (r: R) => A; upsert: (a: A) => Promise<void> }) => { /* same skeleton */ };
```
**Test:** minimal concrete subclass in the test file to exercise the skeleton (skip, failures, hooks); fixture CSV via `Readable.from([...])`.
**Pitfalls:** Deep inheritance — prefer Strategy/composition when steps vary independently.

---

## Visitor

**Intent:** Add operations over a stable set of element types without changing them.
**Use when:** ASTs, document/export trees, rule engines, heterogeneous line items.
**TS idiom:** Discriminated union + a typed visitor object keyed by `kind` — compile-time exhaustiveness without double dispatch.

```ts
export type DocNode =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'image'; src: string; alt: string };

export type Visitor<R> = { [K in DocNode['kind']]: (node: Extract<DocNode, { kind: K }>) => R };

export const visit = <R>(node: DocNode, v: Visitor<R>): R =>
  (v[node.kind] as (n: DocNode) => R)(node);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const toHtml: Visitor<string> = {
  heading: (n) => `<h${n.level}>${esc(n.text)}</h${n.level}>`,
  paragraph: (n) => `<p>${esc(n.text)}</p>`,
  image: (n) => `<img src="${esc(n.src)}" alt="${esc(n.alt)}">`,
};

export const wordCount: Visitor<number> = {
  heading: (n) => n.text.split(/\s+/).length,
  paragraph: (n) => n.text.split(/\s+/).length,
  image: () => 0,
};

const doc: DocNode[] = [{ kind: 'heading', level: 1, text: 'Hello' }, { kind: 'paragraph', text: 'World of TS' }];
doc.map((n) => visit(n, toHtml)).join('');
doc.reduce((s, n) => s + visit(n, wordCount), 0); // 4
```
Adding a new `kind` makes every `Visitor<R>` fail to compile until handled — the main benefit.

Classic double dispatch (class hierarchies):
```ts
interface NodeVisitor<R> { visitHeading(h: Heading): R; visitParagraph(p: Paragraph): R }
abstract class Node { abstract accept<R>(v: NodeVisitor<R>): R }
class Heading extends Node { constructor(public text: string) { super(); } accept<R>(v: NodeVisitor<R>) { return v.visitHeading(this); } }
```
**Pitfalls:** If element types change often and operations are few, put methods on the elements instead.
