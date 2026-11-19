---
trigger: always_on
description: Core rules for the AI Dev Kit lifecycle — read AGENTS.md, plan before coding, test first, approval gates for push/merge/tag/release/deploy.
---
Read and follow the repository-root `AGENTS.md` (relative path, no leading slash) — it is the source of truth.

- Plan before multi-file edits; save plans to `docs/plans/`.
- Test-first for logic; run tests and show output before saying "done".
- Follow existing patterns. No scope creep. No secrets.
- Pushing, merging, tagging, releasing, and deploying ALWAYS require explicit human approval first.
- Lifecycle workflows live in `.ai/workflows/`; templates and checklists in `.ai/templates/` and `.ai/checklists/`.
