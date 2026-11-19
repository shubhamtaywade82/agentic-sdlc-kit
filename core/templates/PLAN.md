---
kind: plan
spec: ../specifications/features/export-orders-csv.md
mode: feature
---

# Plan: Export orders as CSV

## Approach

Add a scoped CSV builder next to the admin orders query (reuse the existing
filter scope), expose one admin route that streams the CSV, and gate it with
the existing orders-role policy. Riskiest part first: escaping and large-export
performance (TASK-001/002), then the route and UI button.

## Tasks

### TASK-001: CSV builder with escaping

- Depends: none
- Acceptance:
  - Builds header + rows from order structs
  - Escapes commas, quotes, and newlines per standard CSV rules
- Verification:
  - `npm test -- csv-builder` (unit: escaping cases, empty input)

### TASK-002: Stream the filtered export

- Depends: TASK-001
- Acceptance:
  - Exports the same set as the visible admin orders view with active filters
  - 10k orders export in under 10 seconds
- Verification:
  - `npm test -- export.integration` + manual timing on seeded 10k orders

### TASK-003: Admin route with role gate

- Depends: TASK-002
- Acceptance:
  - Orders-role admins get the file; others get 403 with no file
  - No writes to order state (read-only path)
- Verification:
  - `npm test -- export.authz` (role matrix: admin, orders-role, other)

### TASK-004: Orders page button

- Depends: TASK-003
- Acceptance:
  - "Export CSV" button on the admin Orders page downloads the current view
- Verification:
  - Playwright e2e `export.spec.ts` (with and without matches)

### TASK-005: Regression — existing orders list unchanged

- Depends: TASK-003
- Acceptance:
  - Orders list behavior and performance unchanged
- Verification:
  - Full existing admin suite: `node .ai/kit/bin/kit.js verify`

## Checkpoints

- [ ] Design review — CSV builder boundary and escaping approach (after TASK-001)
- [ ] Test review — authz matrix covers the 403 criteria (after TASK-003)
- [ ] Verification review — full `kit verify` green before PR
