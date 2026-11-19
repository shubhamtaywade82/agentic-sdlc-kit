# AGENTS.md — Node.js / TypeScript Library

> Source of truth for all AI assistants in this repo. Keep it short, accurate, current.
> Lines marked `# ADJUST` are defaults — change them to match your package.

## 1. Project Context
- **Product:** <one-line description>   # ADJUST
- **Package type:** library published to npm (ESM + types; CJS only if a consumer needs it)   # ADJUST
- **Stack:** TypeScript 5 (strict), Node 20+ (engines), Vitest, ESLint (typescript-eslint),
  Prettier, tsup (build), changesets or manual CHANGELOG   # ADJUST (pnpm/npm/bun)
- **Runtime deps:** keep near zero — every dependency is a public promise   # ADJUST
- **Key dirs:** `src/` (source, `src/index.ts` is the only entry), `test/` (unit + integration),
  `examples/` (runnable usage), `docs/` (API docs if generated)

### Commands
| Task | Command |
|---|---|
| Install | `pnpm install`   # ADJUST (npm install) |
| Build | `pnpm build` (tsup: dts + ESM) |
| Test (watch) | `pnpm test` / `pnpm test --watch` |
| One test file | `pnpm vitest run test/foo.test.ts` |
| Coverage | `pnpm test:coverage` |
| Lint | `pnpm lint` (eslint .) |
| Format | `pnpm format` (prettier --write .) |
| Type-check | `pnpm typecheck` (`tsc --noEmit`) |
| Pack preview | `pnpm pack --dry-run` (check what ships) |
| Release | manual: version bump → tag → `npm publish` — only with human approval |

### Do not touch
`dist/`, `node_modules/`, `coverage/`, `package-lock.json`/`pnpm-lock.yaml` by hand,
`.npmrc` auth tokens, `CHANGELOG.md` dates, CI workflows.

## 2. Operating Principles
1. Read the package's public API (`src/index.ts`) and existing tests before editing.
2. Ask up to 3 focused questions when requirements are ambiguous, then proceed with stated assumptions.
3. Plan first for anything > 1 file or > 50 lines; save it to `docs/plans/<slug>.md`.
4. One logical change per commit; keep diffs reviewable.
5. Test-first for all exported behavior. Bug fix = failing regression test first.
6. Run typecheck + lint + tests and show output before claiming done.
7. Follow existing patterns; check installed dependency versions before using newer APIs.
8. No silent scope creep — log unrelated issues in `docs/TODO.md`.

## 3. API & TypeScript Rules
- **Public API is sacred:** anything exported from `src/index.ts` is a semver promise.
  Breaking changes need an ADR and a major version.
- `strict: true`, `noUncheckedIndexedAccess: true`. No `any` — `unknown` + narrowing.
  No `@ts-ignore`; `@ts-expect-error` only with a reason comment.
- Types live next to code; every exported function has explicit return types.
- Validate untrusted input at the boundary (Zod or hand-written guards); keep validation
  OUT of hot internal paths.
- Prefer `type` aliases + discriminated unions over enums and inheritance.
- Expected failures: return typed results (`{ ok: true, data } | { ok: false, error }`);
  throw only for programming errors and truly exceptional cases.
- No default exports; named exports only (better tree-shaking and refactoring).
- Zero runtime dependencies by default. Adding one requires: justification (size, maintenance,
  license) + human approval + a line in the PR describing the alternative considered.
- Node API usage gated by `engines.node`; prefer stable APIs (`node:fs/promises`, `node:test`-free).

## 4. Concurrency & Side Effects
- Library code must not read config files, env vars, or global singletons at import time —
  configure via explicit options objects, inject the clock/randomness/filesystem.
- All I/O behind injectable interfaces so consumers can mock without module patching.
- Async APIs: prefer promises over callbacks; never fire-and-forget — return or propagate.
- Clean up resources (`close()`, `Symbol.asyncDispose`) and document who owns them.

## 5. Testing
- Unit tests for every exported function: happy path, edge cases (empty, unicode, max sizes),
  error paths, and property-based tests for parsers/serializers when applicable.
- Integration tests with real Node APIs in `test/integration/` (temp dirs for fs, localhost
  ports for network — never the public internet).
- No snapshot tests as the only coverage of logic; snapshots only for large serialized output.
- Coverage target: 100% of `src/` lines/branches is the aspiration; never merge below the
  configured thresholds.   # ADJUST
- Deterministic: fake timers, seeded randomness, no real network.

## 6. Publishing Rules
- `pnpm pack --dry-run` before every release; inspect the file list — nothing extra ships.
- `files` allowlist in package.json; `sideEffects: false` unless true.
- Exports map: `.` (ESM), `./package.json`. Types via `types` in exports.
- Version bump per semver: fix → patch, feature → minor, API break → major.
- CHANGELOG entry for every release; git tag `vX.Y.Z`; publish is a human-approved step.

## 7. Safety Boundaries (need explicit human approval)
- Pushing any branch, merging a PR, pushing to `main`, force-push, history rewrite.
- Creating/pushing git tags, `npm publish` / `npm dist-tag`, and any deploy — each one individually.
- Adding or upgrading runtime dependencies (state why: size, maintenance, license).
- Editing CI workflows, `tsup.config.*` output settings, or `package.json` `exports`/`engines`.
- Reading/printing `.npmrc`, npm tokens, or any secrets.

## 8. Definition of Done
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` green
- [ ] `pnpm build` succeeds and `pnpm pack --dry-run` shows the intended files
- [ ] New/changed exports have tests, explicit return types, and JSDoc where non-obvious
- [ ] No `any`, `console.log`, or debug code in the diff
- [ ] Breaking changes flagged with an ADR and major bump
- [ ] CHANGELOG updated; plan checkboxes ticked

## 9. Report Format
1. What changed (files + one line each)  2. Verification (commands + results)
3. Assumptions  4. Follow-ups / risks

## Kit integration
- Pattern implementations for this stack: `.ai/stack/patterns/` (see its README).
  Selection policy first: the `design-pattern-selection` skill's five questions.
- Quality gates for this stack live in `.ai/project.yml` (`quality.commands`) —
  keep them aligned with the Commands section above so `kit verify` matches
  the documented workflow. Run `node .ai/kit/bin/kit.js init` to (re)generate.
