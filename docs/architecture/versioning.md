# Versioning and Compatibility

## One version, all components

The kit ships as a single version (5.0.0) across all components — `sdlc-core`
(workflows, commands, skills, agents, MCP), the `kit` CLI, `sdlc-runtime`
(mods), and every `sdlc-stacks` pack. Components are install units, not
independent products: their contracts (profile schema, report schema, spec/plan
formats, secret patterns) evolve together and are validated by the same
regression suite.

`components.json` at the kit root is the machine-readable registry (names,
sources, optionality) that the installer and `check.sh` verify.

## Compatibility policy

| Requirement | Minimum | Notes |
|---|---|---|
| Node.js (kit CLI) | 18 | Zero runtime dependencies; `dist/` is committed |
| Claude Code (mods) | 2.1.287 | Mods API baseline; some fields documented for ≥ 2.1.304 degrade gracefully |
| Bash (installers) | 3.2 (macOS) / 5 (Linux) | POSIX-safe constructs only; shellcheck-clean |
| MCP (optional server) | Node 18 + npm ci | Built by the user; inert until then |

Adapter support (commands/rules mapping): Claude Code, Cursor, Windsurf,
GitHub Copilot, Gemini CLI / OpenCode — the five tested adapters. The kit does
not claim support for untested hosts.

## SemVer for the kit

- **MAJOR**: breaking changes to installed layouts, profile/report/spec
  schemas, or command names (v4 → v5 is major: directory taxonomy, command
  set, and doc paths changed — see `migration-v4-to-v5.md`).
- **MINOR**: new skills/commands/mods/stack packs, additive schema fields
  (validators must tolerate older files), new CLI subcommands.
- **PATCH**: content fixes, pattern/reference improvements, CI repairs.

Installed-kit compatibility: `kit doctor` reports the installed manifest and
CLI version; a version mismatch between `.ai/manifest` and the CLI is a FAIL
signal (re-run the installer for the same version to reconcile).

## Release evidence for the kit itself

The kit dogfoods its own gates: a v-tagged release of ai-dev-kit requires a
green CI run (shellcheck, full regression suite, CLI tests, runtime policy
tests, MCP build + smoke) — the same Definition of Done it prescribes.
