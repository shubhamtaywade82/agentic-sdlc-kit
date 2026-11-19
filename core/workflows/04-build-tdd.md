# 04 — Build (TDD Loop)

For each task in the plan:

1. **Load context:** plan file + spec + only the files the task touches.
2. **Red:** write the failing test. Run it. Confirm it fails for the right reason.
3. **Green:** write the minimum code to pass. Run the test.
4. **Refactor:** clean up with tests green.
5. **Verify all:** `node .ai/kit/bin/kit.js verify` — suite + lint + types per the
   project profile; a skipped check is not a passed check.
6. **Commit:** `feat(scope): <task>`; tick the task in the plan.
7. **Reset context** if the session is long; resume from the plan file.

Stop and ask the human if: the spec is wrong, a task balloons > 2x, or a safety boundary is hit.

Prompt: `prompts/04-implement.md` · Skill: `tdd-bdd`
