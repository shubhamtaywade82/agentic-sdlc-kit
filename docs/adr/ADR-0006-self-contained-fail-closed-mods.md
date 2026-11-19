# ADR-0006: Mods are self-contained plugins with fail-closed hooks

Date: 2026-11-19 · Status: accepted

## Context

Claude Code mods are plugins whose hooks modules may import ONLY relative
files inside the plugin directory (static analysis rejects bare imports
except `claude-code`). Mods run with full user privileges; a crashed hook is
skipped by default — which for a guard means the risky action RUNS.

## Decision

- Each mod vendors what it needs (including a ~70-line YAML-subset reader for
  `.ai/project.yml`) — no cross-plugin imports, ever.
- Policy cores (`policies/*.ts`) are pure, host-independent TypeScript,
  compiled and unit-tested in our CI without Claude Code; hooks are thin
  bindings to host events.
- Every denying hook chains `.catch()` returning a deny result: internal
  errors refuse the action (fail closed). Profile parse failures fall back to
  documented safe defaults.
- Observer-style mods never block: errors are swallowed and logged.

## Consequences

- (+) A guard bug cannot silently disable the guard; an observer bug cannot
  stop a session.
- (+) Policy behavior is testable in CI (74 policy tests) — `claude plugin
  test` remains for host-integration on user machines.
- (−) Deliberate duplication (config reader, secret patterns) across mods;
  mitigated by shared contracts (`contracts/secret-patterns.md`) and mirrored
  tests, per ADR-0001.
