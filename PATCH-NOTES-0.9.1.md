# Patch Notes 0.9.1 — Fail-Closed Guard Release

The theme of this patch: **every guard fails closed, and the kit owns only
what it created.** Five hardening changes landed on main after v0.9.0; this
release packages them.

---

## 1. secret-guard: unscanned input is never clean (#32)

The guard previously treated input it could not scan as clean. It now fails
closed: anything unscanned is treated as potentially secret-bearing, so a
scanner hiccup can no longer leak credentials through a "clean" verdict.

## 2. secret-guard: scan what a push actually publishes (#36)

New git-command parsing (`policies/command-parser.ts`,
`policies/git-command.ts`): instead of scanning raw push command strings, the
guard parses the git command line and scans the exact content a push would
publish — the same bytes the remote will receive.

## 3. CLI: plugin links belong to their creator (#33)

`kit install`/`kit skills uninstall` no longer adopt, record, or remove
plugin links the kit did not create. Ownership records are only written for
links the kit itself placed, so uninstalling can never destroy a user's own
wiring.

## 4. model-router: subagent classification from the event's own text (#35)

Subagent spawns are now classified from the spawn event's own text rather
than heuristics about the caller, keeping model-tier routing accurate when
agents spawn nested agents.

## 5. Documentation reconciliation (#34)

Stale docs were reconciled against the current commands, a single Claude
Code version baseline is stated once, and command-tested doc snippets are
now exercised rather than asserted.

---

## Version alignment

All workspace packages and plugin manifests move 0.9.0 → 0.9.1 (19 files:
root + 6 packages + 4 plugins × package.json/plugin.json + CLI version
constant + install ownership records + version-pinned dispatcher/doctor
tests).

## Companion packs

Unchanged since v0.9.0: node-agent-skills v0.11.0 (322 skills),
react-agent-skills v0.2.0 (129 skills), ruby-agent-skills v1.6.1 (104
skills, seam fix). The kit clones pack default branches at install time.

## Verification

CI matrix green on the merged main: verify (node 20/22 × ubuntu/macos), the
four committed fixtures, Claude plugin validation, shellcheck, GitGuardian,
live agent smoke test, and the documentation deploy.
