# System Design — Agentic SDLC Kit (M0 architecture contract)

Version 5.0.0. This document is the architectural baseline; ADRs in `adr/`
record the decisions behind it.

## Product

An opinionated, modular AI software development kit that takes (a) a new
application idea, (b) a feature request for an existing repository, or (c) a
bug/refactoring item — and drives it through a controlled engineering
lifecycle to working, tested, reviewed, documented software. LLMs reason;
deterministic scripts verify; humans approve at the gates.

## Four layers (the boundary that matters)

| Layer | Contents | Where it lives | Consumes context |
|---|---|---|---|
| **1. Intelligence** | Skills · Agents · Commands · pattern knowledge | `core/` → installed `.claude/`, `.ai/` | On demand (skills load when the task matches) |
| **2. Engineering automation** | `kit` CLI · validators · verify runner · reports | `cli/` → installed `.ai/kit/` | Never (deterministic) |
| **3. Runtime governance** | Claude Code Mods · tool policies · routing · observability | `runtime/` → installed `.ai/mods/` | Per event (host loads it) |
| **4. Knowledge & state** | Specs · ADRs · plans · verification reports · profile | user repo `docs/`, `.ai/` | Committed artifacts |

A Skill is not a Mod is not a script. Skills decide WHAT work happens and HOW
it should be approached; scripts PROVE it happened; mods INTERCEPT execution
at runtime. The kit never blurs these: PRD generation, pattern advice,
planning, changelogs are NOT mods (mods run on every relevant event; knowledge
work belongs in on-demand layers). See `runtime/README.md`.

## Three installable components

| Component | Responsibility | Install |
|---|---|---|
| **sdlc-core** (with the `kit` CLI) | Workflows, 6 commands, 9 skills, 4 agents, templates, MCP tools, deterministic gates | Default |
| **sdlc-runtime** | 4 Claude Code mods: sdlc-guard, model-router, secret-guard, run-observer | Optional (`install.sh --runtime`) |
| **sdlc-stacks** | Stack packs: Rails, Rails+TS, Next.js, Node-TS-Lib — conventions, commands, 22 GoF patterns each | Selective (`--stack <name>`) |

One version (5.0.0), one compatibility policy (`versioning.md`), one
manifest-driven installer/uninstaller with the security guarantees in
`security-model.md`.

## Repository layout (this kit repo)

```
ai-dev-kit/
├── core/        commands/kit/ · skills/ (9) · agents/ (4) · workflows/ (10 stages,
│                3 modes) · prompts/ · templates/ · checklists/ · mcp/
├── cli/         TypeScript, zero runtime deps, committed dist/ → bin/kit.js
├── runtime/     4 mods (plugins): .claude-plugin/ + hooks/register.ts + policies/ + tests/
├── stacks/      rails · rails-ts · nextjs · node-ts-lib (each: AGENTS.md + patterns/)
├── scripts/     install.sh · uninstall.sh · check.sh
├── docs/        architecture/ (this file, contracts/, adr/) · migration guides
├── tests/       run-tests.sh — installer, structure, CLI, runtime, MCP regression
└── .github/     CI (SHA-pinned actions): shellcheck, regression, CLI, runtime, MCP
```

## The lifecycle engine

One 10-stage lifecycle (discovery → requirements → system design → planning →
development → verification → independent review → documentation → release →
operations), three execution modes:

- **Mode A — new app** (`/kit:app`): full lifecycle; MVP as vertical slices.
- **Mode B — existing-app feature** (`/kit:feature`): discovery-first; preserves
  public contracts; regression criteria are requirements.
- **Mode C — fix/refactor** (`/kit:fix`): reproduce → regression test → root
  cause → minimal fix / characterize → refactor → identical evidence.

Same validation engine, different acceptance criteria and safeguards per mode.

## Runtime independence

```
                    AGENTIC SDLC CORE  (workflows + kit CLI + contracts)
                            |
              +-------------+-------------+
              |                           |
        Runtime adapters            Distribution adapters
              |                           |
        Claude Code (mods)         install.sh → .ai/, .claude/
```

- The core (contracts, validators, verification, profile schema) has **zero
  Claude Code dependencies** — it runs on any host with Node 18+.
- Mods are the Claude Code adapter layer only; their policy cores
  (`runtime/*/policies/`) are pure TypeScript with no host imports and are
  unit-tested without Claude Code.
- Commands and skills are host presentation layers; the installer maps them
  per adapter (Claude Code, Cursor, Windsurf, Copilot, Gemini/OpenCode).
- Future hosts (other agent CLIs) adapt the same core without touching it.

## Key contracts

- `.ai/project.yml` — project profile: stack, quality gates (arg-array
  commands), policies (approvals, protected paths), mod config.
  Schema: `contracts/project-profile.md`.
- Verification report — machine-readable PASS/FAIL/SKIPPED/BLOCKED evidence.
  Schema: `contracts/verification-report.md`.
- Spec/plan document formats + validator rules: `contracts/plan-and-spec.md`.
- Secret pattern canon (shared by `kit audit` and `secret-guard`):
  `contracts/secret-patterns.md`.

## Quality gates → Definition of Done

`checklists/definition-of-done.md` (11 gates). The gates are enforced by
scripts where possible: `validate-spec`, `validate-plan`, `verify`, `audit`,
`release-check`. Evidence lives in `.ai/reports/`; the committed spec, plan,
tests, and verification report are the source of truth — runtime state is
supplementary.

## Milestone status (proposal roadmap)

- **M0** — this architecture contract: DONE (this document + contracts + ADRs).
- **M1** — core SDK: DONE (kit CLI, profile, installer, distribution).
- **M2** — feature workflow end-to-end: DONE (`/kit:feature` + validators +
  verification reports; agent review pending real-session validation).
- **M3** — new-application workflow: DONE (`/kit:app` + PRD/design templates +
  vertical-slice planning).
- **M4** — runtime governance: DONE (sdlc-guard, secret-guard + policy test
  harness; interactive validation in Claude Code pending real-session checks).
- **M5** — model router: policy core DONE (deterministic, opt-in); AI
  classifier deliberately deferred (rules first, AI fallback).
- **M6** — observability: event contracts + run-observer DONE (JSONL runs,
  /kit:status); dashboard deliberately deferred until contracts stabilize.
- **M7** — stack packs & distribution: 4 stacks + installer DONE; plugin
  marketplace publication is the remaining step (repo → marketplace metadata).
