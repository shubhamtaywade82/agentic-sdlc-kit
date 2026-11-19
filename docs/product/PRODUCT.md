# PRODUCT.md — Agentic SDLC Kit

Status: M0 frozen. Maintained as a living artifact; changes require an ADR or
an amendment record in `docs/roadmap/ROADMAP.md`.

## 1. Vision

The Agentic SDLC Kit is a **runtime-independent** development system that lets
an AI coding assistant take a feature, bug fix, refactor, or new application
from an ambiguous request to a verified, reviewable change — without giving up
the engineering discipline that a human team would apply.

The kit is not a single agent. It is the **scaffolding around an agent**: a
shared contract layer, deterministic verification, a workflow engine, and a
small set of independently installable plugins (skills, agents, commands,
Mods, stack packs). The runtime (Claude Code today, others later) is one
adapter among many possible adapters, never the owner of the product's
workflow logic.

## 2. Target users

| User                 | What they get from the kit                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Senior engineer      | An AI pair that respects existing conventions and never silently bypasses approvals.      |
| Platform / DX team   | A versioned, installable, uninstallable engineering kit they can ship to many repositories.|
| Engineering manager  | Evidence-based verification reports instead of "the AI said it works".                     |
| New joiner           | A discoverable map of the codebase's conventions and an enforced Definition of Done.       |
| Open-source maintainer | A reliable way to apply AI assistance to a real repository without abandoning standards. |

## 3. Primary use cases

1. **Incremental feature development on an existing repository.** The flagship
   workflow (`/kit:feature`). Drives the highest engineering value and is the
   M7 acceptance milestone.
2. **Greenfield application creation.** `/kit:app`. Builds a new application
   through vertical slices rather than a single pass.
3. **Bug fix.** `/kit:fix`. Reproduce → diagnose → regression test → smallest
   valid correction → verify.
4. **Refactor.** `/kit:refactor`. Behavior-preserving structural change with
   characterization tests.
5. **Repository onboarding.** `kit init` / `kit inspect` / `kit doctor`. Makes
   the kit understand the target repository before it changes anything.

## 4. Non-goals (M0 scope guard)

These are explicitly out of scope and must not be silently absorbed by later
milestones without an ADR:

- The kit is **not** an operating-system sandbox. Runtime Mods provide approval
  controls and policy evaluation; real isolation must come from OS permissions,
  containers, restricted credentials, and deployment controls. See
  `SECURITY.md` and ADR-0009.
- The kit is **not** a dashboard product. Observability starts as CLI reports
  (`kit runs`). A UI is a later interface, gated by M13.
- The kit is **not** a one-shot "generate the entire production application"
  tool. Vertical slices only. See ADR-0006.
- The kit is **not** a general-purpose AI agent. It is a structured SDLC system
  that uses an AI runtime as a tool.
- The kit does **not** claim compatibility it has not tested. Each runtime and
  each stack pack must be validated against a real fixture before being
  advertised.
- The kit does **not** ship "Mods first". Governance, routing, and
  observability (M10–M13) come **after** the core feature workflow (M7) is
  proven. See `ROADMAP.md` §25.
- The kit does **not** use an LLM to validate facts a deterministic program
  can verify. See `WORKFLOWS.md` §D.

## 5. Success criteria

The kit is successful when a team can answer **yes** to all of the following
after M7:

1. The kit inspected a real existing repository (Node.js full stack or Rails
   API) and produced a project profile without modifying application source.
2. A developer requested an incremental feature and received a validated
   specification, a dependency-aware plan, and a vertical-slice implementation
   with regression evidence.
3. The kit produced a verification report that distinguishes `passed`,
   `failed`, `skipped`, and `blocked` — and never counts a skipped check as
   passed.
4. Destructive operations required explicit approval. No approval was silently
   turned into a denial, and no denial was silently turned into an approval.
5. The change is reviewable: the diff, the test evidence, the affected files,
   and the regression report are all persisted under `docs/` and `.ai-kit/`.

## 6. Product shape

```
agentic-sdlc-kit/
├── packages/         # contracts, core, cli, testing, claude-code-adapter
├── plugins/          # Mods: sdlc-guard, secret-guard, router, observer (M10–M13)
├── stack-packs/      # Node, React, Rails, Python, Go (M14)
├── patterns/         # Language-independent GoF + resilience + data + testing patterns
├── fixtures/         # fixture-node-fullstack, fixture-rails-api, fixture-greenfield
├── docs/             # M0 artifact freeze lives here
├── scripts/          # Deterministic engineering scripts
└── examples/         # Worked examples of using the kit
```

The product is delivered as installable plugins via `kit install` (M15), not
as a single monolithic drop. Installation is idempotent, ownership-tracked,
and safely uninstallable.

## 7. Release posture

The roadmap defines release labels `0.1` through `1.x`. Only `0.1`
(M0 + M1) is in scope of this implementation package. Later releases are
planning labels, not published versions. See `ROADMAP.md` §24.
