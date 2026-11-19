---
kind: spec
mode: feature
status: draft
---

# Spec: Export orders as CSV

## Problem

Store managers reconcile orders in a spreadsheet weekly. Today they copy rows
from the admin orders table by hand, which takes ~30 minutes and introduces
transcription errors.

## Scope

### In scope

- CSV export of the current order table view (respects active filters)
- Columns: order number, placed-at, customer email, status, total
- Download from the existing admin Orders page

### Out of scope

- Other entities (customers, products)
- Scheduled/recurring exports
- XLSX format

## Acceptance Criteria

- GIVEN an admin with the orders role, WHEN they click Export CSV, THEN a CSV
  downloads whose rows match the orders currently visible with active filters
  applied
- GIVEN no orders match the active filters, WHEN Export CSV is clicked, THEN a
  CSV with only the header row downloads
- GIVEN an order contains a comma or quote in customer email, WHEN exported,
  THEN the field is escaped so standard CSV parsers read it as one field
- GIVEN an admin without the orders role, WHEN they request the export, THEN
  the request is denied with 403 and no file downloads

## Non-functional Requirements

- Export of 10,000 orders completes within 10 seconds
- Export runs read-only: no writes to order state

## Open Questions

- Should the export include refunds once that feature ships? (tracked for later)
