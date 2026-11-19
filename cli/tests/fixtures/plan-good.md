---
kind: plan
mode: feature
spec: ./spec-good.md
---

# Plan: Export verification reports

## Approach

Add a discovery step that finds the newest verification report and expose its
status and age through the release-check gate. Keep the report format stable
so automation can rely on it.

## Tasks

### TASK-001: Implement report discovery

- Depends: none

Acceptance:
- The newest report is selected by modification time

Verification:
- Automated test covers the fresh-report path

### TASK-002: Wire the release-check gate

- Depends: TASK-001

Acceptance:
- release-check exits 0 with a fresh passing report

Verification:
- Automated test runs release-check in a temporary repository

## Checkpoints

- Design review of the report selection rules
- Test review of the release-check scenarios
