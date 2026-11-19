# 09 — Operations & Feedback

The lifecycle's closing loop: running software teaches the next iteration.

**In scope for this stage**

1. **Observability notes** — for what shipped: which signals matter (error rate,
   latency, saturation), where they're visible, which alert pages a human.
   Record in `docs/testing/` or the service's own runbook; link from the PR.
2. **Deployment monitoring** — after each deploy (per `08-release.md`): watch
   errors/latency for the agreed window; note anomalies in the release record.
3. **Incident handling** — rollback first, diagnose second (a slow revert beats
   a clever hotfix under pressure). Incidents affecting users get a short
   postmortem in `docs/security/` or `docs/testing/`: what happened, impact,
   cause, prevention — blameless, action items tracked in `docs/TODO.md`.
4. **Feedback into the lifecycle** — recurring bugs → missing regression
   criteria (fix the spec template habit, not just the code); recurring
   outages → resilience patterns backlog (skill `design-pattern-selection`,
   `resilience.md` reference); recurring review findings → update the relevant
   checklist in `checklists/`.
5. **Kit state hygiene** — `.ai/reports/` accumulates: verification reports
   are evidence (keep, commit or archive per team policy); run telemetry
   (`.ai/reports/runs/`, if the run-observer mod is enabled) is local state:
   prune periodically, keep out of commits (`.ai/reports/runs/` in
   `.gitignore` unless the team decides otherwise).

**Rules**

- Runtime state is supplementary. The committed spec, plan, tests, and
  verification reports are the source of truth (architecture proposal §15).
- Operations work follows the same gates: a hotfix is a bug fix (`/kit:fix`
  discipline — regression test first), a runbook change is a docs commit.
