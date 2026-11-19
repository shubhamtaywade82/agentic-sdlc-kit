# ADR-0002: One version, three components, one manifest

Date: 2026-11-19 · Status: accepted

## Context

The proposal (§2) wants modular installation (core / runtime / stacks) but
also warns against a "marketplace full of decorative dashboards" and version
skew. Our distribution today is a repo zip + installer, not a plugin
marketplace.

## Decision

Ship **one semver version for the entire kit** (5.0.0) with **three
installable components**: `sdlc-core` (default, includes the `kit` CLI),
`sdlc-runtime` (optional, `--runtime`), `sdlc-stacks` (selective, `--stack`).
`components.json` is the machine-readable registry; the installer records
every added path in `.ai/manifest` so uninstall is exact. Breaking changes to
installed layouts or contracts bump MAJOR with a migration guide.

## Consequences

- (+) No component version-skew matrix to maintain or test; contracts evolve
  atomically.
- (+) Users can adopt runtime governance independently of the workflow —
  and stay on core-only safely.
- (−) A stack-pack-only fix ships a whole kit release — acceptable at
  current scale; revisit if packs start moving at different speeds.
- (−) Marketplace per-plugin publishing (proposal §12) will require
  per-plugin version fields anyway; mods already carry their own
  `plugin.json` versions (kept in lockstep by CI checks).
