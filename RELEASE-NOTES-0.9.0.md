# Release Notes — agentic-sdlc-kit 0.9.0

## Theme: Skills-pack integration, zero-footprint setup, hardened installs

0.8.0 shipped the evidence-gated TDD engine. 0.9.0 turns the kit into a
platform: the three agent-skills packs are first-class citizens, hosts can
attach without touching the target repository, and the installer is hardened
end to end. 27 commits since v0.8.0.

### 1. Agent-skills packs integration (PRs #20, #27, #29; #30)

- New `kit skills` command family: list, show, for-stack, recommend (per SDLC
  stage), and install. The registry maps `ruby-agent-skills` (104 skills),
  `node-agent-skills` (322), and `react-agent-skills` (129) onto kit stacks
  and workflow stages; packs are fetched from their GitHub default branch at
  install time and recorded per-commit in `.ai-kit/skills-manifest.json`.
- The installer is staged and atomic: plan → validate (containment, symlink
  refusal, frontmatter) → commit with rollback; hardened against path
  traversal and unowned-directory deletion (PRs #27/#29), with regression
  tests.
- New `kit skills uninstall` removes only files the kit owns.
- Registry counts corrected to the measured state (node 322, react 129,
  re-measured 2026-11-25) across registry, CLI output, README, and docs
  (#30). Every workflow-stage skill mapping is verified to exist in its pack.

### 2. Zero-footprint host setup (PRs #22, #23, #24, #26)

- `kit attach` + `KIT_STATE_DIR`: state, reports, and skills land outside the
  target repository; `kit init` creates its directories under the state dir.
- Plugin marketplace: the kit installs the four Claude Code Mods
  (sdlc-guard, secret-guard, model-router, run-observer) as a marketplace,
  validating hook module paths before linking.
- The standing agent procedure is installed into AI hosts
  (CLAUDE.md/AGENTS.md wiring) instead of being prose-only documentation.

### 3. Evidence-gated engine breadth (PRs #19, #21, #25)

- Red-phase classification now recognizes Playwright, pytest, and `go test`
  failure output as Red-eligible, not just Node tooling.
- `kit fix` drives defects through the same evidence-gated feature engine
  (Red → Green → Refactor with journaled evidence); defect docs updated to
  match.
- New `fixtures/react-spa` plus a React e2e CI lane exercising `kit verify`
  end to end on a committed fixture.

### 4. Secret guard: DhanHQ + JWT rules in core (PR #28)

- `jwt-token` and `dhan-credential` rule kinds ported from the plugin into
  core/contracts; core and the vendored plugin now carry the same three rule
  sets with shared test cases. Placeholder values (`your_...`, `changeme`,
  `example`, `${VAR}`, `<...>`) are excluded, and a generic
  `dhan-credential-generic` rule catches other dhan-style assignments with
  overlap-safe redaction.

### 5. Operations and reliability

- `KIT_TIMEOUT_MS` supported; default verify timeout raised to 18 minutes.
- run-observer: `observe` now fails silently (telemetry never blocks), and
  the follow-up verify breakage was fixed the same day.
- trace-store: idCounter made private, with regression tests.
- README links the live VitePress documentation site on GitHub Pages.

## Version alignment

All workspace packages and plugin manifests move 0.8.0 → 0.9.0 (17 files:
root + 6 packages + 4 plugins × package.json/plugin.json + CLI version
constant + install ownership records).

## Companion packs

The kit never bundles pack content; it clones the pack default branch at
install time. For a coherent 0.9.0 checkout, the companion packs release at:
node-agent-skills v0.11.0 (322 skills), react-agent-skills v0.2.0 (129
skills, structural alignment + agent-* enrichment), ruby-agent-skills v1.6.1
(104 skills, seam fix: rails-to-react-client → react-rails-integration).

## Verification

- CI matrix green on main: verify (node 20/22 × ubuntu/macos), the four
  committed fixtures (node smoke, ruby, rails, react e2e), Claude plugin
  validation, shellcheck, GitGuardian, and the live agent smoke test.
- Documentation deploy green; the site renders the current docs.
