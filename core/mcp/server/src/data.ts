// SDLC knowledge base for the ai-dev-kit MCP server.
// Condensed from workflows/, templates/, and checklists/ so any MCP client
// (Claude Code, Cursor, Windsurf, Copilot, Gemini CLI, ...) can query the
// lifecycle without those files being in its context.
// v5: 10-stage lifecycle, three execution modes, kit CLI gates.

export type Stage = {
  id: string;
  name: string;
  input: string;
  output: string;
  doc: string;
  gate: string;
  steps: string[];
};

export const STAGES: Stage[] = [
  {
    id: "01-discovery",
    name: "Discovery & Onboarding",
    input: "The repository (or an empty repo for greenfield) + the change request",
    output: "Project profile (.ai/project.yml), architecture & conventions report, impact map",
    doc: ".ai/workflows/00-overview.md",
    gate: "Human confirms the picture is correct; kit doctor reports no FAIL",
    steps: [
      "Entry: /kit:init. Run 'node .ai/kit/bin/kit.js inspect' and 'kit doctor'; report findings.",
      "Explore structure, conventions, existing plans (never overwrite another task's plan), and pending ADRs.",
      "Generate .ai/project.yml (kit init) with the stack, quality gates, and policies; human reviews it.",
      "For a feature: produce the impact map — modules, contracts to preserve, regression risks (repository-analyst agent).",
    ],
  },
  {
    id: "02-requirements",
    name: "Requirements Engineering",
    input: "Raw idea / feature request / bug report",
    output: "docs/product/<slug>.md (PRD, greenfield) or docs/specifications/features/<slug>.md (feature spec)",
    doc: ".ai/workflows/01-clarify-prd.md",
    gate: "kit validate-spec green + human approves acceptance criteria",
    steps: [
      "Ask at most 5 clarifying questions (users, scope, edge cases, non-goals, success metric); proceed with stated assumptions.",
      "Draft the spec from templates/SPEC.md: Problem, Scope (In/Out), Acceptance Criteria as Given/When/Then, NFRs, Open Questions.",
      "In an existing app: add regression criteria pinning existing behavior that must not break.",
      "Validate: node .ai/kit/bin/kit.js validate-spec docs/specifications/features/<slug>.md — fix every error.",
      "Only a human flips status to approved.",
    ],
  },
  {
    id: "03-system-design",
    name: "System Design",
    input: "Approved spec + discovery report",
    output: "docs/specifications/technical/<slug>.md + ADRs in docs/architecture/adr/",
    doc: ".ai/workflows/02-tech-spec.md",
    gate: "Human approves design; no TBD in critical sections; risks have mitigations",
    steps: [
      "Design boundaries, data model (backward-compatible migrations), API contracts, failure behavior (resilience patterns), security posture.",
      "Significant decisions get 2-3 options with trade-offs; the human picks.",
      "ADR (templates/ADR.md) only when the decision has architectural consequence — not for every class-level pattern (design-pattern-selection skill: five questions inline).",
    ],
  },
  {
    id: "04-planning",
    name: "Implementation Planning",
    input: "Approved spec (+ design when needed)",
    output: "docs/plans/<slug>.md — dependency-aware vertical-slice task plan",
    doc: ".ai/workflows/03-task-plan.md",
    gate: "kit validate-plan green (no cycles, no dangling deps, every task has acceptance + verification) + human approval",
    steps: [
      "Draft from templates/PLAN.md: Approach; tasks TASK-001… each with Depends / Acceptance / Verification; Checkpoints.",
      "Vertical slices, not layers: each task delivers one complete outcome and leaves the app working.",
      "Risky/uncertain first; regression tasks are first-class; migrations isolated and backward-compatible.",
      "Validate: node .ai/kit/bin/kit.js validate-plan docs/plans/<slug>.md — zero errors before building.",
    ],
  },
  {
    id: "05-development",
    name: "Development (TDD/BDD)",
    input: "One task from the plan",
    output: "Code + tests, one conventional commit per task",
    doc: ".ai/workflows/04-build-tdd.md",
    gate: "TDD discipline (tdd-bdd skill): red -> green -> refactor, per task",
    steps: [
      "Load context: plan file + spec + only the files the task touches.",
      "RED: write the failing test that expresses the task's acceptance; show the failure.",
      "GREEN: minimal code to pass. REFACTOR: small steps, tests stay green.",
      "Bug fix? Reproduce first with a failing regression test, find the root cause (workflows/06-debug.md), then the minimal fix.",
      "Refactor? Characterize behavior with tests first; structural changes only; compare evidence (workflows/07-refactor.md).",
      "Commit 'feat(scope): <task>'; tick the task in the plan. Stop and ask if the spec is wrong or a task balloons > 2x.",
    ],
  },
  {
    id: "06-verification",
    name: "Verification",
    input: "Implemented task / slice",
    output: "Verification report (.ai/reports/verification/verify-*.json)",
    doc: ".ai/workflows/04-build-tdd.md",
    gate: "kit verify status: passed — a skipped check is never a passed check",
    steps: [
      "Run: node .ai/kit/bin/kit.js verify — quality gates from .ai/project.yml (typecheck/lint/tests/build), executed as arg arrays with shell:false.",
      "Read the report: every check is passed / failed / skipped (with reason) / blocked. Fix failures; explain skips.",
      "Security-relevant changes: also run kit audit (secrets + dependency advisories).",
      "Evidence, not claims: the report path goes in the PR.",
    ],
  },
  {
    id: "07-review",
    name: "Independent Review",
    input: "Branch diff + spec + plan + verification report",
    output: "Findings (Blocker/Major/Minor/Nit) + fixes + PR",
    doc: ".ai/workflows/05-review.md",
    gate: "No Blockers; Majors fixed or explicitly waived; docs updated in the same PR",
    steps: [
      "Fresh context (/kit:review). Frame with 'node .ai/kit/bin/kit.js changed'; reviewer reads spec + plan first.",
      "code-reviewer agent: correctness, regressions, test coverage vs acceptance criteria.",
      "architecture-reviewer agent when structure shifts; security-reviewer agent + kit audit when auth/input/data/files/deps are touched.",
      "Fix Blockers/Majors; kit verify green again; fill templates/PR.md and open the PR.",
    ],
  },
  {
    id: "08-release",
    name: "Release & Deployment",
    input: "Merged PR + green verification report",
    output: "Changelog, tag, release, deployment",
    doc: ".ai/workflows/08-release.md",
    gate: "kit release-check green; merge, tag, publish, deploy EACH approved by a human",
    steps: [
      "Readiness: node .ai/kit/bin/kit.js release-check — fix what code can fix; waivers are explicit and human.",
      "Evidence: latest verification report is passed and current (< 7 days).",
      "Changelog: docs/releases/CHANGELOG.md (templates/CHANGELOG.md), SemVer bump — normal commits.",
      "Propose the exact sequence: merge -> tag v<version> -> publish -> deploy + rollback plan; execute step by step with per-action approval.",
      "Deploy behind a feature flag when risky; monitor errors/latency for 30 minutes.",
    ],
  },
  {
    id: "09-operations",
    name: "Operations & Feedback",
    input: "Running software + incident/feedback signals",
    output: "Runbook notes, postmortems, lifecycle improvements",
    doc: ".ai/workflows/09-operations.md",
    gate: "— (continuous)",
    steps: [
      "Record which signals matter (errors, latency, saturation) and where they are visible.",
      "Incidents: rollback first, diagnose second; blameless postmortem with action items.",
      "Feed patterns back: recurring bugs -> missing regression criteria; outages -> resilience backlog; review findings -> checklist updates.",
      "Prune .ai/reports/runs/ (local telemetry); verification reports are evidence — keep.",
    ],
  },
];

