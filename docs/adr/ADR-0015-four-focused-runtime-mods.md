# ADR-0015: Four focused runtime Mods; no Mod-per-task

Status: Accepted
Date: 2026-11-19
Milestone: M10–M13 (shipped 0.7.0)

## Context

RESEARCH.md §15 ("What I would explicitly avoid") and the post-M7 roadmap
§19 ("Risks") both warn against "30 independent Mods" and "one Skill per
tiny task." The Hamza reference repository has 31 Mods in its marketplace;
RESEARCH.md §6 explicitly says "I would not copy the entire repository."

The temptation is to ship a Mod for every interceptable event: a Mod for
prompt injection, a Mod for context compaction, a Mod for UI rendering, a
Mod for plugin governance, etc. This produces a noisy, hard-to-govern
ecosystem where each Mod has its own capability surface and trust model.

## Decision

Ship **four focused runtime Mods**, each covering one concern:

| Mod            | Concern                 | Primary events (RESEARCH.md §3)                             |
| -------------- | ----------------------- | ----------------------------------------------------------- |
| `sdlc-guard`   | Runtime governance      | `tool.call`, `tool.check`                                   |
| `secret-guard` | Secret protection       | `tool.call`, `fs.write`, `tool.call` (git ops)              |
| `model-router` | Model + effort routing  | `turn.step`, `agent.spawn`                                  |
| `run-observer` | Execution observability | `session.start`, `turn.start`, `tool.call`, `turn.complete` |

Each Mod:

- Has ONE `.claude-plugin/plugin.json`, ONE `hooks/hooks.json`, ONE
  `hooks/register.ts`.
- Splits its logic into `policies/` (pure functions, runtime-independent)
  and `hooks/` (the register function that wires policies to events).
- Has a `ModCapabilities` manifest declaring its hooks, API access, and
  filesystem/network/process permissions.
- Has tests using `MockRuntime` that exercise the policy logic without
  launching Claude Code.

What does NOT become a Mod (per RESEARCH.md §10):

- PRD generation, architecture documentation, design-pattern
  recommendations, test case generation, feature planning, changelog
  creation, API documentation, release notes. These belong in Skills,
  templates, and deterministic scripts.

## Alternatives considered

- **One Mod per concern from RESEARCH.md §3** (~12 Mods). Rejected: noisy,
  hard to govern, each with its own capability surface; RESEARCH.md §15
  explicitly warns against this.
- **One giant `sdlc-runtime` Mod containing everything.** Rejected:
  violates the separation of concerns; one Mod's failure takes down all
  runtime governance; can't selectively install.
- **Copy Hamza's 31-Mod marketplace.** Rejected: RESEARCH.md §6 explicitly
  says not to; the kit's value is a coherent opinionated system, not a
  bag of utilities.

## Consequences

- `plugins/sdlc-guard/`, `plugins/secret-guard/`, `plugins/model-router/`,
  `plugins/run-observer/` ship in 0.7.0.
- Each Mod is independently installable via `kit install` (M15).
- Each Mod's policy modules are pure functions in `policies/` that can be
  unit-tested without the SDK or the host.
- The `register.ts` in each Mod is thin: it wires events to policy
  functions and translates the verdict into a host decision.
- Future Mods (e.g., a context manager, a plugin governor) can be added
  later, but each new Mod requires an ADR justifying why it cannot be
  expressed as a Skill or a policy pack on an existing Mod.

## References

- RESEARCH.md §7 (Which Mods should you build first?)
- RESEARCH.md §10 (What must not become a Mod)
- RESEARCH.md §15 (What I would explicitly avoid)
- `plugins/sdlc-guard/`, `plugins/secret-guard/`, `plugins/model-router/`,
  `plugins/run-observer/`
- ADR-0014 (Mod SDK as runtime adapter)
- ADR-0011 (shared security contracts before Mods)
