# AGENTS.md — Instructions for AI Coding Agents

> Source of truth for all AI assistants working in this repository. Keep it short, accurate, current.

## 1. Project Context
- **Product:** Agentic SDLC Kit — runtime-independent SDLC system for AI coding assistants.
- **Stack:** Node.js >= 20.11.0 / TypeScript ~5.9 / pnpm 9.12.0 monorepo / Vitest 2.1.
- **Architecture:** Modular monorepo under `packages/`:
  - `packages/contracts`: shared types and zod schemas (depends on nothing).
  - `packages/core`: runtime-independent workflow engine, policies, profile generator, verification runner.
  - `packages/cli`: `kit` executable CLI commands (`--version`, `--help`, `doctor`).
  - `packages/claude-code-adapter`: adapter boundary separating host runtime from core.
  - `packages/testing`: shared fixtures, assertions, and contract validators.
- **Install:** `pnpm install --frozen-lockfile`
- **Build:** `pnpm run build`
- **Test:** `pnpm run test` (single package: `pnpm --filter <pkg> test`)
- **Lint/format:** `pnpm run lint` / `pnpm run format`
- **Verify:** `pnpm run verify` (runs architecture check, build, lint, typecheck, test)
- **Do not touch:** generated `dist/` directories, `pnpm-lock.yaml` (unless adding approved dependencies).

## 2. Architectural Invariants
Enforced by `scripts/check-architecture.ts` (fails build on violation):
1. `contracts` imports nothing.
2. `core` imports only from `contracts`.
3. `cli` imports from `core` and `contracts`.
4. `testing` imports from `contracts` and dev-only deps.
5. `claude-code-adapter` imports from `contracts`; host SDK imports are deferred to M10+.

## 3. Code Standards
- Functions <= 30 lines, files <= 300 lines, nesting <= 3 levels.
- Comments explain *why*, not *what*.
- KISS / YAGNI first: no speculative abstractions.
- All code must pass `pnpm run verify`.

## 4. Safety Boundaries — Explicit Human Approval Required
1. Push or merge to any branch or remote.
2. Tagging and releases.
3. Destructive git operations (force-push, history rewrite).
4. Publishing packages or modifying external infrastructure.
