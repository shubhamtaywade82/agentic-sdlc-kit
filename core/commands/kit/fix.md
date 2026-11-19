---
description: Diagnose and fix a defect, or do a behavior-preserving refactor
argument-hint: "<bug report | refactor: <area>>"
---
Resolve this as a controlled engineering change: $ARGUMENTS

This is Mode C. Two variants with different safeguards — establish which one this is first and state it.

**Bug fix** (input reads like a defect report, or links to `templates/BUG_REPORT.md`):
1. **Reproduce** — write a failing regression test that demonstrates the bug. If it cannot be reproduced, stop and report what you tried.
2. **Diagnose** — find the root cause; read the code and its callers. No fix before the cause is named.
3. **Fix** — smallest change that makes the regression test pass and stays within the spec of the surrounding behavior.
4. **Verify** — run the full relevant suite: `node .ai/kit/bin/kit.js verify`. Show output.
5. **Review** — `/kit:review` on the diff (fresh context) for anything beyond a trivial fix.

**Refactor** (input starts with "refactor"):
1. **Characterize** — identify or write tests that pin the current behavior. No refactor behind untested code.
2. **Refactor** — structural changes only; no behavior change, no new features, no public-contract changes.
3. **Compare** — run the same verification before and after: `node .ai/kit/bin/kit.js verify`. Results must be identical or improved; show both.
4. If the change grows beyond a refactor (behavior must change), stop — that is Mode B (`/kit:feature`), not a refactor.

Both variants: one logical commit; update docs if behavior-relevant; never fix unrelated issues silently (note them in `docs/TODO.md`).
