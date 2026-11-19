# ADR-0007: The kit CLI is zero-dependency and ships prebuilt

Date: 2026-11-19 · Status: accepted

## Context

`kit verify` must run at moments when the environment may be hostile or
empty: a fresh clone before `npm install`, an offline laptop, a CI runner
with a locked-down registry. A CLI that needs `node_modules` at runtime fails
exactly when a gate is most needed. The installer copies the CLI into user
projects (`.ai/kit/`), so its supply-chain surface becomes the user's.

## Decision

The CLI depends only on the Node standard library (Node >= 18). `dist/` is
built with TypeScript and committed to the kit, so installation requires no
build step; the YAML profile is parsed by a strict, hand-rolled,
line-numbered subset parser instead of a YAML package. Tests run against the
built `dist/` (we test what we ship). Development dependencies (typescript,
@types/node) live behind `npm install` in `cli/` only.

## Consequences

- (+) Gates work offline and in fresh clones; zero transitive supply-chain
  risk in user projects; `kit audit`'s trustworthiness doesn't rest on the
  package registry it audits.
- (+) Fast, deterministic CI (build + node --test, no registry round-trips in
  the critical path beyond typescript).
- (−) `dist/` must be rebuilt and committed on every source change — enforced
  by CI (build then fail on dirty diff) and `scripts/check.sh`.
- (−) The YAML subset rejects full YAML (anchors, flow style) with explicit
  errors; accepted, because the profile schema is ours and strictness is a
  feature (typos in gate commands should fail loudly).
