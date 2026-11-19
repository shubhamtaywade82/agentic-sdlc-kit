# Review Response — ai-dev-kit v4.0.0

This release answers the independent review of `ai-dev-kit (3).zip` dated 2026-11-18.
Every finding below lists the fix and the regression test that fails if the defect reappears.
Run the suite yourself: `bash tests/run-tests.sh` (also run by `bash scripts/check.sh` and CI).

## Critical — Installer follows symlinks in managed target directories

**Fix.** `scripts/install.sh` now:
1. rejects a symlinked target root before doing anything else;
2. walks every managed subpath (`.claude/agents`, `.claude/commands`, `.claude/skills`,
   `.cursor/rules`, `.windsurf/rules`, `.github`, `.ai`, `docs/prd|specs|plans|adr`)
   component by component and aborts if ANY component is a symlink or a non-directory —
   all of this in a verification phase that runs BEFORE a single byte is written;
3. skips (never writes through) an existing file target, including dangling symlinks
   (`[ -e "$dst" ] || [ -L "$dst" ]` guard);
4. re-verifies each directory immediately before descending into it during the copy phase.

**Tests.** `symlink_attack` runs eight attacks (target root, `.claude`, `.cursor`, `.ai`,
`.github`, `.windsurf`, `docs`, nested `docs/specs`); each asserts: install exits non-zero,
the outside "victim" directory receives **zero** files, and no partial writes happened in
the target. A separate test proves a dangling symlink at `.claude/commands/tdd.md` is
skipped, not followed.

## High — Existing user instructions are modified even when the installer says "skip"

**Fix.** The installer no longer runs transformations over target files at all. It stages
the entire install tree in a private `mktemp` directory, applies the path rewriting
(`workflows/` → `.ai/workflows/` etc.) to the **staged kit copies only**, then copies
staged files into the target with skip-if-exists semantics. Pre-existing files are never
read, rewritten, or touched.

**Tests.** A pre-existing `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`,
`.claude/commands/mine.md`, `.claude/agents/mine.md`, `.cursor/rules/mine.mdc`, and
`.windsurf/rules/mine.md` — all containing kit-relative `workflows/`, `templates/`,
`prompts/`, `checklists/` references — are compared by SHA-256 before and after install
and must be byte-identical, while the installer announces `skip (exists):` for each.

## High — The self-check passes despite both installer safety defects

**Fix.** `scripts/check.sh` now delegates installer verification to `tests/run-tests.sh`:
~90 assertions across 13 groups — symlink escape (8 attacks), byte preservation (8 files),
dangling-sylmlink skip, destination creation/missing-parent/non-directory, unknown and
missing options, `--stack` validation (both forms), stack content, paths with spaces,
idempotent re-install (zero `added:` lines, unchanged hashes), manifest integrity,
installed `.ai/` reference resolution, approval-gate language, uninstall behavior
(removal, user-file preservation, dry-run, missing manifest, symlinked root), license,
README adapter claims, CI SHA pinning, and Agent Skills spec compliance.
CI additionally runs the suite on **both ubuntu-latest and macos-latest**, with ShellCheck
on `scripts/` and `tests/`, and a separate MCP job (npm ci → build → stdio smoke test).

## Medium — Non-existent destination directories fail

**Fix.** The installer creates a missing target directory when its parent exists (and the
parent is validated first), and fails with a clear message naming the parent when it does
not. The target root is then resolved to a physical path.

**Tests.** "creates missing target when parent exists", "fails when parent is missing"
(asserts the error mentions the parent and that nothing was created), and "fails when
target is a file".

## Medium — Claude TDD command uses `${ARGUMENTS:-...}`

**Fix.** `commands/tdd.md` now uses plain `$ARGUMENTS` (the documented form), with the
fallback stated as an ordinary instruction: "If no plan path was given, find the most
recent plan in `docs/plans/` ...".

**Tests.** The suite greps the installed command for `Plan: $ARGUMENTS` and asserts
`${ARGUMENTS` appears nowhere in `commands/`.

## Medium — Project-root instruction references written with a leading slash

