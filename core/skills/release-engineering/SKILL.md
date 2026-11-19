---
name: release-engineering
description: Documentation, release readiness, versioning, and controlled release execution. Use when preparing a release, writing a changelog, running kit release-check, or setting up deployment and rollback plans.
license: MIT
---

# Release Engineering

A release is a claim about evidence: "this exact state passed the gates". No
evidence, no release. The authoritative gate: `checklists/release.md` and
`workflows/08-release.md`.

## Before anything ships

1. **Verification evidence** — the latest `kit verify` report in
   `.ai/reports/verification/` is `passed` and current. Skipped is not passed;
   a skip must have a written reason.
2. **Readiness check**:
   ```bash
   node .ai/kit/bin/kit.js release-check
   ```
   Fix what code can fix; anything left is an explicit, approved waiver.
3. **Docs current** — setup, API, and architecture docs updated in the same
   effort as the change; `docs/TODO.md` carries known follow-ups.

## Changelog (`docs/releases/CHANGELOG.md`)

- Keep a Changelog format: Added / Changed / Fixed / Removed, newest first,
  dated, versioned. User-facing language — a user cares what changed for them,
  not which file.
- Every merged feature/fix since the last release appears; link to specs/ADRs
  for the "why".

## Versioning

SemVer: MAJOR for breaking contracts, MINOR for backward-compatible additions,
PATCH for fixes. The version is asserted in one place (package.json / gem
version / CHANGELOG) and `kit release-check` cross-checks changelog ↔ version ↔
tag.

## Controlled execution (each step needs explicit human approval)

1. Propose the exact command sequence: merge → tag `v<version>` → publish →
   deploy, plus the rollback plan (previous tag, migration reversal notes).
2. Execute step by step; show each state-changing command before running it;
   stop on any failure and report — never improvise past a failure.
3. Deployments and destructive migrations are individually gated (AGENTS.md §6).

## After release

- Record what shipped and any incidents/feedback hooks
  (`workflows/09-operations.md`).
- If something goes wrong: rollback first, diagnose second — a slow revert
  beats a clever hotfix under pressure.
