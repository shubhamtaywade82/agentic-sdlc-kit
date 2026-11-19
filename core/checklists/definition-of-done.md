# Definition of Done

Every feature passes every gate. Evidence is machine-readable where possible:
`kit verify` writes a verification report to `.ai/reports/verification/`
(PASS / FAIL / SKIPPED / BLOCKED — a skipped check is never a passed check).

| Gate | Required evidence |
|---|---|
| Requirements | Acceptance criteria satisfied — `kit validate-spec` green |
| Architecture | Approved design decisions where needed (ADR for meaningful consequences) |
| Implementation | No unintended scope changes — verify the actual `git diff` |
| Tests | Relevant tests pass — `kit verify` report: passed |
| Regression | Existing behavior preserved — regression criteria in the spec covered |
| Static quality | Lint and type checks pass where applicable (same verify report) |
| Security | No unresolved critical/high findings — `kit audit` clean or documented waiver |
| Performance | Requirements met where performance is relevant (NFRs in the spec) |
| Documentation | Relevant docs updated in the same PR |
| Git | Diff reviewed; no unintended files — `kit changed` + human review |
| Release | Approval + `kit release-check` green before tag/publish/deploy |

- [ ] Verification report attached to the PR (path is fine)
- [ ] No debug output, commented-out code, or stray TODOs in the diff
- [ ] Plan file updated (task ticks current)
- [ ] Self-review done (skill `code-quality`); independent review for non-trivial changes
