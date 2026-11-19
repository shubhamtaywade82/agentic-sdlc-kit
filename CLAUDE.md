# CLAUDE.md
Read and follow @AGENTS.md — it is the source of truth.

Claude-specific:
- Slash commands (namespaced): `/kit:init`, `/kit:app`, `/kit:feature`, `/kit:fix`, `/kit:review`, `/kit:release` — see `.claude/commands/kit/`.
- Sub-agents in `.claude/agents/`: repository-analyst, architecture-reviewer, code-reviewer, security-reviewer. Use them for discovery and independent review; implement in the main conversation.
- Skills in `.claude/skills/` (Agent Skills format): nine SDLC skills — they load automatically when the task matches.
- Run the deterministic gates: `node .ai/kit/bin/kit.js` (`validate-spec`, `validate-plan`, `verify`, `audit`, `changed`, `release-check`). Never claim success without the report.
- Use plan mode for any multi-file change. Use extended thinking for architecture and debugging.
- Prefer editing files over rewriting them. Run tests after every edit batch.
- Runtime mods (if installed): `.ai/mods/` — guard, routing, secrets, observability; they intercept risky tool calls and ask before migrations/deploys.
- If MCP servers from `.ai/mcp/.mcp.json.example` are configured, use them for file search, git history, and GitHub issues/PRs.
