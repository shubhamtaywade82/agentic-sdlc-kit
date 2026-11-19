# ADR-0011: Shared security contracts before Mods

Status: Accepted
Date: 2026-11-19
Milestone: M8 (frozen); M10–M11 contracts land with M8 as a head start

## Context

The M10 `sdlc-guard` Mod and the M11 `secret-guard` Mod both depend on a
set of contract types: action classification, policy schema, audit events,
secret findings, detection rules, redaction policy, scanner-failure
behavior. Per the post-M7 roadmap (§22 sequence 9: "M10–M11 shared security
contracts — Gate: Security architecture review"), these contracts should
be reviewed and frozen **before** the Mods are implemented.

## Decision

The M10–M11 shared contract surface lives in `packages/contracts/src/`:

- `runtime-guard/action-classification.ts` — typed action categories
  (M10-01).
- `runtime-guard/policy-schema.ts` — versioned policy configuration
  (M10-03).
- `runtime-guard/audit-event.ts` — approval and denial records (M10-07).
- `secret-guard/finding.ts` — standardized secret finding (M11-01).
- `secret-guard/detection-rule.ts` — built-in detection rules (M11-02).
- `secret-guard/redaction-policy.ts` — redaction behavior (M11-04).
- `secret-guard/scanner-failure.ts` — explicit failure policy (M11-09).

These contracts are **runtime-independent**: they live in `contracts` and
are consumed by `core` (the policy evaluator, the secret detector) and by
the adapter (which applies them to the host). The Mods themselves (M10,
M11) wire these contracts to the host SDK; they do not redefine them.

The M1 baseline already ships a minimal `policy/evaluator.ts` that returns
`require-approval` for every destructive action. The M10 contracts extend
this with structured action classification, audit events, and a versioned
policy schema. The M11 contracts add secret findings and detection rules.

## Alternatives considered

- **Define security contracts inside the Mods.** Rejected: the contracts
  are consumed by `core` (which is runtime-independent), so they must live
  in `contracts`. Putting them in a Mod would force `core` to import from a
  plugin, violating `ARCHITECTURE.md` §6.
- **Wait until M10 to define them.** Rejected: the post-M7 roadmap
  explicitly says shared contracts should be reviewed before parallel
  development begins (§22).
- **Use a third-party secret-detection schema.** Rejected: existing
  schemas (Gitleaks, TruffleHog) are scanner-specific. We need a
  scanner-neutral `SecretFinding` so M11 can integrate Gitleaks as an
  optional extended scanner without making it the canonical format.

## Consequences

- `packages/contracts/src/runtime-guard/` and `.../secret-guard/` ship in
  0.6.0 as part of the contracts package.
- The M10 `sdlc-guard` Mod (when it lands) imports these contracts and
  wires them to Claude Code hooks; it does not redefine them.
- The M11 `secret-guard` Mod (when it lands) imports these contracts and
  wires them to file-write and git-operation hooks.
- The M11 baseline includes a pure-function secret detector in
  `core/secret-guard/` that uses the same `SecretFinding` contract. This
  lets us ship a working (if minimal) detector in 0.6.0, ahead of the full
  M11 Mod.
- Every contract here has zod schemas and round-trip tests in
  `packages/testing/src/validators/`.

## References

- Post-M7 roadmap §4 (M10), §5 (M11), §22 sequence 9
- `docs/security/SECURITY.md` §3, §4, §5
- `packages/contracts/src/runtime-guard/`
- `packages/contracts/src/secret-guard/`
- ADR-0009 (explicit approval and least privilege)
