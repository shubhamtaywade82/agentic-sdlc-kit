# Release Checklist

Deterministic readiness first, then the operational list.

**Automated** — `node .ai/kit/bin/kit.js release-check` (exit 0 = ready):
- [ ] CHANGELOG (`docs/releases/CHANGELOG.md`) contains the version
- [ ] Latest verification report in `.ai/reports/verification/` is `passed` and < 7 days old
- [ ] Working tree clean (or an explicit `--allow-dirty` waiver)
- [ ] Not on main/master (or an explicit `--allow-main` waiver)
- [ ] Tag `v<version>` does not already exist
- [ ] `kit audit` clean (no secrets; no critical/high advisories, or documented waiver)

**Operational**
- [ ] CI green on the release commit; PRs reviewed
- [ ] Migrations reviewed for lock/time; run order documented; backward-compatible or gated
- [ ] New env vars / secrets configured in all environments
- [ ] Feature flags set; rollback command tested and written down
- [ ] Monitoring dashboards & alerts ready; on-call aware
- [ ] Post-deploy smoke test; watch errors/latency for 30 minutes

**Approvals** — each action individually approved by a human before it runs
(AGENTS.md §6): merge → tag → publish → deploy. Never batched.
