# Extra Prompts

## Explain a codebase
Map this repo: entry points, main modules and their responsibilities, data flow for <key
request>, external dependencies, and where tests live. Output as a short doc with a Mermaid diagram.
Save to docs/ARCHITECTURE.md.

## Write tests for existing code
For <file>, list behaviors (happy, edge, error). Write tests for uncovered ones.
Do not change production code. Show coverage before/after if available.

## Performance investigation
<endpoint/function> is slow (<numbers>). Profile or reason about hot paths, N+1 queries,
allocations, and I/O. Propose fixes ranked by impact/effort. Measure before and after.

## Security audit
Audit <area> against checklists/security.md and OWASP Top 10. Report findings with
severity, exploit scenario, and fix. Do not change code until I approve.

## Migrate / upgrade dependency
Upgrade <lib> from <x> to <y>. Read the changelog/breaking changes, list impacted call
sites, plan the steps, then execute with tests green after each step.

## API design
Design a REST/GraphQL API for <resource>. Give endpoints, request/response JSON examples,
status codes, errors, pagination, auth, idempotency, and versioning.

## Database schema
Design tables for <feature>: columns with types, constraints, indexes, relations, and a
reversible migration. Explain query patterns each index serves.

## Write docs
Write/update README sections for <feature>: what, why, setup, usage examples, config, troubleshooting.

## Commit message
Write a conventional commit message for the staged diff. Subject ≤ 72 chars; body explains why.
