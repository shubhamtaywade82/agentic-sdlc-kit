# Agentic SDLC Kit — `ai-dev-kit` v5.0.0

An opinionated, modular AI software development kit. Give it a new application
idea, a feature request for an existing repository, or a bug/refactoring item,
and it drives a controlled engineering lifecycle: **LLMs reason, deterministic
scripts verify, humans approve at the gates** — ending in working, tested,
reviewed, documented software, not plausible AI-generated code.

Built on the open standards: [Agent Skills](https://agentskills.io) ·
[Model Context Protocol](https://modelcontextprotocol.io) · the official
[Claude Code Mods API](https://code.claude.com/docs/en/plugins/mods/).

## Three installable components

| Component | What it is | Install |
|---|---|---|
| **sdlc-core** + **kit CLI** | 10-stage lifecycle, 3 execution modes, 6 commands, 9 skills, 4 agents, templates, checklists, MCP tools — plus the deterministic `kit` gates | default |
| **sdlc-runtime** | Four Claude Code mods: `sdlc-guard`, `model-router`, `secret-guard`, `run-observer` | `--runtime` (Claude Code ≥ 2.1.287) |
| **sdlc-stacks** | Stack packs with conventions, commands, and 22 GoF pattern implementations each | `--stack <name>` |

One version (5.0.0) across all components — see
[docs/architecture/system-design.md](docs/architecture/system-design.md) and
[components.json](components.json).

## Quick start

```bash
# install into your project (never overwrites existing files)
bash scripts/install.sh /path/to/project --stack node-ts-lib --runtime

# 1. create the project profile + engineering skeleton
node .ai/kit/bin/kit.js init          # or /kit:init in Claude Code

# 2. run a workflow
#    Claude Code:  /kit:feature "bulk CSV import with validation"
#    any assistant: follow .ai/workflows/00-overview.md

# 3. the gates (evidence, not vibes)
node .ai/kit/bin/kit.js validate-spec docs/specifications/features/<slug>.md
node .ai/kit/bin/kit.js validate-plan  docs/plans/<slug>.md
node .ai/kit/bin/kit.js verify         # -> .ai/reports/verification/*.json
node .ai/kit/bin/kit.js audit          # secrets + dependency advisories
node .ai/kit/bin/kit.js release-check

# uninstall removes exactly what the manifest recorded
bash scripts/uninstall.sh /path/to/project --dry-run
```

## The six commands (Claude Code)

| Command | Responsibility |
|---|---|
| `/kit:init` | Discover the project, create the profile and skeleton |
| `/kit:app` | Mode A — new application lifecycle (vertical-slice MVP) |
| `/kit:feature` | Mode B — complete feature in an existing app |
| `/kit:fix` | Mode C — bug fix (regression-test-first) or behavior-preserving refactor |
| `/kit:review` | Independent review: code, architecture, security agents |
| `/kit:release` | Release readiness + controlled, per-action-approved execution |

Nine skills load on demand (repo-discovery, requirements-engineering,
system-design, implementation-planning, tdd-bdd, design-pattern-selection,
code-quality, security-engineering, release-engineering); four read-only
agents (repository-analyst, architecture-reviewer, code-reviewer,
security-reviewer). Implementation stays with the primary agent.

## Gates are scripts, not vibes

`kit validate-spec` / `validate-plan` refuse malformed specs and cyclic plans;
`kit verify` runs your project's quality commands **strictly as argument
arrays with `shell:false`** and emits a machine-readable VerificationReport
(PASS / FAIL / SKIPPED / BLOCKED — a skipped check is never a passed check);
`kit audit` scans for secrets and dependency advisories; `kit release-check`
demands changelog, evidence, clean tree, and a free tag. Contract schemas:
[docs/architecture/contracts/](docs/architecture/contracts/).

## Runtime mods (optional)

`sdlc-guard` blocks force-pushes and pipe-to-shell, asks before
migrations/deploys, and guards protected paths — fail-closed. `model-router`
routes subagents by role (opt-in; never rewrites your pinned main model).
`secret-guard` refuses writes/commits carrying secrets (same canonical
patterns as `kit audit`). `run-observer` records tool/turn/agent telemetry
and adds `/kit:status`. Policy cores are pure TypeScript, unit-tested in CI;
mods run with your privileges and are NOT a sandbox —
[runtime/README.md](runtime/README.md).

## Stack packs

`--stack rails` · `--stack rails-ts` · `--stack nextjs` · `--stack node-ts-lib` —
each installs stack conventions (AGENTS.md), editor rules, and the pattern
library (creational / structural / behavioral / testing, idiomatic per
language) to `.ai/stack/<name>/patterns/`. Pattern *selection* (the five
questions, when/when-not, seven categories incl. resilience, data,
architecture) lives in the `design-pattern-selection` skill.

## Supported adapters (tested)

Claude Code · Cursor · Windsurf · GitHub Copilot · Gemini CLI / OpenCode.
The core is runtime-independent (plain Node 18+ and markdown contracts);
commands/skills/rules are mapped per adapter by the installer.

## What's new in v5

Three-component architecture, the `kit` CLI, runtime mods on the official
Mods API, six commands / nine skills / four agents, 10-stage lifecycle with
three modes, VerificationReport evidence, project profile, ADRs and
architecture contracts. Full list: [CHANGELOG.md](CHANGELOG.md); upgrading
from v4: [docs/migration-v4-to-v5.md](docs/migration-v4-to-v5.md).

## Repository layout

```
core/      workflows (10 stages, 3 modes) · commands/kit (6) · skills (9) ·
           agents (4) · prompts · templates · checklists · mcp/
cli/       kit CLI — TypeScript, zero runtime deps, committed dist/
runtime/   4 Claude Code mods (.claude-plugin/ + hooks/ + policies/ + tests/)
stacks/    rails · rails-ts · nextjs · node-ts-lib (AGENTS.md + patterns/)
scripts/   install.sh · uninstall.sh · check.sh
docs/      architecture/ (system design, contracts, ADRs) · migration guides
tests/     run-tests.sh (~250 assertions) · mcp-smoke.mjs
```

## Verification

`bash scripts/check.sh` runs: shell syntax + shellcheck, structure validation
(components, 6/9/4/4 inventory, mods fail-closed checks, Agent Skills spec),
the kit CLI build + 146-test suite, runtime hooks typecheck + 74 policy
tests, the installer regression suite, and the MCP smoke test. CI
(SHA-pinned actions, ubuntu + macos) runs the same gates.

## License

MIT — see [LICENSE](LICENSE).
