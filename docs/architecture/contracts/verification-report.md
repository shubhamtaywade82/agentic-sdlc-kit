# Contract: Verification Report

Producer: `kit verify`. Location: `.ai/reports/verification/verify-<UTCtimestamp>-<6hex>.json`.
Consumers: humans, `/kit:review`, `/kit:release`, `kit release-check` (recency +
status), CI.

Replaces the sentence "everything looks good, feature completed" with
reproducible evidence.

## Schema (`agentic-sdlc/verification-report/1`)

```json
{
  "schema": "agentic-sdlc/verification-report/1",
  "runId": "verify-20260101T120000Z-a1b2c3",
  "timestamp": "2026-01-01T12:00:00.000Z",
  "command": ["kit", "verify", "--check", "unit"],
  "commitSha": "0d4c9b2… or null",
  "status": "passed | failed | blocked",
  "summary": { "passed": 3, "failed": 1, "skipped": 0, "blocked": 2 },
  "checks": [
    {
      "id": "typecheck",
      "status": "passed | failed | skipped | blocked",
      "command": ["npm", "run", "typecheck"],
      "exitCode": 0,
      "durationMs": 412,
      "evidence": ["…last 30 lines of output…"],
      "errors": []
    }
  ]
}
```

## Status semantics (the load-bearing rules)

| Status | Meaning | Counts as success? |
|---|---|---|
| `passed` | command exited 0 within timeout | yes |
| `failed` | non-zero exit or timeout; `evidence` carries the tail | no |
| `skipped` | gate absent from the profile, or executable not found — `errors[0]` carries the reason | **no — never** |
| `blocked` | not run because a required earlier check failed (`stopOnFailure`) | no |

- Overall `status`: `failed` if any failed → else `blocked` if any blocked →
  else `passed` if at least one passed → else `blocked` (nothing ran).
- `skipped` never contributes to a `passed` summary count, and a report where
  everything skipped is NOT a pass. A skip needs a written reason.
- Exit code of `kit verify`: 0 only on `passed`; 1 otherwise.

## Execution guarantees

- Commands run exactly as configured: `spawn(file, args, {shell:false,
  cwd:<projectRoot>, timeout})`. No shell interpolation is possible.
- `commitSha` pins the commit the evidence refers to (`git rev-parse HEAD`,
  null outside a repo).
- Reports are append-only evidence; `release-check` reads the newest one and
  requires `passed` within 7 days.

## Downstream rules

- `/kit:feature` (05 development) and workflow 04: a commit claim without a
  green (or explicitly explained) verification report is not "done".
- `checklists/definition-of-done.md`: the Tests, Regression, and Static
  quality gates reference this report.
- The committed spec, plan, tests, and verification report are the source of
  truth; runtime mod state is supplementary (ADR-0001).
