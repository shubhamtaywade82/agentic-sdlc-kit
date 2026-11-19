# Tool Setup Guide

Adapters the kit installs and **verifies** (per the kit's own tests and docs):

| Tool | Reads | Notes |
|---|---|---|
| Claude Code | `CLAUDE.md`, `.claude/agents/`, `.claude/commands/kit/`, `.claude/skills/` | Use `/kit:init`, `/kit:app`, `/kit:feature`, `/kit:fix`, `/kit:review`, `/kit:release`. Skills load automatically when a task matches. Optional mods (`.ai/mods/`) with `claude --plugin-dir`. |
| Cursor | `.cursor/rules/*.mdc`, root `AGENTS.md` | Use Agent mode; rules apply by glob/always. @-mention plan/spec files for context. |
| Windsurf | `.windsurf/rules/*.md`, root `AGENTS.md` | `00-core.md` is `always_on`; stage docs live under `.ai/`. |
| GitHub Copilot (VS Code) | `.github/copilot-instructions.md` | Agent mode in VS Code; PR template auto-applies. |
| Gemini CLI / OpenCode | root `AGENTS.md` (+ `GEMINI.md` pointer for Gemini) | Native AGENTS.md readers. |

Any other tool that reads root `AGENTS.md` or the [Agent Skills](https://agentskills.io)
format will likely work too — those five are the ones this kit tests and documents.
The kit no longer claims untested adapters.

## MCP (Model Context Protocol)

Optional. See `.ai/mcp/README.md` after install (or `core/mcp/README.md` in the kit
repo): the kit ships its own read-only SDLC server plus a `.mcp.json.example` with
verified community servers (filesystem, github, playwright).

## Kit CLI

Every adapter (and CI) can run the deterministic gates: `node .ai/kit/bin/kit.js`
(`doctor`, `inspect`, `init`, `validate-spec`, `validate-plan`, `verify`, `audit`,
`changed`, `release-check`, `scaffold`). Zero dependencies, Node >= 18.

## Context hygiene tips
- One feature = one branch = one plan file. New session per task when context grows.
- @-reference specific files rather than "the whole repo".
- Keep AGENTS.md under ~150 lines; move detail to linked docs.
- When the AI repeats a mistake, add a one-line rule to AGENTS.md.

## Multi-agent parallel work
Tasks marked [P] in the plan can run in separate git worktrees:
```bash
git worktree add ../app-t3 -b feat/<slug>-t3
```
Run an implementer agent in each, then merge into the feature branch and run the reviewer.
