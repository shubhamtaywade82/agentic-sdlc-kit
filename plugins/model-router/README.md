# model-router

Model + effort routing Mod for the Agentic SDLC Kit.

## What it does

- **`turn.step`** (a streaming event): classifies the current main-turn
  request (complexity × risk) and applies the routing policy to select
  model + effort. The hook is an async generator that delegates with
  `const result = yield* next(e)` and rewrites with
  `yield* next({ ...e, model, effort })` — returning `next(e)` without
  yielding would hand the host a generator object instead of the stream.
- **`agent.spawn`**: applies the routing policy to fresh subagent spawns.
  If the subagent already has an explicit model, preserves it; resumed
  runs (`e.resume`) are skipped entirely (the host ignores their changes).

## The complexity/risk distinction

Per RESEARCH.md §C and post-M7 §6: complexity and risk are SEPARATE
dimensions. The classifier never equates a simple task with a safe task.

| Task                               | Complexity | Risk     |
| ---------------------------------- | ---------- | -------- |
| Rename a small component           | Low        | Low      |
| Delete production records          | Low        | Critical |
| Design an authorization system     | High       | High     |
| Analyze a complex dependency graph | High       | Medium   |

## Suggest-only by default

The router starts in `suggestOnly: true` mode (per post-M7 §6). It logs
its recommendation but does not override the model. To apply routing,
set `state.model-router.policy.suggestOnly = false`.

## Explicit user selections are always preserved

If the user explicitly selects a model (via `--model` or the host's model
selector), the router NEVER overrides it. This is an invariant.

## The router is NOT a security authority

Per post-M7 §6: "The router cannot be the authority for security. A more
powerful model does not grant permission to perform a restricted action."
Critical-risk tasks go through the approval gate regardless of which model
is selected.

## Capability manifest

- hooks: `turn.step`, `agent.spawn`
- modifiesModels: true

## Reference

The Switchboard Mod (hamzafer/claude-code-mods) is the reference
implementation for subagent model routing. Our router extends it with
main-turn routing, effort selection, and verification-driven escalation.

## Install (user scope)

```
/plugin install model-router --marketplace shubhamtaywade82/agentic-sdlc-kit
```

Or from a local clone: `claude plugin marketplace add <clone-path>` then `claude plugin install model-router@agentic-sdlc-kit --scope user`.

## What the router classifies (and what it does not)

- **Subagent spawns** (`agent.spawn`) are classified from the text the event carries (`description`, `name`, `subagentType`) with deterministic whole-word signals (`policies/signals.ts`): destructive, production, security-sensitive, architecture-scale, and trivial. Only positive evidence changes the baseline; unrecognised text keeps it. A task is "low" only with a trivial keyword and no contrary signal. Each suggestion/application logs why (`because: destructive "drop", production "production"`).
- **The main turn** (`turn.step`) still uses the baseline: the event exposes the model and effort but no prompt text (`request` is untyped on the engine), so there is nothing honest to classify.
- Unchanged: suggest-only by default, an explicit model is always preserved, no LLM is called, and routing is advisory (fails open).
