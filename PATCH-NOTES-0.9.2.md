# Patch Notes 0.9.2 — Git Scope and Observer Bounds

This patch hardens two runtime Mods without changing the default model-router
policy or claiming a live Claude Code runtime validation that has not run.

## 1. secret-guard: narrow push allowlist

- Accept only a bare `git push` or one remote argument, optionally with
  explicitly allowlisted transport/output flags.
- Deny refspecs, `--all`, `--tags`, `--mirror`, unknown flags, multiple
  positional arguments, Git repository-redirection options, and directory
  changes before a history mutation.
- Fail closed when command nesting or parsing leaves the target uncertain.
- Scan locally reachable commit history across local refs rather than only
  commits reachable from `HEAD`.
- Update the Secret Guard documentation to describe the conservative scope
  accurately; this scan is not described as an exact reconstruction of Git's
  transport negotiation.

## 2. run-observer: bounded run retention

- Keep the existing per-run event cap.
- Retain at most 100 run records in memory, evicting the oldest run when the
  cap is reached.
- Move state publication inside the observer's best-effort boundary so a
  telemetry state-backend failure cannot prevent `next(e)`.

## 3. Runtime validation status

The v0.9.1 main CI run's live Claude provider smoke-test job was skipped because
`ANTHROPIC_API_KEY` was not configured. The static plugin validation and
MockRuntime integration tests do not establish that all Mods work in a real
Claude Code session. A live runtime smoke test remains an operator-owned
release check and must be reported as not run until it actually executes.

## Verification

Pending CI for this patch branch. Do not treat this document as evidence of
a successful build or test run.