export const MODES = [
  {
    id: "mode-a",
    name: "Mode A — New application (/kit:app)",
    stages: "01-discovery -> 02-requirements (PRD) -> 03-system-design -> 04-planning (vertical slices) -> 05/06 per slice -> 07-review -> 08-release",
    rule: "Build the MVP as complete vertical slices; each slice leaves the app working. Never one giant implementation cycle.",
  },
  {
    id: "mode-b",
    name: "Mode B — Feature in an existing app (/kit:feature)",
    stages: "01-discovery (impact map first) -> 02-requirements (regression criteria included) -> 03/04 when the change warrants -> 05/06 -> 07-review -> 08-release",
    rule: "Inspect before abstracting; preserve public contracts; reuse existing services/conventions; verify the actual git diff before claiming done.",
  },
  {
    id: "mode-c",
    name: "Mode C — Bug fix & refactoring (/kit:fix)",
    stages: "Fix: reproduce -> failing regression test -> root cause (06-debug) -> minimal fix -> 06-verification. Refactor: characterize -> structural-only changes -> identical verification evidence.",
    rule: "A bug fix is not done until a test that reproduces the bug passes and nothing else broke. A refactor changes no behavior.",
  },
];

export type Template = { title: string; description: string; content: string };

export const TEMPLATES: Record<string, Template> = {
  spec: {
    title: "Feature Spec (kit validate-spec format)",
    description: "Stage 2 output: validated spec with Given/When/Then acceptance criteria.",
    content: `---
kind: spec
mode: feature
status: draft
---

# Spec: <title>

## Problem
<The user pain or business need, in the user's words. No solution language.>

## Scope
### In scope
- <what this change delivers>
### Out of scope
- <explicit non-goals>

## Acceptance Criteria
- GIVEN <context> WHEN <action> THEN <observable result>

## Non-functional Requirements
- <performance/security/accessibility constraints; "None" is explicit>

## Open Questions
- <tracked unknowns>
`,
  },
  plan: {
    title: "Implementation Plan (kit validate-plan format)",
    description: "Stage 4 output: dependency-aware vertical-slice tasks.",
    content: `---
kind: plan
spec: ../specifications/features/<slug>.md
mode: feature
---

# Plan: <title>

## Approach
<3-6 sentences: strategy, first slice, riskiest part first.>

## Tasks
### TASK-001: <title>
- Depends: none
- Acceptance:
  - <criterion>
- Verification:
  - <command or observation>

### TASK-002: <title>
- Depends: TASK-001
- Acceptance:
  - <criterion>
- Verification:
  - <command>

## Checkpoints
- [ ] Design review
- [ ] Test review
- [ ] Verification review — full kit verify green before PR
`,
  },
  prd: {
    title: "PRD (Product Requirements Document)",
    description: "Mode A (new app): problem, users, acceptance criteria, non-goals.",
    content: `# PRD — <feature name>

## Problem
<What hurts today, for whom, and why it matters. One paragraph.>

## Users & scenarios
- <Primary user>: <what they can do after this ships>

## Acceptance criteria (Given/When/Then)
- Given <context> when <action> then <observable result>

## Non-goals
- <Explicitly out of scope — the MVP is defined by what is EXCLUDED>

## Success metric
- <How we know it worked>

## Open questions
- <Question | owner | needed by>
`,
  },
  tech_spec: {
    title: "Technical Spec",
    description: "Stage 3 output: how to build it — data, contracts, risks.",
    content: `# Tech Spec — <feature name>

## Summary
<One paragraph: approach and why.>

## Options considered
| Option | Pros | Cons |
|---|---|---|
| A. <name> | | |
| B. <name> | | |

**Chosen:** <A/B> because <reason>. (ADR: docs/architecture/adr/NNN-<slug>.md)

## Data model changes
<Tables/collections, columns, indexes, migrations — backward-compatible.>

## API / interface contracts
<Endpoints, request/response shapes, error codes.>

## Components touched
<Files/modules and the kind of change in each.>

## Sequence
<Step-by-step flow for the main scenario.>

## Failure modes
<What can fail, how it is detected, what happens (timeout/retry/circuit breaker).>

## Security
<Auth, authz, input validation, secrets.>

## Performance
<Queries, N+1 risks, payloads, caching.>

## Migration / rollout
<Backfill, flags, order of deploys, rollback.>

## Test strategy
<Unit / integration / e2e coverage for each criterion.>
`,
  },
  pr: {
    title: "Pull Request",
    description: "Stage 7 output: what/why/how/evidence.",
    content: `## What
<One or two sentences.>

## Why
<The problem solved. Closes #123>

## How
<Key design decisions; link spec + plan.>

## Evidence
- Verification report: .ai/reports/verification/<latest> (kit verify: passed)
- Audit: <kit audit result>
- Screenshots (UI): <links>

## Checklist
- [ ] Acceptance criteria met
- [ ] Tests added/updated; all green
- [ ] Docs/CHANGELOG updated
- [ ] No secrets, debug output, or scope creep
`,
  },
  adr: {
    title: "ADR (Architecture Decision Record)",
    description: "Records a significant decision and its context.",
    content: `# ADR NNN — <decision title>

Date: YYYY-MM-DD
Status: <proposed | accepted | superseded by ADR MMM>

## Context
<The forces at play: requirements, constraints, existing code.>

## Decision
<What we will do, in one sentence, then details.>

## Alternatives considered
- <alternative>: why not chosen

## Consequences
<What becomes easier, harder, or possible.>
`,
  },
  bug_report: {
    title: "Bug Report",
    description: "Mode C input: reproduction, expectation, reality.",
    content: `# Bug — <short title>

- **Component:** <area/file>
- **Severity:** <blocker | major | minor>
- **Environment:** <browser/OS/Node/Ruby versions, environment>

## Steps to reproduce
1. ...

## Expected
<What should happen>

## Actual
<What happens; full error + stack trace>

## Notes
<Suspicions, first occurrence, recent changes>
`,
  },
  changelog: {
    title: "Changelog entry",
    description: "Stage 8 output: user-facing changes per release.",
    content: `## [X.Y.Z] — YYYY-MM-DD

### Added
- <new features>

### Changed
- <changes>

### Fixed
- <bug fixes>

### Breaking
- <breaking changes + migration notes>
`,
  },
};

