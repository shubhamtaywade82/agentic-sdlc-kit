# MCP — Model Context Protocol integration

The kit speaks [MCP](https://modelcontextprotocol.io) so any MCP-capable assistant
(Claude Code, Cursor, Windsurf, VS Code Copilot agent mode, Gemini CLI, ...) can use
its lifecycle knowledge and standard developer servers.

## What ships here

| Path | What it is |
|---|---|
| `server/` | **ai-dev-kit-sdlc** — the kit's own MCP server (TypeScript, stdio, read-only) |
| `.mcp.json.example` | Ready-to-copy project config: our server + community servers |

## The bundled server: ai-dev-kit-sdlc

Five read-only tools (no filesystem, network, or side effects):

| Tool | Purpose |
|---|---|
| `sdlc_stages` | The 10 lifecycle stages (v5) + three execution modes, with inputs, outputs, and gates |
| `sdlc_workflow` | Full workflow for one stage (steps + exit gate) |
| `sdlc_next_stage` | What comes after the current stage and its entry criteria |
| `sdlc_template` | Markdown templates: PRD, tech spec, task plan, PR, ADR, bug report, changelog |
| `sdlc_checklist` | Checklists: definition-of-done, code-review, security, performance, release |

### Build and enable

```bash
# from the project root where the kit is installed (use mcp/ instead of .ai/mcp/ in the kit repo)
cd .ai/mcp/server
npm install
npm run build
```

Then copy the config and restart your assistant:

```bash
cp .ai/mcp/.mcp.json.example .mcp.json   # from the project root
```

`.mcp.json` is project-scoped: every MCP-capable assistant working in the repo can
pick it up. Review what you copy — remove servers you do not use.

### Verify

In the kit repo: `node tests/mcp-smoke.mjs` (handshake + tools/list + tool calls).
In an installed project: check the client — `/mcp` in Claude Code, `cursor mcp list`
in Cursor.

## Community servers in the example

| Server | Package (verified on npm at kit v4 release) | Use for |
|---|---|---|
| filesystem | `@modelcontextprotocol/server-filesystem` | Bounded file read/search |
| github | `@modelcontextprotocol/server-github` | Issues, PRs, reviews (needs a token in env) |
| playwright | `@playwright/mcp` | Browser automation and e2e verification |

More servers and the current catalog: <https://modelcontextprotocol.io/servers>.
Note: an official `@modelcontextprotocol/server-git` no longer exists on npm —
prefer your assistant's built-in git/bash tools for history queries.

## Safety

- MCP servers run with your permissions. Read what a server does before enabling it.
- Never put tokens directly in `.mcp.json`; reference environment variables.
- The kit's `sdlc` server is inert and read-only — it only returns kit content.
- The kit's approval gates (push/merge/tag/release/deploy) still apply to anything
  an MCP server executes on your behalf.
