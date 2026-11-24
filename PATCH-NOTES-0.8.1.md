# Patch Notes — 0.8.1

Security-hardened patch line for 0.8.0. This tag is retroactive: `v0.8.1`
marks the final 0.8.x tree — the merge of PR #29, by which the four
external-review findings on `kit skills install` and their regression suite
had landed — because v0.9.0, which folds the same hardening in, shipped
first. The notes below describe exactly what v0.8.1 contains; the Ollama
Cloud CI agents and the Release workflow landed after v0.9.0 and are not
part of this tag (see the last section).

## Security (skills install hardening — PR #27)

External review findings, verified against the 0.8.0 code, all fixed fail-closed:

1. (Critical) `--into` was joined with `path.join` and never contained: an
   agent- or user-supplied `--into ../../outside` (or an absolute path)
   escaped the project and received skill writes, and `--force` then
   recursively deleted same-named directories at the escaped location.
2. (Critical) `--force` ran `fs.rm(recursive)` on ANY existing skill
   directory, deleting and replacing content the kit never installed
   (including user-authored skills).
3. (High) `readManifest()` swallowed parse failures and returned a fresh
   manifest which the installer wrote back, silently erasing the records of
   every previously installed pack.
4. (High) pack content was copied with `fs.cp` (symlinks preserved) with no
   SKILL.md contract validation — an external pack is untrusted content.

Fix architecture (`skills-install-secure` / `-manifest` / `-commit` / `-report`
modules keep each file under the 300-line convention):

- `resolveInstallTarget`: `--into` must resolve strictly inside the project
  (and name a subdirectory, not the root); checked even for `--dry-run`.
- `assertPathSymlinkFree`: every destination path component is `lstat`'d; a
  symlinked component is a hard error, so planted links cannot redirect kit
  writes.
- The manifest is the ownership record: `--force` replaces only directories
  recorded as `installed` for the same `--into`; everything else that exists
  is reported as `Refused: N unowned skill(s)` and left untouched. Ownership
  survives idempotent re-runs via a status merge.
- Installation is staged under `.ai-kit/tmp`, validated there (secure copier
  rejecting symlinks and special file types; every staged `SKILL.md` must
  carry frontmatter whose name matches its directory plus a description), and
  committed per-skill with renames, replaced directories moved aside first.
  A failed commit rolls back; if the rollback itself fails, the staging
  directory is kept and named in the error for manual recovery.
- `readSkillsManifest`: a missing manifest starts fresh; a manifest that
  exists but is malformed (bad JSON or wrong shape, per-record validated)
  fails the install with a recovery instruction and is never overwritten.
- `listSkillDirs` rejects symlinked entries at the `skills/` root and unsafe
  skill directory names.

## Regression tests (PR #29)

Eleven zero-network security regressions against local `--source` fixtures
(the suite needs no network):

- `--into` traversal / absolute / project-root rejection — and for
  `--dry-run` too.
- Symlinked destination component.
- Corrupt-manifest and wrong-shape-manifest fail-closed without
  overwriting.
- `--force` refusing unowned directories while user content survives
  byte-for-byte.
- Ownership surviving idempotent re-runs.
- Symlinked pack content; symlinked `skills/` root entry.
- Missing frontmatter / name mismatch / unsafe directory names.

## Also in this tag (merged to main before the 0.9.x line started)

- `kit uninstall` — removes files and plugin links created by
  `kit install`, deleting only unchanged files (user-edited files are
  retained); supports `--dry-run` to preview actions.
- `KIT_TIMEOUT_MS` environment support and a raised default verify timeout
  (180s), so long-running project test suites no longer produce false
  timeout failures.
- run-observer `observe()` now fails silently instead of disrupting user
  interaction (with the follow-up that restored a green verify), and
  TraceStore issues IDs even when the instance is frozen by the host.

## Verification

- Full `pnpm run verify` (architecture check, milestone check, build, lint,
  typecheck, all workspace tests) green on this tree: CLI package 29 files /
  216 tests.

## Not in v0.8.1 (shipped after v0.9.0)

- Ollama Cloud CI agents — advisory PR review + bounded failure autofix
  (`tools/ci-agent` + three workflows) — and the automated Release
  workflow. They ride the 0.9.x line.