export type Checklist = { title: string; description: string; items: string[] };

export const CHECKLISTS: Record<string, Checklist> = {
  "definition-of-done": {
    title: "Definition of Done (11 gates)",
    description: "Every feature passes every gate; evidence is machine-readable where possible.",
    items: [
      "Requirements: acceptance criteria satisfied — kit validate-spec green",
      "Architecture: approved design decisions where needed (ADR for meaningful consequences)",
      "Implementation: no unintended scope changes — verify the actual git diff",
      "Tests: relevant tests pass — kit verify report: passed",
      "Regression: existing behavior preserved — regression criteria covered",
      "Static quality: lint and type checks pass (same verify report)",
      "Security: no unresolved critical/high findings — kit audit clean or documented waiver",
      "Performance: requirements met where performance is relevant (NFRs)",
      "Documentation: relevant docs updated in the same PR",
      "Git: diff reviewed; no unintended files — kit changed + human review",
      "Release: approval + kit release-check green before tag/publish/deploy",
      "Verification report attached to the PR; no debug output or stray TODOs in the diff",
    ],
  },
  "code-review": {
    title: "Code Review Checklist",
    description: "Run in stage 7 on the branch diff.",
    items: [
      "Correctness: meets spec/acceptance criteria; edge cases handled",
      "Correctness: off-by-one, nil/null, empty collections, time zones, encoding, concurrency",
      "Correctness: errors propagated or handled, never swallowed",
      "Design: follows existing patterns; logic in the right layer",
      "Design: single responsibility; no duplication; no premature abstraction",
      "Design: public interfaces minimal and well-named",
      "Tests: cover behavior incl. error paths; deterministic; readable",
      "Tests: a test would fail if the feature broke",
      "Readability: names reveal intent; functions short; comments explain why",
      "Performance: no N+1 queries, unbounded loops/queries, needless allocations",
      "Performance: pagination/limits on lists; indexes for new query patterns",
      "Ops: migrations reversible and safe for zero-downtime",
      "Ops: config via env; feature flag for risky changes; logs/metrics added",
    ],
  },
  security: {
    title: "Security Checklist (OWASP-aligned)",
    description: "Run when auth, input, data, payments, or files are touched.",
    items: [
      "Input validation: all external input validated (type, length, format, allow-list)",
      "Injection: parameterized SQL; no shell/eval with user input; safe deserialization",
      "XSS: output escaped; no raw HTML from users; CSP where possible",
      "AuthN: strong hashing (bcrypt/argon2); rate-limited login; secure session/cookie flags",
      "AuthZ: every protected action checks permission server-side; deny by default; no IDOR",
      "Secrets: none in code/logs/tests; loaded from env/secret manager (kit audit green)",
      "Data: PII minimized; encrypted in transit (TLS) and at rest where needed",
      "CSRF protection on state-changing requests (cookie-based auth)",
      "File uploads: type/size checked, stored outside web root, random names",
      "SSRF: outbound URLs from users are allow-listed",
      "Dependencies: no known CVEs (kit audit / npm audit / bundle audit)",
      "Errors: no stack traces or internals leaked to clients",
      "Logging: security events logged; no tokens/passwords/PII in logs",
      "Rate limiting / abuse controls on public endpoints",
    ],
  },
  performance: {
    title: "Performance Checklist",
    description: "Run when touching hot paths, queries, or payloads.",
    items: [
      "Measured baseline before optimizing (profile, don't guess)",
      "DB: no N+1 (eager load); indexes for WHERE/JOIN/ORDER BY; LIMIT on lists",
      "Caching with clear invalidation; HTTP caching headers where applicable",
      "Heavy work in background jobs; timeouts + retries with backoff on I/O",
      "Payloads paginated/compressed; frontend bundles split; images optimized",
      "Memory: streaming for large files; no unbounded in-memory collections",
      "Load-tested critical paths; p95 latency within budget",
    ],
  },
  release: {
    title: "Release Checklist",
    description: "Run in stage 8 before and after deploying.",
    items: [
      "kit release-check green (changelog, fresh passed verification report, clean tree, tag free, audit clean)",
      "CI green on the release commit; PRs reviewed",
      "CHANGELOG updated; version bumped (SemVer); tag created (with approval)",
      "Migrations reviewed for lock/time; run order documented; backward-compatible or gated",
      "New env vars / secrets configured in all environments",
      "Feature flags set; rollback command tested",
      "Monitoring dashboards and alerts ready; on-call aware",
      "Post-deploy smoke test; watch errors/latency for 30 minutes",
    ],
  },
};

export const APPROVAL_GATES = [
  "Pushing any branch, merging a PR, pushing to main",
  "Creating or pushing git tags; publishing releases",
  "Deploying to any environment",
  "Force-push, history rewrite, branch deletion",
  "Database migrations (any non-local database); destructive DB ops; data deletion",
  "Reading, printing, or committing secrets",
  "Installing global packages; changing CI/CD or infra",
];
