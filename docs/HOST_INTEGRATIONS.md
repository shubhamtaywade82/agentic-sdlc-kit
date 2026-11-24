# Host Tool Integration Guide

This guide details how to install, configure, and use the **Agentic SDLC Kit** across AI coding assistants and environments: **Claude Code**, **Cursor / Cursor CLI**, **Antigravity (AGY)**, and **CI/CD pipelines**.

---

## 1. Global CLI Setup (Prerequisite)

Before integrating with any host tool, install dependencies, build the packages, and link the `kit` CLI globally:

```bash
# In the agentic-sdlc-kit directory:
pnpm install --frozen-lockfile
pnpm run build
pnpm add -g ./packages/cli

# Verify installation
kit --version
kit doctor
```

---

## 2. Claude Code Integration

Claude Code is the primary supported host runtime with native runtime plugin (Mod) support.

### Step 1: Install Runtime Guard Plugins

Claude Code discovers plugins via `.claude-plugin/plugin.json` and `hooks/hooks.json`. To enable the 4 guard plugins for your repository:

```bash
# From your target project repository:
kit install --profile full-sdlc --stack node-typescript
```

This links `sdlc-guard`, `secret-guard`, `model-router`, and `run-observer` into
your project's `.claude/plugins/` directory. Each plugin's `hooks/hooks.json`
declares `./register.ts` — the TypeScript source, committed in the repository —
resolved relative to the `hooks/` directory exactly as the Claude Code plugin
validator resolves it. The installer validates that path before linking, so a
plugin is never installed in a broken state (an incomplete plugin directory
produces an explicit warning and links nothing).

The plugins are Claude Code Mods (Claude Code v2.1.287 or later; see https://code.claude.com/docs/en/plugins/mods). Each follows the Mods contract that `claude plugin validate` checks — and CI runs that validation on every push (`mods (claude plugin validate)` job in `.github/workflows/ci.yml`):

- Claude Code loads `.ts` hooks modules directly — no build step — so the
  linked plugins work straight from a fresh clone of the kit repository;
- the hooks module graph is self-contained: it imports its own files by
  relative path plus the `claude-code` bare import for types — no workspace
  packages, no `node:` builtins (the plugins vendor their policy types and
  the secret detector locally);
- `register` is exported as a top-level function declaration;
- `turn.step` (a streaming event) uses the `async function*` generator form
  delegating with `const result = yield* next(e)`;
- the event shapes match the real host: `tool.call` carries tool arguments
  as fields of the event, `tool.check` answers `{ decision, reason }`, and
  every gating registration chains `.catch` so an error is handled
  explicitly: safety hooks (`sdlc-guard`, `secret-guard`) refuse the action
  (fail closed), while routing and telemetry hooks (`model-router`,
  `run-observer`) fall back to pass-through so a non-safety bug never blocks
  the agent;
- every `$.state` reference uses `{ plugin, key }` literals and is named in
  the plugin's type contract (`contract.d.ts`, declared via the `types`
  field of `.claude-plugin/plugin.json`).

Or manually link the plugins in your project's `.claude/` directory:

```bash
mkdir -p .claude/plugins
ln -s /path/to/agentic-sdlc-kit/plugins/sdlc-guard .claude/plugins/sdlc-guard
ln -s /path/to/agentic-sdlc-kit/plugins/secret-guard .claude/plugins/secret-guard
ln -s /path/to/agentic-sdlc-kit/plugins/model-router .claude/plugins/model-router
ln -s /path/to/agentic-sdlc-kit/plugins/run-observer .claude/plugins/run-observer
```

(Manual links work from a fresh clone: the hooks modules are TypeScript
source loaded directly by Claude Code — nothing to build.)

### Step 2: How Claude Code Uses the Kit

