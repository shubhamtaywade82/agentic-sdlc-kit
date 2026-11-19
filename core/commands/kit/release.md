---
description: Release readiness check and controlled release execution
argument-hint: "[version]"
---
Prepare this repository for a release: $ARGUMENTS

Release is a gated, evidence-based process (`workflows/08-release.md`). Merge, tag, release publication, and deploy EACH need my explicit approval — in this session, one at a time (AGENTS.md §6).

1. **Readiness** — run `node .ai/kit/bin/kit.js release-check --json`. Walk me through every failed check and fix what code can fix (docs, changelog, leftover TODOs). Re-run until green or I explicitly waive a check.
2. **Evidence** — confirm the latest verification report (`.ai/reports/verification/`) is `passed` and current: `node .ai/kit/bin/kit.js verify` if not. A release without a passing verification report does not proceed.
3. **Changelog** — `docs/releases/CHANGELOG.md` (template `templates/CHANGELOG.md`): user-facing changes, grouped, dated, versioned. ⏸ approve
4. **Propose the release plan** — exact commands, in order: merge → tag `v<version>` → release publication → deploy/rollback notes. ⏸ approve the plan
5. **Execute step by step** — before each state-changing command, show it and wait for my approval. Stop immediately if anything fails; report, don't improvise.
6. **After release** — record what shipped and any follow-ups in `docs/TODO.md`; note incidents/feedback hooks per `workflows/09-operations.md`.
