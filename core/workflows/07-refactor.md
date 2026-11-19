# 07 — Refactor

1. **Ensure tests cover the current behavior** (add characterization tests if not).
2. State the smell and target design in one paragraph (skill `design-pattern-selection`
   if a pattern is the answer).
3. Refactor in tiny steps (rename, extract, move, inline), running tests after each.
4. No behavior change and no test assertion changes in the same commit.
5. Compare evidence: `node .ai/kit/bin/kit.js verify` before and after — identical or better.
6. Separate refactor commits from feature commits.

Prompt: `prompts/07-refactor.md` · Skill: `code-quality`
