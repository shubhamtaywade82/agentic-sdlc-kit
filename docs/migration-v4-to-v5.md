# Migration: v4 → v5

v5.0.0 is a major release (new architecture: three components, `kit` CLI
gates, runtime mods, reorganized docs taxonomy). This page maps everything
that moved.

## Recommended path

1. If v4 is installed in a project: `bash scripts/uninstall.sh <project>`
   (or `--dry-run` first). The v5 installer never overwrites existing files,
   so a v4 install would otherwise leave stale v4 artifacts next to v5 ones.
2. Install v5: `bash scripts/install.sh <project> [--stack <name>] [--runtime]`.
3. Create the profile: `node .ai/kit/bin/kit.js init` (was: nothing — v4 had
   no profile).
4. Move existing artifacts (below) — old directories are NOT auto-migrated;
   the new ones start with `.gitkeep` files you can delete.

## What moved

| v4 | v5 |
|---|---|
| `docs/prd/<slug>.md` | `docs/product/<slug>.md` |
| `docs/specs/<slug>.md` | `docs/specifications/technical/<slug>.md` (design docs) or `docs/specifications/features/<slug>.md` (feature specs, validated) |
| `docs/plans/<slug>.md` (TASK.md format) | same path, `PLAN.md` format (frontmatter + TASK-### + Depends/Acceptance/Verification) |
| `docs/adr/` | `docs/architecture/adr/` |
| `CHANGELOG.md` (project root, template) | `docs/releases/CHANGELOG.md` |
| — | `docs/testing/`, `docs/security/threat-models/` (new, optional) |

## Command mapping

| v4 | v5 |
|---|---|
| `/feature` | `/kit:feature` |
| `/plan`, `/tdd` | absorbed: planning → `/kit:feature` steps 2–4 + `implementation-planning`/`tdd-bdd` skills; the gates are plain commands (`kit validate-plan`, `kit verify`) |
| `/debug`, `/refactor` | `/kit:fix` (Mode C) |
| `/review` | `/kit:review` |
| `/ship` | `/kit:release` |
| — | `/kit:init` (new: profile + skeleton), `/kit:app` (new: greenfield Mode A) |

## Skills mapping

| v4 skill | v5 |
|---|---|
| sdlc-lifecycle | `workflows/00-overview.md` (lifecycle overview) |
| tdd-discipline | `tdd-bdd` |
| code-review | `code-quality` + `/kit:review` + `code-reviewer` agent |
| debug-protocol | `workflows/06-debug.md` |
| ruby-rails / typescript-node design patterns | stack packs: `.ai/stack/<name>/patterns/` (unchanged content, new home); selection knowledge: `design-pattern-selection` skill |

## Agents mapping

v4 planner/implementer/tester/debugger/reviewer/architect/security → v5
repository-analyst (analysis), architecture-reviewer, code-reviewer,
security-reviewer. Implementation is the primary agent's job (ADR-0003);
implementer/tester discipline lives in the `tdd-bdd` and `code-quality`
skills.

## New in v5 (no v4 equivalent)

- `kit` CLI: doctor, inspect, init, validate-spec, validate-plan, verify
  (VerificationReport), audit, changed, release-check, scaffold.
- Runtime mods (opt-in, `--runtime`): sdlc-guard, model-router, secret-guard,
  run-observer (Claude Code ≥ 2.1.287).
- `.ai/project.yml` profile; `.ai/reports/verification/` evidence;
  10-stage lifecycle with three modes; ADRs and architecture contracts in
  `docs/architecture/`.

## Unchanged

Installer security model (symlink checks, staged transforms, skip-if-exists,
manifest-driven uninstall), MCP server (tools unchanged; stage data updated),
the five supported adapters, MIT license, CI SHA pinning.
