# run-observer

Execution telemetry for the Agentic SDLC Kit (Claude Code mod, P1 —
deliberately lean). Observe-only: **a broken observer must be invisible**.

- Every hook is a pass-through. There are intentionally **no `.catch` chains**
  — nothing here may deny or block an action.
- All observe work is wrapped in `try/catch` that swallows and logs once.
- Lifecycle failures (e.g. slash-command registration on an older Claude Code)
  degrade silently.

| Hook | Records |
| --- | --- |
| `session.start` | Registers `/kit:status`, resets per-session state, reads the profile (also fires on reload) |
| `tool.call` | `{tool, ok, ms}` — duration and outcome (deny/isError count as not-ok) |
| `turn.start` | `{turnId}` |
| `turn.step` (async generator, observe) | `{model, agentId, inputTokens, outputTokens}` from the answering result |
| `turn.complete` | `{durationMs, inputTokens, outputTokens, isAborted, agentId}` + status line `kit: <n> tools · <m> turns` (tools = tool-call records, turns = turn-start records) |
| `agent.spawn` | `{name, model, isTeammate}` |
| `command.run` `{command:'kit:status'}` | Prints the session summary (Claude reads it) |

`/kit:status` output (`summarize()` → string): session duration, tool-call
count + slowest 3, turns, model requests and models seen, tokens from the
last turn, subagent spawns with models. Token fields are read tolerantly
(`input_tokens` / `inputTokens` / `prompt_tokens`, and the output
equivalents).

## Persistence

Records live in memory and are best-effort persisted as JSONL to
`.ai/reports/runs/<sessionId>.jsonl` (one `{ts, kind, fields}` object per
line). **Caveat:** persistence is a read-modify-write, NOT atomic — concurrent
sessions writing the same file or a crash mid-write can lose lines. Accepted
for v1: the data is diagnostic, not authoritative. Flushes are coarse
(session/turn boundaries) so per-tool-call IO never sits on the hot path.

In-memory state is module-level and reset at each `session.start` (which also
fires on reload) — reloads start a fresh report file per session id.

## Config keys read (`.ai/project.yml`)

```yaml
version: 1
observer:
  enabled: true    # default when absent/unparsable
```

`observer.enabled: false`: `register()` is synchronous while the profile read
is async, so the hooks are registered unconditionally but every one becomes a
no-op pass-through once `session.start` has read the profile (session.start
fires before the first prompt, so nothing is ever observed), and
`/kit:status` is never registered. Reload the session to pick up changes.

## Tests

- `claude plugin test` in this directory (observer must not block tools).
- Policy tests: `npm test` in `runtime/` — record constructors, JSONL
  round-trip, `summarizeStats` structure + `summarize` text.

## Roadmap

Dashboard UI only AFTER the event-data and execution-state contracts
stabilize (per the architecture proposal — do not build the dashboard first).
