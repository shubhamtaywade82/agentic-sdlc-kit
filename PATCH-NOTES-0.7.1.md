# Patch Notes — agentic-sdlc-kit 0.7.1

## Fixes applied

All issues identified in the end-to-end review have been fixed.

### Bug fixes

1. **`stack-detector.ts` — unconditional `node-typescript` push (fixed)**
   - Plain JS projects with a `package.json` but no TypeScript are now correctly labeled `node`, not `node-typescript`.
   - The `isTs` guard now controls the `node-typescript` push; a separate `node` label is used for plain JS.

2. **`stack-detector.ts` — `..` lockfile probes (fixed)**
   - Removed parent-directory lockfile probes (`../pnpm-lock.yaml`, `../../pnpm-lock.yaml`, `../package-lock.json`, `../yarn.lock`).
   - Only probes within the scanned root now. Prevents mis-attribution of parent workspace lockfiles.

3. **`init.ts` — dead `--yes` flag (fixed)**
   - Removed `--yes` from the help text since there is no interactive confirmation step.
   - `--force` remains as the only overwrite flag.

4. **`process-runner.ts` — no stdout/stderr byte cap (fixed)**
   - Added `maxOutputBytes` option (default 10 MB).
   - stdout and stderr accumulation now stops at the cap and sets `truncated: true`.
   - Prevents OOM from runaway subprocesses before the timeout fires.

5. **Version mismatch (fixed)**
   - All `package.json` files now consistently report `0.7.1`.
   - The CLI `VERSION` constant updated to `0.7.1`.

### Stub/demo fixes

6. **`kit install` — was a stub that printed SUCCESS without installing (fixed)**
   - Now implements real installation: writes profile- specific files (`.ai-kit/project.yml`, `docs/` directory structure, `.gitkeep` sentinels).
   - Writes an `OwnershipManifest` at `.ai-kit/ownership-manifest.json` with SHA-256 per file, so `kit uninstall` can later remove only kit-owned files.
   - Supports `--dry-run` to preview planned operations without writing.
   - Idempotent: existing files are skipped (unless `.gitkeep`).

7. **TDD cycle in `feature-workflow.ts` — was simulated with hardcoded outcomes (fixed)**
   - Replaced `advance({ status: 'failed' })` / `advance({ status: 'passed' })` hardcoded strings with real `ProcessVerificationRunner` calls.
   - Red phase: runs verification before implementation (should fail).
   - Green phase: runs verification after implementation.
   - Refactor phase: runs verification again (behavior should be preserved).
   - All three phases use the actual project profile's test command with `shell: false`.

8. **`kit evolve` — was a demo with hardcoded inputs (fixed)**
   - Now reads from `.ai-kit/state/experiences.json` (produced by workflow runs).
   - If no experiences exist, exits with code 1 and an honest message: "no experience records found."
   - When experiences exist, distills real lessons, generates hypotheses, and runs the evolution lab.
   - Persists distilled lessons to `.ai-kit/state/memory.json`.

9. **`kit memory` — was a demo with one hardcoded entry (fixed)**
   - Now reads from `.ai-kit/state/memory.json` (produced by `kit evolve`).
   - If no memory exists, reports honestly: "no memory entries found."
   - Supports `--list` to list all entries; `--domain` to filter.
   - No longer seeds fake `MEM-BASE-001` data.

10. **`experience-collector.ts` — false redaction claim (fixed)**
    - Now actually calls `redactSecrets()` from the secret-guard module on `failureSummary` and `humanCorrection` fields.
    - The header comment's claim is now backed by real code.

11. **`hypothesis-engine.ts` — was a stub returning constant output (fixed)**
    - Output now depends on the input memory's domain and content.
    - Different failure patterns produce different hypotheses with targeted skills, changes, and benchmark tasks.
    - Verification failures → `tdd-bdd` skill; architecture issues → `system-design`; security concerns → `security-engineering`; test coverage gaps → `tdd-bdd` characterization.

12. **`distiller.ts` — was a near-placeholder (fixed)**
    - Now analyzes failures by stack + phase grouping.
    - Produces targeted lessons per failure pattern (e.g., "2 independent tdd failures on ruby-rails").
    - Confidence scales with failure count: 2 → 0.7, 3-4 → 0.8, 5+ → 0.9.
    - Only produces lessons for patterns with ≥2 independent failures.

13. **Learning persistence — was in-memory only (fixed)**
    - `MemoryStore` now has `saveToDisk()` and `loadFromDisk()` methods.
    - `ExperienceCollector` now has `saveToDisk()` and `loadFromDisk()` methods.
    - Both write atomically (tmp file + rename) to `.ai-kit/state/`.
    - `kit evolve` loads from and saves to these files.

14. **Evolution Lab benchmark runner — was an unimplemented seam (fixed)**
    - `kit evolve` now provides a concrete `BenchmarkRunner` implementation.
    - The runner evaluates the project's test command as a proxy for task pass rate.
    - Full Evolution Lab benchmark fixtures (M32) remain a future milestone, but the CLI surface is no longer a seam.

## Verification

- **Architecture gate**: OK — all invariants hold across 10 packages.
- **Build**: 10/10 packages built.
- **Typecheck + lint**: green.
- **Tests**: **485/485 across 10 packages** (was 482, +3 new tests for install dry-run and persisted memory/evolve).
- **CLI smoke**: all commands work correctly.
  - `kit install` writes real files + ownership manifest.
  - `kit install --dry-run` previews without writing.
  - `kit memory` reads from persisted store.
  - `kit evolve` reads from persisted experiences.
  - `kit init` on fixture correctly detects `node` (not `node-typescript`).
  - `kit inspect` shows correct stack.
