# Skills Packs Integration

The kit integrates three external **agent-skills packs** as first-class,
stack-scoped expertise sources for AI coding agents:

| Pack                 | Repository                                                                                    | Skills | Kit stacks served    |
| :------------------- | :-------------------------------------------------------------------------------------------- | -----: | :------------------- |
| `ruby-agent-skills`  | [shubhamtaywade82/ruby-agent-skills](https://github.com/shubhamtaywade82/ruby-agent-skills)   |    104 | `ruby-rails`, `ruby` |
| `node-agent-skills`  | [shubhamtaywade82/node-agent-skills](https://github.com/shubhamtaywade82/node-agent-skills)   |    322 | `node-typescript`    |
| `react-agent-skills` | [shubhamtaywade82/react-agent-skills](https://github.com/shubhamtaywade82/react-agent-skills) |    129 | `react-typescript`   |

Each pack follows the open Agent Skills format: a `skills/<name>/SKILL.md`
file with YAML frontmatter (`name`, `description`, `license`) plus optional
reference documents inside the skill directory. Skill counts above were
measured on 2026-11-25 and are recorded in the registry
(`packages/core/src/stacks/skills-pack.ts`).

## Design principles

1. **The kit never bundles pack content.** The registry stores metadata and
   mappings only; skills are fetched from their GitHub repositories at
   install time. Pack updates flow into projects on re-install.
2. **Runtime-independent core.** The registry lives in `packages/core` and
   imports nothing; the CLI (`packages/cli`) does the fetching. The
   architectural invariants (`scripts/check-architecture.ts`) hold unchanged.
3. **Deterministic recommendations.** Every workflow-stage mapping names
   concrete skills that were verified to exist in their pack; the kit never
   invents a skill name.
4. **Idempotent, fail-closed installs.** Existing skill directories are
   skipped unless `--force`; a failed clone writes nothing and exits 1; every
   install is recorded in `.ai-kit/skills-manifest.json` with the pack commit.

## CLI usage

```bash
# List the integrated packs
kit skills

# One pack: metadata + its workflow mapping
kit skills show ruby-agent-skills

# What serves a given kit stack
kit skills for-stack react-typescript

# Per-stage recommendations (machine-readable with --json)
kit skills recommend --stack node-typescript
kit skills recommend --stack node-typescript --stage tdd --json

# Install a pack into a project (default target: .claude/skills)
kit skills install ruby-agent-skills --dir ./my-rails-app

# Preview without cloning or writing
kit skills install node-agent-skills --dir . --dry-run

# Install from a local checkout (offline / pinned), pin a git ref, overwrite
kit skills install react-agent-skills --source ./react-agent-skills --dir .
kit skills install node-agent-skills --ref v1.2.0 --dir . --force
```

Installation copies every skill directory of the pack into
`<project>/.claude/skills/<skill>/` — the location Claude Code (and most
agent hosts) discover automatically — and records the installation in
`<project>/.ai-kit/skills-manifest.json`:

```json
{
  "schemaVersion": 1,
  "packs": {
    "react-agent-skills": {
      "repository": "shubhamtaywade82/react-agent-skills",
      "url": "https://github.com/shubhamtaywade82/react-agent-skills",
      "ref": "default-branch",
      "commit": "6707e6b5...",
      "into": ".claude/skills",
      "installedAt": "2026-11-23T05:41:12.000Z",
      "skills": [{ "name": "zod", "status": "installed" }]
    }
  }
}
```

`--into <dir>` changes the target directory for hosts that load skills from
somewhere else. Re-running `kit skills install` for the same pack refreshes
the manifest and skips already-present skills; pass `--force` to overwrite.

## Workflow mapping

`kit skills recommend` maps the kit's SDLC workflow stages to concrete pack
skills per stack. This is the bridge between the kit's state machines
(`docs/workflows/WORKFLOWS.md`) and the packs' expertise: before an agent
works a stage, it loads the recommended skills for that stage.

| Stage        | `ruby-rails` / `ruby`                            | `node-typescript`                                       | `react-typescript`                             |
| :----------- | :----------------------------------------------- | :------------------------------------------------------ | :--------------------------------------------- |
| requirements | `planning-interview`, `planning-wayfinder`       | `node-task-decomposition`                               | `frontend-risk-classification`                 |
| spec         | `planning-spec`                                  | `node-implementation-planning`                          | `agent-workflow`                               |
| plan         | `planning-tickets`                               | `node-change-impact-analysis`, `node-module-boundaries` | `frontend-architecture`, `frontend-monorepo`   |
| tdd          | `ruby-tdd-refactoring`, `rails-test-engineering` | `node-testing`, `node-test-isolation-engineering`       | `react-testing-engineering`, `testing-library` |
| verify       | `rails-test-engineering`, `rubocop`              | `node-native-test-runner`, `node-integration-testing`   | `frontend-test-reliability`, `vitest`          |
| review       | `ai-code-review`, `change-review`                | `node-code-review`, `node-review-feedback`              | `react-review`, `react-architecture`           |
| fix          | `ruby-debugging`                                 | `node-debugging`, `node-repository-forensics`           | `frontend-debugging`                           |
| refactor     | `ruby-clean-code`, `ruby-service-objects`        | `node-refactoring`, `node-legacy-modernization`         | `frontend-codemod-migration`, `react-compiler` |
| release      | `rails-release-engineering`                      | `node-release-engineering`, `node-npm-publishing`       | `frontend-production`, `github-pages`          |

Notes:

- The mapping complements, not replaces, the kit's verification gates:
  `kit feature ... red/green/refactor` still runs the stack's deterministic
  test/lint/typecheck commands from the M14 stack packs. The skills add the
  engineering judgment the commands cannot encode.
- `python` and `go` stacks have no published pack yet; `kit skills
  for-stack go` reports that explicitly instead of guessing.
- Agents that drive the kit through the host-driven protocol (ADR-0021) can
  read `kit skills recommend --stack <stack> --json` to decide what to load.

## Registry API (core)

The mapping is exported from `@agentic-sdlc-kit/core` for other hosts and the
adapter boundary:

```ts
import {
  listSkillsPacks, // SkillsPackSource[]
  resolveSkillsPack, // (id) => SkillsPackSource | undefined
  skillsPacksForStack, // (stackId) => SkillsPackSource[]
  defaultSkillsPackForStack, // (stackId) => SkillsPackSource | undefined
  recommendSkillsForStage, // (stackId, stage) => string[]
  recommendSkillsByStage, // (stackId) => Record<WorkflowStage, string[]>
  WORKFLOW_STAGES, // the 9 workflow stages
} from '@agentic-sdlc-kit/core';
```

## Provenance and licensing

All three packs are MIT-licensed and maintained in the
[shubhamtaywade82](https://github.com/shubhamtaywade82) GitHub account.
Individual skills may credit their own sources (for example, the ruby pack's
`planning-spec` adapts a skill from `mattpocock/skills`, MIT); each pack's
`SKILL.md` frontmatter and the pack README carry the details. Installing a
pack copies its files verbatim; the kit does not modify pack content.
