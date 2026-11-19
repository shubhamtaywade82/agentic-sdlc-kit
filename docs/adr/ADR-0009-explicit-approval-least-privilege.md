# ADR-0009: Explicit approval and least privilege; the kit is not an OS sandbox

Status: Accepted
Date: 2026-11-19
Milestone: M0 (frozen), enforced from M10; baseline invariants in M1

## Context

The kit performs operations on a developer's machine: writing files,
running subprocesses, executing migrations, pushing to git, deploying. Some
of these are destructive. We need a security model that prevents accidental
harm without making the kit unusable, and that is honest about what it can
and cannot guarantee.

## Decision

### Explicit approval and least privilege

Every destructive operation goes through a policy evaluator
(`core.policy.evaluator` in M10) that returns one of:

- `allow` — the operation is safe to perform automatically.
- `deny` — the operation is forbidden; no later stage may turn this into
  `allow`.
- `require-approval` — the operation needs explicit user approval.

The default for any action not explicitly allowed is `require-approval`.
When the host is non-interactive, `require-approval` is treated as `deny`
(fail-closed). Fail-open is allowed only for actions explicitly documented
as fail-open in `plugins/sdlc-guard/policies/` and only when the
consequence of failing open is reversible.

The policy evaluator is a **pure function** with deterministic unit tests
for every action × context. The adapter applies the verdict to the host;
the verdict itself is computed without side effects.

### Least privilege

The kit requests the minimum capability it needs for each operation:

- Discovery is read-only.
- Verification commands come from the validated `ProjectProfile`, never
  from agent free text.
- Subprocess execution uses `shell: false`, scoped cwd, bounded timeouts.
- File writes are confined to `.ai-kit/` and `docs/`; writes outside those
  roots require approval.

### The non-negotiable limitation

**The kit is not an operating-system sandbox.** Runtime Mods (Claude Code
plugins, equivalent for other runtimes) execute with the host process's
access to the machine. They can evaluate policy, require approval, refuse
to translate host events, redact secrets, and observe. They **cannot**
prevent a determined attacker with host access from bypassing them, and
they cannot replace OS-level file permissions, container isolation,
restricted credentials, or deployment controls.

Real isolation comes from OS permissions, containers, restricted
credentials, and deployment controls. The kit adds engineering discipline
on top, not a sandbox underneath.

This limitation is documented in `SECURITY.md` §4 and repeated in every
Mod's README.

### Bypass cannot silently turn deny into allow

A bypass flag, if it exists, MUST be:
1. Set by an explicit user action (env var, CLI flag, or config file).
2. Logged with the user identity and timestamp.
3. Limited to a specific action and scope.
4. Visible in the run report.

A bypass that silently turns `deny` into `allow` is a Critical bug. The
M10 test suite includes adversarial cases that attempt bypass via env
vars, config typos, and context confusion.

## Alternatives considered

- **Trust the agent.** Fastest UX, but a single hallucinated `rm -rf` is a
  disaster. Rejected.
- **Require approval for everything.** Safest in theory, unusable in
  practice. The policy evaluator exists precisely to classify operations so
  that safe ones proceed without friction and dangerous ones stop.
- **Implement a real sandbox.** Out of scope for a plugin-based kit that
  runs in the host process. Containers and OS permissions are the
  operator's job; the kit integrates with them, it does not replace them.
- **Fail-open by default.** Convenient for demos, dangerous for production.
  Rejected; fail-closed is the default.

## Consequences

- The M1 baseline enforces only the invariants that do not require the
  policy evaluator: writes confined to `.ai-kit/` and `docs/`
  (`core/artifacts/writer.ts`), argument-array commands in
  `ProjectProfile`, and the `deny` ≠ `allow` contract invariant in
  `PolicyDecision`.
- The M10 `sdlc-guard` Mod implements the full evaluator and the
  approval-gate middleware in `claude-code-adapter`.
- Every Mod README starts with a "This is not an OS sandbox" notice.
- The `SECURITY.md` threat model includes the "bypass turns deny into
  allow" case as a Critical finding.
- The M17 adversarial test suite includes bypass attempts against every
  Mod.

## References

- `docs/security/SECURITY.md` §1, §3, §4
- `docs/contracts/CONTRACTS.md` §7
- `docs/architecture/ARCHITECTURE.md` §4, §6
- `docs/roadmap/ROADMAP.md` §12 (M10)
- ADR-0004 (runtime-independent core; the evaluator lives in `core`)
