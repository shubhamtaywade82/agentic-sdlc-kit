# model-router

Model/effort routing for the Agentic SDLC Kit (Claude Code mod).

**DEFAULT OFF.** The router activates only when `router.enabled: true` **or**
`router.agents` is non-empty in `.ai/project.yml`. With no profile (or an
unparsable one) it is completely pass-through — zero behavior, zero log noise.

| Hook | Behavior |
| --- | --- |
| `agent.spawn` | Applies explicit `router.agents[name]` model mappings. Resumed runs are skipped (the runtime ignores changes for them). Keyword-tier decisions set effort recommendations only — the engine's default model stands. |
| `turn.step` (async generator) | Pins the MAIN conversation model only when `router.main.model` is explicitly configured and differs from the model about to be used. Subagent model requests are never rewritten here (their model is chosen at spawn). Otherwise pure observe. |

Errors degrade to pass-through — routing is not a gating hook.

## Routing policy (from the architecture proposal)

Complexity and risk are **two different dimensions**: a simple database
deletion is low complexity but high consequence; a complex documentation
analysis may be high complexity but low operational risk. This mod routes on
the *reasoning load* of the task; irreversible-operation risk belongs to
sdlc-guard's approval rules, not to model selection.

| Task classification | Initial model | Effort | Verification |
| --- | --- | --- | --- |
| Simple lookup | Fast | Low | Structural |
| Routine coding | Balanced | Medium | Tests |
| Architecture | Reasoning | High | Independent review |
| Security-sensitive | Strongest suitable | High | Mandatory security checks |
| Irreversible operation | Policy-controlled | High | Approval + verification |

Deterministic rules first: explicit config beats the keyword heuristic, and an
AI classifier (`$.model.classify`) is a **deliberate future extension, not
enabled in v1** — routing decisions must be explainable from configuration and
agent names alone.

Keyword heuristic on the agent name (most specific first):

| Name contains | Tier | Effort |
| --- | --- | --- |
| `reviewer` `security` `architect` `review` | reasoning | high |
| `analyst` `discovery` `explor` | balanced | medium |
| `lint` `format` `summar` `index` | fast | low |
| anything else | not touched (`null`) | — |

## Pinned-model preservation

The main conversation model is NEVER rewritten unless `router.main.model` is
explicitly configured. A model the developer selected interactively is left
alone. `model: inherit` in an agent mapping means "keep the engine default".
The main-model pin — like every router behavior — only applies while the
router is active (`router.enabled: true` or any `router.agents` entry);
otherwise the mod is fully pass-through.

## Config keys read (`.ai/project.yml`)

Suggested mapping for the kit's four agents (copy-paste; use the model
identifiers available in your environment):

```yaml
version: 1
router:
  enabled: true
  main:
    model: claude-sonnet-4-5        # optional; pins the MAIN conversation only
  agents:
    repository-analyst:
      model: claude-haiku-4-5
      effort: medium
    architecture-reviewer:
      model: claude-opus-4-6
      effort: high
    code-reviewer:
      model: claude-sonnet-4-5
      effort: high
    security-reviewer:
      model: claude-opus-4-6
      effort: high
```

The profile is read once per plugin load (lazily, on the first hook call — no
session.start registration needed); reload the session to pick up changes.
Unknown keys are ignored; invalid values (e.g. `effort: turbo`) fail safe to
"router off".

## Tests

- `claude plugin test` in this directory (router must be invisible to tools).
- Policy tests: `npm test` in `runtime/` (routeAgent tiers, explicit overrides,
  inherit, routeMain pinning, profile parsing).
