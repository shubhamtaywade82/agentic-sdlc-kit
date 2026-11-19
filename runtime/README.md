# Runtime governance layer — Claude Code Mods

This directory is the **runtime governance layer** of the Agentic SDLC Kit
(`sdlc-runtime`, the optional installable component). It contains the kit's
Claude Code **Mods** — runtime plugins that control execution, intercept tool
events and enforce engineering policy.

## Layer separation (why this is not "more prompts")

| Layer | Contents | Responsibility |
| --- | --- | --- |
| 1. Intelligence | Skills · Agents · Commands · pattern knowledge | Determines *what work* should happen and how |
| 2. Engineering automation | TypeScript scripts · validators · test runners · CLI | Deterministic operations, verifiable evidence |
| 3. Runtime governance | **Mods (this directory)** · tool policies · model routing · lifecycle observers | Controls execution, intercepts supported events, enforces runtime policies |
| 4. Knowledge & state | Specs · ADRs · plans · test evidence · release records | Preserves decisions across sessions |

A mod is not a replacement for a Skill, an Agent, an MCP server or a script —
each has a different responsibility, and the kit preserves that boundary.
Per the Claude Code docs (<https://code.claude.com/docs/en/plugins/mods/>), a
mod IS a plugin: `.claude-plugin/plugin.json` manifest, `hooks/hooks.json`
pointing at a `register.ts` entry point, and pure policy modules under
`policies/` that host no runtime side effects.

## The four mods

| Mod | Priority | Responsibility |
| --- | --- | --- |
| [`sdlc-guard/`](sdlc-guard/) | P0 | Destructive operations, protected files, Git and migration governance |
| [`model-router/`](model-router/) | P0 | Model and effort routing for subagents and the main conversation |
| [`secret-guard/`](secret-guard/) | P0 | Secret detection, write/commit checks, redaction primitives |
| [`run-observer/`](run-observer/) | P1 | Tool/turn/agent execution telemetry, tokens, `/kit:status` |

Each mod is **self-contained** (no imports across mod directories; every mod
vendors its own minimal `.ai/project.yml` reader) and fail-safe by design:

- **Deny-class policy fails CLOSED**: force push is denied, protected paths
  still apply, secret writes are refused, and gating hooks chain `.catch()`
  so a timeout or crash *refuses* rather than allows.
- **Observation-class policy fails SILENT**: run-observer never blocks, and a
  broken observer is invisible (no `.catch` chains; swallowed, once-logged
  errors).
- **Routing-class policy fails OPEN (pass-through)**: model-router with no or
  invalid configuration touches nothing.

## Trust model — read this first

Claude Code Mods run with the **host's full machine privileges**. They are NOT
an isolated security sandbox; actual isolation requires OS permissions,
containers or similar execution boundaries. Treat mods as *contextual
governance for agent sessions*, not as a security boundary:

- Org admins can install org-level mods; users control what loads per session.
- Static Git protections should ALSO be enforced with native Git configuration
  and permissions (`receive.denyNonFastForwards`, protected branches,
  server-side pre-receive hooks). sdlc-guard is a tripwire in the agent's
  loop, not a replacement for the server.

## Project profile (shared contract)

Mods read `.ai/project.yml` from the session working directory (absent →
documented defaults). The schema is shared with the kit CLI — the CLI is the
strict validator; mods are tolerant readers that ignore unknown keys (future
schema evolution) and fall back to defaults on any parse doubt:

```yaml
version: 1
project:
  name: example-app
  mode: existing            # existing | greenfield
policies:
  tdd: required             # required | optional (CLI-validated; mods ignore)
  approvals:
    migrations: required    # required | not-required
    deployment: required    # required | not-required
    forcePush: prohibited
  protectedPaths:           # unioned onto guard.protectedPaths
    - secrets/**
guard:
  protectedPaths:           # explicit list replaces the defaults below
    - .github/workflows/**
    - .git/**
    - .env
    - .env.*
    - *.pem
    - *.key
router:
  enabled: false            # default; router also activates on any agents entry
  main:
    model: claude-sonnet-4-5
  agents:
    security-reviewer:
      model: claude-opus-4-6
      effort: high
observer:
  enabled: true             # default
```

Defaults when no profile: `approvals.migrations=required`,
`approvals.deployment=required`, `forcePush=prohibited`,
`guard.protectedPaths=[.github/workflows/**, .git/**, .env, .env.*, *.pem,
*.key]` (plus `.git/**` always), `router.enabled=false`, `observer.enabled=true`.

The YAML subset reader (vendored per mod, ~90 lines) supports nested 2-space
maps, `- item` string sequences indented under their key, quoted/plain
scalars, comments and blank lines. Anything else — tabs, odd indentation, flow
syntax (`{…}`), anchors — is a parse error → defaults.

## Install

```bash
# copy the mods into a project (kit installer, runtime component)
kit installer --runtime          # copies to .ai/mods/<name>
```

Load per session:

```bash
claude --plugin-dir .ai/mods/sdlc-guard

# multiple mods (leading ':' appends to the existing plugin dirs)
CLAUDE_CODE_PLUGIN_DIRS=":.ai/mods/sdlc-guard:.ai/mods/secret-guard" claude
```

Or publish the plugins to a marketplace and enable them via
`.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "sdlc-guard@agentic-sdlc-kit": true,
    "model-router@agentic-sdlc-kit": true,
    "secret-guard@agentic-sdlc-kit": true,
    "run-observer@agentic-sdlc-kit": true
  }
}
```

**Version requirement:** Claude Code **>= 2.1.287** for the hook API used
here. Newer releases add richer event fields (usage, `isTeammate`, `agentId`)
and slash-command registration; where a field is missing the mods degrade
gracefully (the observer logs once and skips that field).

## How to test

```bash
# per-mod integration tests (run on the developer machine, not CI):
claude plugin test sdlc-guard/
claude plugin test secret-guard/
claude plugin test run-observer/
claude plugin test model-router/

# policy unit tests + hooks typecheck (this repo, node-based):
cd runtime && npm install && npm test
```

`npm test` runs three steps:
1. `tsc -p tsconfig.hooks.json` — typechecks all four `hooks/register.ts`
   files against the minimal ambient mod-API declarations in
   `runtime-tests/mod-api.d.ts` (a dev harness only; Claude Code provides the
   real types at runtime and `claude plugin validate` does the real
   static analysis).
2. `tsc -p tsconfig.test.json` — compiles only `*/policies/*.ts` +
   `runtime-tests/*.spec.ts` to `.build/`.
3. `node --test .build/runtime-tests/*.spec.js` — the policy specs
   (node:test + node:assert/strict). The glob is explicit because Node's
   test runner does not discover `*.spec.js` files from a bare directory
   argument (and directory arguments are not searched at all on Node ≥ 22).

TypeScript in plugins must stay **erasable-only** (types/interfaces/type
aliases fine; no enums, namespaces, parameter properties) because Claude Code
loads `.ts` hooks directly with no build step — `hooks/register.ts` files
import policies with explicit `.ts` extensions for the same reason.

## What deliberately does NOT live in mods

Do not put things into mods just because the API permits interception:

- PRD generation, architecture documentation, design-pattern recommendations
- Test case generation, feature planning
- Changelog creation, API documentation, release notes

Those belong to Skills, templates and deterministic scripts (layers 1 and 2).
Mods are for runtime governance only — anything that genuinely needs
interception of tool/turn/session events.

## Roadmap

- **Model classifier** — optional `$.model.classify`-based routing as an
  opt-in extension on top of model-router's deterministic rules.
- **Output redaction** — post-result redaction in secret-guard.
- **gitleaks integration** — external scanner hook for secret-guard.
- **Dashboard** — only AFTER the event-data and execution-state contracts
  stabilize (do not build the dashboard first).