- **Tool Interception**: When Claude Code attempts tool calls (e.g. bash commands or file writes), `sdlc-guard` stops destructive commands and `secret-guard` redacts API keys.
- **Available Slash Commands**: After running `kit host install claude-code` (see [One-time host setup](#one-time-host-setup-kit-host)), Claude Code has native slash commands for driving SDLC workflows:
  - `/kit-feature <TICKET-ID> <story text / acceptance criteria>`: Guides spec/plan authoring and loops the Red $\to$ Green $\to$ Refactor TDD cycle per task until verified.
  - `/kit-fix <BUG-ID> <expected vs actual behavior>`: Runs regression-first defect repair (failing assertion test first, minimal correction, then verification).
  - `/kit-resume <TICKET-ID>`: Resumes an existing run from its recorded phase.
- **Direct Prompting / Protocol**: Alternatively, in the Claude Code chat session, instruct Claude:
  ```text
  Drive the TDD feature workflow for FEATURE-001: run `kit feature FEATURE-001 start`,
  then loop `kit next --json` until requiredAction is run.completed,
  and finish with `kit journal FEATURE-001 --verify` and `kit verify`.
  ```

---

## 3. Cursor & Cursor CLI Integration

Cursor uses agent instructions, rules, and terminal commands to drive the SDLC engine.

### Step 1: Configure Agent Instructions and Rules

Initialize the repository with `kit`:

```bash
kit init .
```

This generates `.ai-kit/project.yml`. Ensure your project has an `AGENTS.md` (or `.cursor/rules/sdlc.mdc`) with the following prompt instruction:

```markdown
# Agent Instructions

Always follow disciplined SDLC practices using `kit`:

1. Check repository health: `kit doctor`
2. Validate specifications before coding: `kit validate-spec <spec-path>`
3. Validate implementation DAG: `kit validate-plan <plan-path>`
4. Run verification before claiming done: `kit verify`
```

### Step 2: Running Inside Cursor Composer / Agent

Cursor drives the kit through the **host-driven agent protocol**
(ADR-0021): one bounded, machine-readable entry point instead of prose
phase instructions. In Cursor's Agent or Composer prompt:

```
@SPEC.md @PLAN.md Drive this feature with the kit's agent protocol:
loop `kit next --json` until requiredAction is run.completed —
write the failing test / implement / refactor between phases,
then run the nextInvocation it reports. Declare yourself with
KIT_HOST=cursor (or --host cursor) so the execution journal
attributes your actions honestly.
```

The loop is deterministic and bounded — `kit next` reports the next
action, the task's own verification command, and the constraints; the
evidence gate (not the prompt) decides what advances. Finish with
`kit journal <feature-id> --verify` to check the tamper-evident
executed record, and `kit verify` for whole-profile verification
(tests, lints, builds — Cursor runs it in its terminal).

---

## 4. Antigravity (AGY) Integration

In Antigravity IDE and `agy` CLI, agents run bash commands and utilize skills to orchestrate development.

### Step 1: Create an AGY Skill

Create an Antigravity skill in `~/.gemini/skills/agentic-sdlc-kit/SKILL.md`:

```markdown
---
name: agentic-sdlc-kit
description: Use the Agentic SDLC Kit to inspect projects, run TDD feature workflows, fix bugs, and verify changes.
---

# Agentic SDLC Kit Skill

When working on features, bug fixes, or quality verification:

1. Initialize/inspect projects: `kit inspect .` / `kit init .`
2. For new features: `kit validate-spec <path>` then loop the host-driven
   agent protocol (ADR-0021): `kit next --json` → act (write test /
   implement / refactor) → run its `nextInvocation`, until
   `requiredAction` is `run.completed`. Set KIT_HOST=agy so the journal
   attributes actions honestly.
3. For bug fixes: `kit fix BUG-NNN <phase>`, the same evidence-gated engine as
   `kit feature` (the regression test must fail as an assertion first).
4. Before completing any turn with code changes, run: `kit verify`
5. After a run: `kit journal <feature-id> --verify` (tamper-evident record)
```

### Step 2: Autonomous Agent Workflows

Antigravity subagents can be tasked with:

```
Inspect this repository with `kit inspect .`, scaffold a new profile, and run `kit verify`.
```

---

## 5. CI/CD Integration (GitHub Actions)

Add deterministic verification as a required pull request status check:

```yaml
# .github/workflows/sdlc-verify.yml
name: SDLC Verification
on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 12.21.0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - name: Run Deterministic SDLC Verification
        run: pnpm exec kit verify
```

---

## 6. Summary of Host Capabilities

| Host Environment        | Configuration File            | Primary Interaction                     | Active Guards                                                |
| :---------------------- | :---------------------------- | :-------------------------------------- | :----------------------------------------------------------- |
| **Claude Code**         | `.claude/plugins/`            | CLI via Bash tool & Native Hooks        | `sdlc-guard`, `secret-guard`, `model-router`, `run-observer` |
| **Cursor / Cursor CLI** | `.cursor/rules/`, `AGENTS.md` | Terminal execution via Agent / Composer | Pre-commit / Terminal verification                           |
| **Antigravity (AGY)**   | `~/.gemini/skills/`           | Agent `run_command` tool calls          | Deterministic `kit verify` gating                            |
| **GitHub Actions**      | `.github/workflows/`          | Subprocess CI gate on PRs               | Blocks non-compliant PR merges                               |

Every host — regardless of tier — drives the same protocol:

```bash
kit next --json                     # the next action, bounded and machine-readable
kit journal <feature-id> --verify   # the tamper-evident executed record
```

Hosts without hook surfaces (Cursor, AGY, CI) are Tier C
(ADR-0021): the kit cannot intercept their tool calls, but the
evidence gate still refuses completion without a valid
Red → Green → Refactor chain. Parity is a tested claim — the Tier C
conformance suite (`packages/testing/src/conformance/tier-c.ts`)
defines the golden trace every host must reproduce.

---

## Zero-footprint setup

**Plugins at user scope.** The kit repo is a Claude Code marketplace
(`.claude-plugin/marketplace.json`):

```bash
claude plugin marketplace add <path-to-kit-clone>
claude plugin install sdlc-guard@agentic-sdlc-kit --scope user   # likewise secret-guard, model-router, run-observer
```

**Working paths without tracking.** `kit attach local|global|status|detach`
provisions `.ai-kit`, `.claude`, `docs/specifications`, `docs/plans` hidden via
`.git/info/exclude` and refuses to succeed unless git cannot see them.
`global` symlinks them into `$KIT_ATTACH_HOME` (default `~/.agentic-sdlc/projects`).

**Machinery elsewhere.** Set `KIT_STATE_DIR=/abs/path` to relocate run state,
the journal, and agent execution/orchestration records to
`$KIT_STATE_DIR/<repo>-<hash>/` (including the `state/` and `reports/` directories `kit init` creates). A relative value is rejected. `project.yml`,
specs and plans are not relocated (they are project-rooted evidence). Mode 1
(`kit feature <id> run`) still requires committed spec, plan and profile.

---

## One-time host setup (`kit host`)

Install the standing procedure once per host; per ticket you then type one line.

```bash
kit host list
kit host install claude-code      # ~/.claude/commands/kit-{feature,fix,resume}.md + user skill
kit host install all              # every host at its default scope (user where global, else project)
kit host install cursor --dir .   # .cursor/rules/sdlc.mdc (project scope)
```

Daily usage in Claude Code: `/kit-feature STORY-123 <ticket text and acceptance criteria>`.
Other hosts: `Implement STORY-123 per the kit protocol: <ticket>`.

Files you edited, or that the kit did not write, are never overwritten without `--force`.
Shared files (`AGENTS.md`, `GEMINI.md`, `CONVENTIONS.md`) only receive a replaceable managed
block. Blocking elicitation answers, `sdlc-guard` approvals and Mode 1's committed-artifact
requirement are unchanged: they stay with the human by design.

---

## Claude Code version baseline

| What | Version | Where |
| --- | --- | --- |
| Minimum for Mods | 2.1.287 | Mods docs; `plugins/*/.claude-plugin/plugin.json` |
| Engine declarations verified against | 2.1.329 | `plugins/*/.claude-plugin/types/claude-code/index.d.ts`, `packages/mod-sdk/src/types/events.ts` |
| CI validates with (`claude plugin validate`) | 2.1.319 | `.github/workflows/ci.yml` (`mods` and `live-agent` jobs) |

CI pins the newest release that is at least two weeks old. 2.1.329 was published
on 2026-11-19 and becomes eligible on 2026-12-03; until then CI validates on an
older release than the declarations were verified against. That gap is known and
intended, not an incompatibility. When bumping, change both CI pins and the
table together.