**Fix.** `.cursor/rules/00-core.mdc`, `.github/copilot-instructions.md`, and the new
`.windsurf/rules/00-core.md` and `GEMINI.md` all say "the repository-root `AGENTS.md`"
(plain relative reference) instead of `/AGENTS.md`. Cursor and Copilot docs both define
project paths as relative to the repository root.

**Tests.** Kit-level and installed-copy assertions that `/AGENTS.md` appears in none of
the adapters.

## Medium — Release workflow lacks explicit approval gates

**Fix.** The approval requirement is now named per action and stated identically in four
places: `AGENTS.md` §6 (push/merge; tags & releases; deployment; destructive git; data;
secrets; environment), every stack `AGENTS.md` safety section, `commands/ship.md`
(no push/merge/tag/deploy without explicit confirmation; each remote action needs its own
approval), and `workflows/08-release.md` (merge, tag, release publish, deploy each
individually approved). AGENTS.md also tells agents to stop and ask when any instruction
seems to pre-authorize these.

**Tests.** Installed `AGENTS.md`, `workflows/08-release.md`, and `commands/ship.md` are
grepped for the approval language.

## Medium — CI checkout action behind current release

**Fix.** `.github/workflows/check.yml` uses
`actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` — the verified full commit SHA
of v7.0.1 (github.com/actions/checkout/releases/tag/v7.0.1) — pinned in all steps, plus a
comment naming the release. The v3 YAML typo (`branches: ain]`) is also fixed
(`branches: [main]`), and the job matrix was extended to ubuntu-latest + macos-latest as
the review's remediation plan recommended.

**Tests.** The suite asserts the workflow pins `actions/checkout@` to a 40-hex-char SHA.

## Medium — No license included

**Fix.** `LICENSE` (MIT, "ai-dev-kit contributors") ships in the kit root; `README.md`
links it; `CHANGELOG.md` records it; the bundled skills and the MCP server declare
`license: MIT` in their metadata/package manifests.

**Tests.** "LICENSE exists and is MIT".

## Low — README claims broader support than the shipped adapters

**Fix.** The README now names exactly the five tested adapters — Claude Code, Cursor,
Windsurf, GitHub Copilot, Gemini CLI / OpenCode — and ships an adapter for each:
`.claude/*` (commands/agents/skills + CLAUDE.md pointer), `.cursor/rules/*.mdc` (+ native
root `AGENTS.md`), `.windsurf/rules/*.md`, `.github/copilot-instructions.md`, and root
`AGENTS.md` + `GEMINI.md`. Codex, Cline, Aider, and Perplexity claims were removed.
`docs/TOOL_SETUP.md` matches. Other `AGENTS.md` readers are described as "likely works,
not tested" rather than claimed.

**Tests.** The suite asserts the README documents each of the five adapters and does not
mention Perplexity as a supported tool.

## Review's remediation order — status

1. Symlink traversal + boundary tests — **done** (8 attack tests, victim-directory canary).
2. Transform only staged files; prove byte-identical — **done** (SHA-256 assertions).
3. Real test suite so both defects fail before release — **done** (`tests/run-tests.sh`, wired into check.sh + CI, both defects now fail the suite on v3 code).
4. `/tdd` substitution + `/AGENTS.md` references — **done** (documented `$ARGUMENTS`; relative references only).
5. Explicit, consistent merge/tag/release/deploy gates — **done** (AGENTS.md, all stacks, ship command, release workflow).
6. Pin `actions/checkout`; add license; narrow claims — **done** (v7.0.1 SHA, MIT, five tested adapters).
7. CI on Linux and macOS; smoke-test in real clients — **CI done** (matrix + MCP job); in-client smoke testing is recommended next (see below).

## Still open (honest limits)

- **In-client verification:** the kit's tests cover install/uninstall/MCP protocol
  behavior, but running `/feature` in a live Claude Code session and Agent mode in Cursor
  and Windsurf on a sample project is the final manual step the review asked for and
  remains recommended after this release.
- **ShellCheck in CI** gates on `--severity=error`; locally the scripts pass default
  severity too, but CI uses the error gate.
