---
kind: spec
mode: feature
status: approved
---

# Export verification reports

## Problem

Reviewers cannot confirm which quality gates ran for a change. Verification
reports exist on disk, but nothing links them to a specification, so release
reviews re-run commands manually and the results are not reproducible.

## Scope

### In scope

- Reading the newest verification report from .ai/reports/verification
- Documented exit code contract for release checks

### Out of scope

- A web dashboard for verification history
- Notifications to external chat tools

## Acceptance Criteria

- GIVEN a passing report WHEN release-check runs THEN it exits 0
- The command must fail when the newest report is older than 7 days
- Report paths should be machine-readable JSON

## Non-functional Requirements

- The command must complete in under 2 seconds on a cold cache.

## Open Questions

- Should stale reports be archived automatically?
