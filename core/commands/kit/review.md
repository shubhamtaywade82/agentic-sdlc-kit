---
description: Independent engineering review of the current diff
argument-hint: "[scope or PR ref]"
---
Review the current changes as an independent engineer: $ARGUMENTS

Fresh-eyes review — do not trust the author's claims (including your own earlier work):

1. **Frame the diff**: `node .ai/kit/bin/kit.js changed` and `git diff` (against `main` unless I said otherwise). Read the linked spec in `docs/specifications/` and plan in `docs/plans/` if present.
2. **Correctness & regressions** — does the diff do what the spec says, and what it says ONLY? Check edge cases, error paths, and existing behavior that could break. Delegate breadth to the `repository-analyst` agent for large diffs.
3. **Architecture** — use the `architecture-reviewer` agent: coupling, boundaries, pattern appropriateness (skill `design-pattern-selection`: a pattern needs a demonstrated problem, not a preference).
4. **Security** — use the `security-reviewer` agent when the diff touches auth, input handling, files, SQL, secrets, or dependencies. Run `node .ai/kit/bin/kit.js audit` and include findings.
5. **Tests** — are the acceptance criteria covered? Any skipped/weak tests? Would the tests catch the bug this diff fixes?
6. **Verdict** — output one table: Severity (Blocker/Major/Minor/Nit) | file:line | issue | suggested fix. Then a one-line verdict: **Approve** / **Request changes**. No praise, no full rewrites.
