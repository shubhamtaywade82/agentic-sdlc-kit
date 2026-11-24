# run-observer

Execution observability Mod for the Agentic SDLC Kit.

## What it does

Collects runtime events into a bounded trace store and exposes them via
`$.state.run-observer.store` so the `kit runs` CLI command can read them.

Events observed:

- `session.start` — session initialization (session id from `$.session.id()`).
- `turn.start` — turn begins (`e.turnId` sets the current run id).
- `turn.step` — one model request (streaming event, observed via
  `const result = yield* next(e)`); records the model that answered and
  its token usage from the result.
- `tool.call` — tool invocation (records tool name, duration from
  `$.clock.now()`, and whether the call was ok; observes the result by
  calling next first).
- `turn.complete` — turn ends (`e.answer` / `e.durationMs` / `e.usage` /
  `e.isAborted` / `e.agentId`; marks `partial: true` if usage is missing).
- Timestamps come from `$.clock.now()` — never a fabricated or frozen
  clock value.
- An observer must never block: observation work and state publication are
  wrapped in a best-effort boundary, and `next(e)` still runs if either fails.

## Bounded state

The store caps events per run at `maxEventsPerRun` (default 10,000). When the
cap is hit, the run is marked `truncated: true` and further events are dropped.
It also retains at most 100 runs; when a new run arrives at capacity, the
oldest retained run is evicted. This bounds memory across long sessions as
well as within an individual run. The limit is currently an in-memory policy,
not durable retention.

## Honest telemetry

Per post-M7 §7 (M13): "Missing telemetry is not misrepresented as zero."
If `turn.complete` does not expose `usage`, the event is marked
`partial: true` rather than recording `tokensIn: 0`.

## Redaction

Per M13 retention policy: summaries are redacted by default (absolute
paths replaced with `<path>`). The full redaction pipeline (path patterns,
secret values) lands with the M13 file-backed collector.

## CLI-first observability

The store is published at `$.state.run-observer.store` for a future
`kit runs` command (list / show / report / failed). That command does not
exist yet, and the store is in-memory only: nothing survives the session.

## Capability manifest

- hooks: `session.start`, `turn.start`, `turn.step`, `tool.call`, `turn.complete`
- apiAccess: `ui.log`, `ui.status`, `session.id`, `clock.now`, `state.get`, `state.set`
- learningAutonomyLevel: L0 (collect evidence only — feeds the M28
  ExperienceEpisode contract via the fast learning loop)

## Install (user scope)

```
/plugin install run-observer --marketplace shubhamtaywade82/agentic-sdlc-kit
```

Or from a local clone: `claude plugin marketplace add <clone-path>` then `claude plugin install run-observer@agentic-sdlc-kit --scope user`.
