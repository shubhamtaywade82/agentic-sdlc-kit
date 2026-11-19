# Lifecycle Overview

One lifecycle engine, three execution modes. LLMs reason; deterministic
scripts verify; humans approve at the gates.

## The lifecycle (10 stages)

```
01 Discovery ─► 02 Requirements ─► 03 System Design ─► 04 Implementation Planning
                                                            │
        ┌───────────────────────────────────────────────────┘
        ▼
05 Development (TDD) ─► 06 Verification ─► 07 Independent Review
        ▲                                              │
        └── 08 Documentation ◄── (fix loop: review → build) │
                                                           ▼
        09 Release & Deployment ─► 10 Operations & Feedback ─┐
                                                             │ feedback
        ◄────────────────────────────────────────────────────┘
```

| Stage | Produces | Lives in | Gate |
|---|---|---|---|
| 01 Discovery | Architecture & conventions report, impact map | session → `AGENTS.md` §1 | Human: "correct picture" |
| 02 Requirements | Feature spec / PRD with acceptance criteria | `docs/product/`, `docs/specifications/` | `kit validate-spec` green + human approval |
| 03 System design | ADRs, data model, API contracts, threat notes | `docs/architecture/` | Human approves design |
| 04 Planning | Dependency-aware vertical-slice task plan | `docs/plans/<slug>.md` | `kit validate-plan` green + human approval |
| 05 Development | Code + tests, one commit per task | git | TDD discipline (skill `tdd-bdd`) |
| 06 Verification | Machine-readable verification report | `.ai/reports/verification/` | `kit verify` status: passed |
| 07 Independent review | Findings table + verdict | PR | No Blockers; Majors fixed or waived |
| 08 Documentation | API/setup/architecture docs, changelog | `docs/` | Docs updated in the same PR |
| 09 Release | Tag, release notes, deploy | `docs/releases/` | `kit release-check` + per-action human approval |
| 10 Operations | Observability notes, postmortems, feedback | `docs/` | — |

## Three execution modes

**Mode A — New application** (`/kit:app`): full lifecycle; MVP built as
complete vertical slices (auth → core resource → integrations), each slice
leaving the app working. Never one giant implementation cycle.

**Mode B — Feature in an existing app** (`/kit:feature`): the highest-value
workflow. Starts with discovery (skill `repo-discovery`); preserves public
contracts; includes regression criteria for existing behavior; verifies the
actual git diff before claiming done.

**Mode C — Bug fix & refactoring** (`/kit:fix`): different safeguards.
Fix = reproduce → failing regression test → root cause → minimal fix → verify.
Refactor = characterize behavior with tests → structural-only changes →
identical verification evidence before/after.

Shared rules across modes: inspect before abstracting; reuse existing
services/conventions; never overwrite another task's incomplete plan;
backward-compatible migrations; a skipped test is never a passed test.

## Gates are scripts, not vibes

| Gate | Command | Refuses to proceed when |
|---|---|---|
| Spec structure | `node .ai/kit/bin/kit.js validate-spec <file>` | sections/criteria missing |
| Plan integrity | `node .ai/kit/bin/kit.js validate-plan <file>` | cycles, dangling deps, missing verification |
| Quality | `node .ai/kit/bin/kit.js verify` | any check fails (report: PASS/FAIL/SKIPPED/BLOCKED) |
| Security | `node .ai/kit/bin/kit.js audit` | secrets or critical/high advisories |
| Release readiness | `node .ai/kit/bin/kit.js release-check` | changelog/version/evidence/tag/tree checks fail |

Reports land in `.ai/reports/`. Evidence, not claims.

## Entry points

- `/kit:init` — set up the project profile (`kit init`) and skeleton.
- `/kit:app` — Mode A · `/kit:feature` — Mode B · `/kit:fix` — Mode C
- `/kit:review` — independent review (four agents)
- `/kit:release` — release readiness + controlled execution

Stack-specific knowledge (conventions, test commands, patterns):
`.ai/stack/<name>/`. Profile: `.ai/project.yml` (gates, policies, stack).

## Where things live

- **Stage guides** (this directory): `01`…`09` below.
- **Stage prompts**: `prompts/` · **Templates**: `templates/` · **Checklists**: `checklists/`
- **Skills** (auto-load by task): `.claude/skills/` (agentskills.io format)
- **MCP tools**: `.ai/mcp/` (modelcontextprotocol.io)
- **Runtime governance (optional)**: `.ai/mods/` — Claude Code mods; see `.ai/mods/README.md`

Release rule: merge, tag, release publication, and deploy each need explicit
human approval — `AGENTS.md` §6, `08-release.md`, `/kit:release`.
