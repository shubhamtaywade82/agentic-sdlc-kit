# Code Review Checklist
**Correctness**
- [ ] Does it meet the spec/acceptance criteria? Edge cases handled?
- [ ] Off-by-one, nil/null, empty collections, time zones, encoding, concurrency/races
- [ ] Errors propagated or handled meaningfully (no swallowed exceptions)
**Design**
- [ ] Follows existing patterns; right layer for the logic
- [ ] Single responsibility; no duplication; no premature abstraction
- [ ] Public interfaces minimal and well-named
**Tests**
- [ ] Tests cover behavior incl. error paths; deterministic; readable
- [ ] Would a test fail if the feature broke?
**Readability**
- [ ] Names reveal intent; functions short; comments explain why
**Performance**
- [ ] No N+1 queries, unbounded loops/queries, or needless allocations
- [ ] Pagination/limits on lists; indexes for new query patterns
**Security** – see security.md
**Ops**
- [ ] Migrations reversible & safe for zero-downtime
- [ ] Config via env; feature flag for risky changes; logs/metrics added
