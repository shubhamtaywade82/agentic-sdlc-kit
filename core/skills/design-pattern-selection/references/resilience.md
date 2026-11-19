# Resilience Patterns

For calls to anything you don't fully control: other services, queues, SaaS
APIs, the filesystem of a busy host. Each entry: Problem / When / When NOT /
Trade-offs / Testing / Anti-patterns. These are stack-agnostic; idiomatic
implementations live in the stack pack where applicable.

## Timeout

- **Problem** — a slow dependency converts latency into outages (thread/worker
  pools exhaust, requests pile up).
- **When** — every outbound call. Non-negotiable. Default shorter than your
  own request budget.
- **When NOT** — does not apply: long-poll/SSE by design (then the timeout is
  the protocol, set it explicitly).
- **Trade-offs** — too tight = false failures; must pair with retry/circuit
  policy or you just fail faster.
- **Testing** — dependency that sleeps past the budget → op fails within
  budget + duration asserted.
- **Anti-patterns** — global "no timeout" defaults; timeout set but the
  client ignores it.

## Retry with backoff

- **Problem** — transient faults (network blips, 503, throttling) fail
  otherwise-healthy operations.
- **When** — operation is idempotent OR carries an idempotency key; the
  failure mode is provably transient.
- **When NOT** — non-idempotent side effects without dedup; the failure is a
  bug (retrying multiplies damage); the caller already retries (stacked
  retries = retry storm).
- **Trade-offs** — tail latency grows; retries amplify load during partial
  outage (cap attempts, jitter the backoff).
- **Testing** — flaky dependency (fails N times then succeeds) → succeeds
  after bounded attempts; assert attempt count and that permanent failure
  stops early.
- **Anti-patterns** — infinite retry; retrying 4xx; zero jitter in a fleet.

## Circuit Breaker

- **Problem** — retrying into a dead dependency turns its outage into yours.
- **When** — dependency outages are possible and calling anyway wastes
  capacity; you have a fallback (cached value, degraded mode, fail fast).
- **When NOT** — in-process function calls; no meaningful fallback (a breaker
  that only rethrows is a delay with extra steps).
- **Trade-offs** — state to manage (closed/open/half-open), thresholds to
  tune; can mask partial outages from ops (emit metrics!).
- **Testing** — failure threshold opens the circuit (subsequent calls skip
  the dependency); recovery window probes with half-open.
- **Anti-patterns** — per-instance breakers for a shared dependency fleet-wide
  outage; breaker without observability; breaker thresholds nobody can
  explain.

## Bulkhead

- **Problem** — one slow workload consumes all capacity, starving the others.
- **When** — pools serve distinct workloads with different criticality
  (checkout vs. reporting); isolation beats utilization.
- **When NOT** — single workload; capacity is elastic and cheap.
- **Trade-offs** — lower utilization (headroom is the product you're buying);
  pool sizing is an ongoing tuning task.
- **Testing** — saturate pool A; assert pool B's latency/availability
  unaffected.
- **Anti-patterns** — one giant pool "for efficiency"; bulkheads with shared
  downstream (the DB is the real bulkhead boundary — mind it).

## Idempotency keys

- **Problem** — at-least-once delivery + retries duplicate side effects
  (double charge, double send).
- **When** — any operation with external side effects that may be retried by
  you, a queue, or the user's refresh button.
- **When NOT** — read-only ops; naturally idempotent ops (absolute put).
- **Trade-offs** — key storage + TTL policy; response caching so the retry
  sees the first outcome, not a re-execution.
- **Testing** — same key twice → one effect, both calls get the stored
  response; concurrent same-key calls → exactly one execution.
- **Anti-patterns** — "idempotent-ish" (key checked after the effect); keys
  derived from mutable data; no TTL cleanup.

## Outbox

- **Problem** — "write to DB and publish an event" is two systems; one can
  fail after the other → lost events or ghost events.
- **When** — event publication must be as reliable as the DB write
  (integrations, projections, notifications).
- **When NOT** — best-effort events are genuinely fine (logs, metrics); no
  event-driven consumers exist.
- **Trade-offs** — outbox table + relay/poller; consumers see events late
  (eventual consistency); ordering per aggregate only.
- **Testing** — transaction rolls back → NO event emitted; commit + relay
  crash mid-publish → exactly-once downstream effect (with idempotency keys).
- **Anti-patterns** — publishing inside the transaction via triggers nobody
  knows about; outbox without consumer idempotency (relay retries will
  duplicate).

## Selection order (rules of thumb)

1. Timeout first — it bounds everything else.
2. Retry (bounded, jittered, idempotent) for provably transient faults.
3. Circuit breaker when the dependency's outage mode matters.
4. Bulkhead when workloads share a bounded pool.
5. Idempotency keys the moment retries or queues exist.
6. Outbox when an event must be as durable as a row.
