# Contributing to the AI Dev Kit

Thanks for helping improve the kit. This guide covers how the kit is organized, the rules
for each kind of file, and how to test and submit a change.

## Ways to contribute
- Fix a prompt, rule, or checklist that gives the AI wrong or vague guidance
- Add a new stack (e.g. Django, Laravel, Go, Phoenix)
- Add a workflow, prompt, template, agent role, or slash command
- Improve the installer or check script
- Report a problem: open an issue with the tool you used (Claude Code, Cursor, Copilot, etc.),
  what you asked, what the AI did, and what you expected

## How the kit is organized
| Path | What it is | Installed to |
|---|---|---|
| `components.json` | Component registry (core/cli/runtime/stacks, one version) | not installed |
| `AGENTS.md` | Generic agent rules | `AGENTS.md` (no `--stack`) |
| `stacks/<name>/AGENTS.md` | Stack-specific agent rules | `AGENTS.md` (`--stack <name>`) |
| `stacks/<name>/patterns/` | Stack pattern pack (22 GoF per language) | `.ai/stack/<name>/patterns/` |
| `stacks/<name>/.cursor/rules/` | Stack-specific Cursor rules | `.cursor/rules/` |
| `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursor/rules/`, `.windsurf/rules/` | Tool adapters | same paths |
| `core/agents/` | Sub-agent roles (4, read-only analysis) | `.claude/agents/` |
| `core/commands/kit/` | Slash commands (6) | `.claude/commands/kit/` |
| `core/skills/` | Agent Skills (9, agentskills.io) | `.claude/skills/<name>/` |
| `core/workflows/`, `core/prompts/`, `core/templates/`, `core/checklists/` | Process docs | `.ai/<folder>/` |
| `core/docs/` | Kit guides (tool setup, skills) | `.ai/docs/` |
| `core/mcp/` | MCP server + `.mcp.json.example` | `.ai/mcp/` |
| `cli/` | kit CLI (TypeScript, zero runtime deps, committed `dist/`) | `.ai/kit/` |
| `runtime/` | Claude Code mods (4 plugins) | `.ai/mods/` (`--runtime`) |
| `docs/` | Architecture, contracts, ADRs, migration guides (kit repo docs) | not installed |
| `core/templates/PR.md` | PR template for projects using the kit | `.github/pull_request_template.md` |
| `scripts/` | `install.sh`, `uninstall.sh`, `check.sh` | not installed |
| `tests/` | Installer regression suite + MCP smoke test | not installed |
| `.github/workflows/check.yml` | CI for this kit's own repo | not installed |

## Writing guidelines

**General**
- Write instructions for an AI reader: direct, specific, imperative ("Run X", "Never Y").
- Prefer one clear rule over a paragraph. If a rule needs an example, give a short one.
- Stay tool-agnostic in shared files. Tool-specific details go in the adapter for that tool.
- Reference other kit files by their kit path (`templates/PR.md`, `checklists/security.md`).
  The installer rewrites these to `.ai/...` automatically, so don't write `.ai/` paths yourself
  except in `stacks/*/AGENTS.md`, which are copied as-is.
- Don't pin exact library versions unless needed; say "Rails 8.x" rather than "8.0.2".
- No secrets, real company names, or personal data in examples.

**AGENTS.md files**
- Keep them under ~200 lines. Move long detail into `workflows/` or `checklists/`.
- Keep the shared section order: Project Context → Operating Principles → Conventions →
  Testing → Git & PRs → Safety Boundaries → Definition of Done → Report Format.
- Mark every assumption the user may need to change with `# ADJUST`.
- Every command listed must be a real, runnable command for that stack.

**Agents (`core/agents/*.md`)** need front matter with `name`, `description` (when to use it), and
`tools`. Give each agent one role and say what it must not do. Keep the inventory at four
read-only analysis roles — implementation is the primary agent's job (ADR-0003).

**Commands (`core/commands/kit/*.md`)** need front matter with `description` (and `argument-hint` if they
take input). Use the documented plain `$ARGUMENTS` form for user input (never
`${ARGUMENTS:-...}` shell-style expansion) and point to the matching workflow. The file name
becomes `/kit:<name>` (directory namespace).

