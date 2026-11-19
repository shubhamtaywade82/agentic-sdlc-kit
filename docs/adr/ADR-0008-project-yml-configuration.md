# ADR-0008: `.ai-kit/project.yml` as project configuration

Status: Accepted
Date: 2026-11-19
Milestone: M0 (frozen), schema declared in M1-07, generated in M2

## Context

The kit needs a per-repository configuration file that records: the
project's name, detected stacks, and the commands to run for test, lint,
typecheck, and build. This file is consumed by `kit verify` (M6), by
`/kit:feature` (M7), and by every Mod that needs to know what is safe to
run.

We need to choose: file format, location, schema, and ownership.

## Decision

### Location

`<repo-root>/.ai-kit/project.yml`. The `.ai-kit/` directory also holds
`state/` and `reports/`, all kit-owned.

### Format

YAML. The schema is `ProjectProfile` from
`packages/contracts/src/project/project-profile.ts`, validated by the
`ProjectProfileSchema` zod schema. YAML is parsed and immediately validated;
invalid YAML is rejected with a structured `PROFILE_INVALID` error.

### Schema (M1, schemaVersion 1)

```yaml
schemaVersion: 1
name: my-app
stack:
  - node-typescript
  - react
commands:
  test:
    - ["pnpm", "test"]
  lint:
    - ["pnpm", "lint"]
  typecheck:
    - ["pnpm", "typecheck"]
  build:
    - ["pnpm", "build"]
```

Commands are **argument arrays**, never shell strings. The M6 executor runs
them with `shell: false`. A string command is a contract violation.

### Ownership

The file is **kit-owned**. `kit init` (M2) writes it after explicit user
approval. `kit uninstall` (M15) removes it. The installer never silently
overwrites an existing `project.yml`; an explicit `--force` is required and
the action is logged.

### Schema versioning

`schemaVersion` is required. Breaking changes follow ADR-0007: an ADR, a
version bump, a migration function in `core/artifacts/migrations/`, and
updated tests.

## Alternatives considered

- **JSON instead of YAML.** Machine-friendly, but harder to hand-edit when
  a user wants to add a stack or tweak a command. YAML with a strict schema
  gets the best of both.
- **TOML.** Good for config; less familiar to the kit's audience. Rejected.
- **Inside `package.json`.** Conflates kit configuration with the project's
  own package manifest. Rejected: the kit is runtime-independent and may
  target a Rails project that has no `package.json`.
- **A new top-level file like `kit.config.yml`.** Pollutes the repository
  root. The `.ai-kit/` directory groups all kit state in one place that
  `.gitignore` can address selectively.

## Consequences

- `.ai-kit/` is created by `kit init` and tracked in `.gitignore` for
  `state/` and `reports/` but **not** for `project.yml` (which is meant to
  be committed).
- The M2 `kit init` command requires approval before writing
  `project.yml` (`ROADMAP.md` §4, M2-07).
- The M6 verification runner reads `project.yml`, validates it, and uses
  the `commands` map to execute checks. A profile with missing commands
  results in `skipped` checks for those categories — never `passed`.
- Future stack packs add `stack` entries; they do not change the schema.
- The schema is exported from `@agentic-sdlc-kit/contracts` so external
  tools can validate a `project.yml` without depending on `core`.

## References

- `docs/contracts/CONTRACTS.md` §2
- `docs/architecture/ARCHITECTURE.md` §3
- `docs/security/SECURITY.md` §2
- `packages/contracts/src/project/project-profile.ts`
- ADR-0007 (shared contracts and artifacts)
