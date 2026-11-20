# Patch Notes — agentic-sdlc-kit 0.7.2

## Fixes applied

Follow-up to the 0.7.1 corrective release, addressing the findings of the
20 November re-review of `main` at `3f02398`.

### Bug fixes

1. **`generator.ts` — `node --test tests/` crashes on Node >= 24 (fixed)**
   - The project-profile generator emitted `['node', '--test', 'tests/']` for
     plain-JavaScript projects using `node:test`. On Node 24 and newer, the
     test runner treats a bare directory argument as a module path, so the
     command fails with `Cannot find module '.../tests'`.
   - The generator now emits `['node', '--test']` (auto-discovery), which
     works on Node 18.13 through 24+, finds `**/*.test.?(c|m)js` files, and
     excludes `node_modules`.
   - Verified empirically on Node v24.22.3: the old command crashes inside
     `fixtures/fixture-node-fullstack`; the new command passes 3/3 tests.

2. **Fixture instructions and script carried the broken command (fixed)**
   - `fixtures/fixture-node-fullstack/package.json` test script,
     `AGENTS.md`, and `README.md` now use `node --test`.

3. **Fixture golden profile was stale on two counts (fixed)**
   - `fixtures/fixture-node-fullstack/.ai-kit/project.yml` declared the stack
     as `node-typescript`, contradicting the merged 0.7.1 stack-detector fix
     (plain-JS projects are `node`), and carried the broken test command.
   - Regenerated against real `kit init` output at 0.7.2: stack `node`,
     test command `['node', '--test']`. The explanatory header is preserved.

4. **`init.ts` — stale `--yes` in the header comment (fixed)**
   - 0.7.1 removed the dead `--yes` flag from the help text but not from the
     file header comment. The comment now matches the actual usage line.

5. **Version alignment (fixed)**
   - All 11 `package.json` manifests, the CLI `VERSION` constant, the
     installer's `packageVersion`, and the version-asserting tests now
     consistently report `0.7.2`.

## What this patch does NOT change

- The feature-workflow TDD implementation handoff and the Evolution Lab
  placeholder benchmarks remain open P0 items (re-review findings B and C).
  They are deliberate follow-up work, not regressions of this patch.

## Verification

- **Build**: 10/10 packages.
- **Tests**: 485/485 across 10 packages (`pnpm install --frozen-lockfile`,
  `pnpm build`, `pnpm test` on Node v24.22.3).
- **CLI smoke**:
  - `kit init` on a copy of `fixture-node-fullstack` reports `Stack: node`
    and emits `["node","--test"]`.
  - `node --test` inside the fixture passes 3/3 on Node v24.22.3 (the
    previously emitted `node --test tests/` crashed).
