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
- An observer must never block: every handler wraps its work in try/catch
  (failures log a single notice) and `next(e)` always runs.

## Bounded state

Per RESEARCH.md §F (Mission Control reference): the store caps events per
run at `maxEventsPerRun` (default 10,000). When the cap is hit, the run is
marked `truncated: true` and further events are dropped. This prevents
unbounded memory growth in long sessions.

## Honest telemetry

Per post-M7 §7 (M13): "Missing telemetry is not misrepresented as zero."
If `turn.complete` does not expose `usage`, the event is marked
`partial: true` rather than recording `tokensIn: 0`.

## Redaction

Per M13 retention policy: summaries are redacted by default (absolute
paths replaced with `<path>`). The full redaction pipeline (path patterns,
secret values) lands with the M13 file-backed collector.

## CLI-first observability

Per post-M7 §7: start with CLI observability. The kit exposes:

- `kit runs` — list runs.
- `kit runs show RUN-001` — show a run's events.
- `kit runs report RUN-001` — full run report.
- `kit runs failed` — list failed runs.

A dashboard is a later interface, not a prerequisite for observability.

## Capability manifest

- hooks: `session.start`, `turn.start`, `turn.step`, `tool.call`, `turn.complete`
- apiAccess: `ui.log`, `ui.status`, `session.id`, `clock.now`, `state.get`, `state.set`
- learningAutonomyLevel: L0 (collect evidence only — feeds the M28
  ExperienceEpisode contract via the fast learning loop)
