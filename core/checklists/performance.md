# Performance Checklist
- [ ] Measured baseline before optimizing (profile, don't guess)
- [ ] DB: no N+1 (eager load), indexes for WHERE/JOIN/ORDER BY, LIMIT on lists
- [ ] Caching with clear invalidation; HTTP caching headers where applicable
- [ ] Heavy work moved to background jobs; timeouts + retries with backoff on I/O
- [ ] Payloads paginated/compressed; frontend bundles split, images optimized
- [ ] Memory: streaming for large files; no unbounded in-memory collections
- [ ] Load-tested critical paths; p95 latency within budget