**Agent Skills (`core/skills/<name>/SKILL.md`)** follow the open spec (agentskills.io):
frontmatter `name` (lowercase/hyphens, ≤ 64 chars, must match the folder) and `description`
(≤ 1024 chars, says what it does and when to use it); body under 500 lines; depth goes in
`references/`, scripts in `scripts/`, assets in `assets/`. See `core/docs/skills.md`.
Reference kit paths the same way as other shared files; the installer rewrites them.

**kit CLI (`cli/`)** — TypeScript, zero runtime dependencies, Node ≥ 18. `dist/` is committed:
run `npm install && npm test` (builds + tests) and commit a rebuilt `dist/` with your change.
Contracts (profile, verification report, spec/plan formats, secret patterns) are documented
in `docs/architecture/contracts/` — change them only with an ADR.

**Runtime mods (`runtime/<name>/`)** — each a self-contained Claude Code plugin
(`.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.ts`, `policies/`, `tests/`).
Policy logic goes in `policies/` (pure, unit-tested); hooks stay thin. Every denying hook
chains `.catch` (fail closed). Erasable TypeScript only (no enums/namespaces). Validate
the plugin shape against the official docs; policy tests run via `cd runtime && npm test`.

**MCP server (`core/mcp/server/`)** is TypeScript on `@modelcontextprotocol/server`, stdio-only,
read-only (no fs/network side effects). After changing it: `cd core/mcp/server && npm install &&
npm run build`, then `node tests/mcp-smoke.mjs` from the kit root. Never log to stdout
(it carries JSON-RPC) — use `console.error`.

**Cursor rules (`*.mdc`)** need front matter with `description` and either `globs` or
`alwaysApply`. Keep each rule file short and focused on one area.

## Adding a new stack
1. Create `stacks/<name>/AGENTS.md` by copying the closest existing stack.
2. Fill in real commands (setup, dev, test, single test, lint, format, type-check, migrate),
   conventions, testing rules, safety boundaries, and definition of done.
3. Add 2–4 Cursor rules in `stacks/<name>/.cursor/rules/`, numbered `30-` and up.
4. Make sure the stack's safety section lists push/merge, tag/release, and deploy as
   human-approval actions (keep it consistent with `AGENTS.md` §6).
5. Add a "Stack setup: <Name>" section to `README.md` with install, dependencies, config,
   verification commands, and a first `/kit:feature` example. Include `--stack <name>`.
6. Add the stack's pattern pack under `stacks/<name>/patterns/` (copy the closest existing
   set; see `stacks/rails-ts/patterns/README.md` for the two-set layout).
7. Try it on a real (or fresh) project for that stack and confirm every listed command runs.

## Testing your change
```bash
bash scripts/check.sh
```
This checks that scripts parse and pass ShellCheck, the component structure is valid
(exactly 6 commands / 9 skills / 4 agents / 4 mods / 4 stacks, fail-closed hooks,
Agent Skills spec rules, CI SHA pinning), builds and runs the kit CLI test suite,
typechecks and runs the runtime policy tests, and — most importantly — runs the full
installer regression suite in `tests/run-tests.sh`: symlink-escape attacks, byte
preservation of pre-existing files, destination creation, argument handling,
component selection (`--stack`, `--runtime`), idempotency, manifest/uninstall behavior,
and installed-content correctness. If you changed `core/mcp/server/`, also run
`node tests/mcp-smoke.mjs` after building it.

The same check runs automatically on every pull request through GitHub Actions
(`.github/workflows/check.yml`) on Linux and macOS, along with ShellCheck and the MCP
build + smoke test. A PR can't be merged until it passes once branch protection requires
the check jobs.

For prompt or rule changes, also try them in at least one AI tool on a sample project and
note the result in your PR.

## Submitting a pull request
1. Fork and create a branch: `feat/<slug>`, `fix/<slug>`, or `docs/<slug>`.
2. Make focused changes; one topic per PR.
3. Use conventional commits, e.g. `feat(stacks): add django stack`, `fix(prompts): clarify debug steps`.
4. Run `bash scripts/check.sh`.
5. Update `README.md` if you added or renamed anything users see.
6. Open the PR and fill in the template.

## Review process
A maintainer checks that the change is accurate, tool-agnostic where it should be, consistent
with existing files, and tested. Small fixes are usually merged quickly; new stacks may need a
round of feedback on commands and conventions.
