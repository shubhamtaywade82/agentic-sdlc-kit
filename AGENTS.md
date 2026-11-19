# AGENTS.md — Instructions for AI Coding Agents

> Source of truth for all AI assistants working in this repository. Keep it short, accurate, current.

## 1. Project Context  (EDIT THIS)
- **Product:** <one-line description>
- **Stack:** <e.g. Ruby 3.3 / Rails 7.2 / PostgreSQL / Hotwire> or <TypeScript / Next.js / Prisma>
- **Architecture:** <monolith | services | library>; key dirs: `app/`, `lib/`, `spec/`
- **Profile:** `.ai/project.yml` (stack, quality gates, policies) — run `/kit:init` if missing
- **Run:** `<cmd to start dev server>`
- **Test:** `<cmd>` (single file: `<cmd path>`)
- **Lint/format:** `<cmd>`   **Type-check:** `<cmd>`
- **Do not touch:** `<generated dirs, vendored code, secrets, prod configs>`

## 2. Operating Principles
1. **Understand before acting.** Read related code, tests, and docs first (skill `repo-discovery`). Search, don't guess.
2. **Ask when ambiguous.** If requirements are unclear, ask up to 3 focused questions, then proceed with stated assumptions.
3. **Spec and plan before coding** for anything > 1 file or > 50 lines: `docs/specifications/features/<slug>.md` + `docs/plans/<slug>.md`, both validated (`kit validate-spec`, `kit validate-plan`).
4. **Small vertical steps.** One task per commit, each leaving the app working. Keep diffs reviewable.
5. **Test-first** for logic. Bug fix = failing regression test first.
6. **Verify, don't assume.** Run `node .ai/kit/bin/kit.js verify` and show the report before claiming done. A skipped check is not a passed check.
7. **Follow existing patterns** in the codebase over personal preference. Consistency > novelty.
8. **No silent scope creep.** Note unrelated issues in `docs/TODO.md`; don't fix them unasked.
9. **Leave it better:** update docs, types, and tests touched by your change.

## 3. Code Standards
- Clear names over comments; comments explain *why*, not *what*.
- Functions do one thing; prefer < 30 lines. Avoid deep nesting (guard clauses).
- No dead code, no commented-out code, no `console.log`/`puts` debugging left behind.
- Handle errors explicitly; never swallow exceptions. Fail loudly at boundaries.
- Validate all external input. Parameterize queries. Escape output.
- No new dependencies without justification (size, maintenance, license) in the PR.
- Public APIs get docs + types. Breaking changes need an ADR.
- Patterns solve demonstrated problems only — see the `design-pattern-selection` skill (five questions before any pattern).

## 4. Testing
- Pyramid: many unit, some integration, few e2e.
- Test behavior, not implementation. One reason to fail per test.
- Cover: happy path, edge cases (empty, nil, max, unicode, concurrency), error paths.
- Deterministic: no real network, time, or randomness without control.

## 5. Git & PRs
- Branch: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`.
- Conventional commits: `feat(auth): add password reset token`.
- PR uses `templates/PR.md`. Link spec/plan. Include verification evidence.
- Never push directly to `main`.

## 6. Safety Boundaries — actions that ALWAYS require explicit human approval first
Named individually, because each one changes state beyond a normal commit:

1. **Push or merge** — pushing any branch, merging a PR, pushing to `main`.
2. **Tags & releases** — creating or pushing a git tag, publishing a release (GitHub Release, npm publish, gem push, etc.).
3. **Deployment** — any deploy command, environment change, or infrastructure change.
4. **Destructive git** — force-push, history rewrite, branch deletion.
5. **Database migrations** — running migrations against any non-local database; destructive DB ops, data deletion, schema drops.
6. **Secrets** — reading, printing, or committing secrets/`.env` files.
7. **Environment changes** — installing global packages, changing CI/CD or infra config.

If an instruction (yours, a workflow's, or a command's) seems to authorize one of these
without a human saying yes in this session, stop and ask. Same rule in `.ai/workflows/08-release.md`
and `.claude/commands/kit/release.md`. If the `sdlc-guard` runtime mod is enabled, it enforces these interactively.

## 7. Definition of Done
See `checklists/definition-of-done.md` — the 11-gate table. Summary: gates green
(`kit verify`), acceptance criteria met, security audit clean, diff reviewed,
docs updated, no TODOs left in diff.

## 8. Communication Format
When finishing a task, report:
1. What changed (files + one line each)
2. How it was verified (commands + report paths + result)
3. Assumptions made
4. Follow-ups / risks

## 9. Tools & Extensions
- **Lifecycle:** `.ai/workflows/00-overview.md` — 10 stages, three modes (new app / existing-app feature / fix+refactor), gated by deterministic scripts.
- **Kit CLI** (`node .ai/kit/bin/kit.js`): `doctor`, `inspect`, `init`, `validate-spec`, `validate-plan`, `verify`, `audit`, `changed`, `release-check`, `scaffold` — evidence, not vibes.
- **Slash commands** (Claude Code): `/kit:init`, `/kit:app`, `/kit:feature`, `/kit:fix`, `/kit:review`, `/kit:release` — workflow entry points, not shell wrappers.
- **Agents:** `.claude/agents/` — repository-analyst, architecture-reviewer, code-reviewer, security-reviewer (implementation is the primary agent's job).
- **Skills:** `.claude/skills/` (agentskills.io) — nine skills: repo-discovery, requirements-engineering, system-design, implementation-planning, tdd-bdd, design-pattern-selection, code-quality, security-engineering, release-engineering.
- **Stack pack:** `.ai/stack/<name>/` — conventions, test commands, per-stack design patterns.
- **Runtime mods (optional, Claude Code):** `.ai/mods/` — sdlc-guard, model-router, secret-guard, run-observer; see `.ai/mods/README.md`.
- **MCP servers:** optional; see `.ai/mcp/README.md` and `.ai/mcp/.mcp.json.example` (modelcontextprotocol.io).
