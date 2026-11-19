---
name: repo-discovery
description: Understand an existing application before changing it — structure, conventions, dependencies, impact analysis. Use before proposing any change to a codebase you have not fully explored, when starting /kit:feature or /kit:init, or when asked "how does X work" about this repository.
license: MIT
---

# Repository Discovery

Never propose an abstraction for code you have not read. Discovery produces an
evidence-based picture of the app before a single design decision is made.

## Kick off

```bash
node .ai/kit/bin/kit.js inspect --json   # inventory: stack, tests, configs, docs state
node .ai/kit/bin/kit.js doctor           # environment gaps
```
Read `AGENTS.md` §1 (project context) and the installed stack pack at
`.ai/stack/<name>/AGENTS.md` if present.

## What to establish

1. **Architecture** — entry points, layering, boundaries, where logic lives and
   where it is supposed to live. Name the dominant style (modular monolith,
   layered, vertical slices) before judging it.
2. **Conventions** — naming, file placement, error handling, test style. The
   existing pattern wins over personal preference unless it is demonstrably broken.
3. **State** — `git status`, open branches, incomplete plans in `docs/plans/`
   (never overwrite another task's plan), pending ADRs in `docs/architecture/adr/`.
4. **Impact map** — for the change under consideration: the modules, services,
   migrations, docs, and tests it will touch, plus the existing behavior that
   could regress (callers of every signature you plan to change).

## Techniques

- Trace one request/story end-to-end through the stack; read the code, don't guess.
- For "who uses X": ripgrep the symbol, then read each hit's context.
- Run the test suite once, before changes, to know the baseline.
- Read `docs/specifications/` and recent CHANGELOG for intent, not just code.

## Output (report before designing)

- One-paragraph architecture summary with the dominant style named.
- Conventions worth following (with file examples).
- Impact map: files/modules affected, contracts that must be preserved.
- Risks: existing behavior that could break; areas with no test coverage.
- Open questions for the human.

## Rules

- Timebox exploration; report diminishing returns instead of reading forever.
- Distinguish observed fact ("auth lives in `app/lib/auth`") from inference
  ("appears unused — verify before deleting").
- Existing public contracts are preserved unless a change is required AND approved.
