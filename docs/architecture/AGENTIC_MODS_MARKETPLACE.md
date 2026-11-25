# Agentic Mods Marketplace Architecture

Complements [ARCHITECTURE.md](./ARCHITECTURE.md), which defines the kit-wide
monorepo boundaries and invariants. This document covers the marketplace layer
added by the agentic-mods scaffold (mods/, marketplace packages, presets,
workflows and tooling).

```
contracts (no I/O)
   ├── core (no Claude Code APIs)
   ├── testing
   └── claude-code-adapter
core  ├── cli  ├── mod-sdk  └── @agentic-mods/sdlc-bridge
mod-sdk ── plugins/* and mods/*
sdlc-bridge ├── cockpit └── workflow-ui
```

Rules (to be enforced by an extended scripts/check-architecture.ts):
- cockpit imports contracts and sdlc-bridge only
- plugins/mods import contracts, core and mod-sdk only
- no plugin imports another plugin
- external adapters cannot import plugin internals
- no package imports from sibling dist/
- core cannot import Claude Code APIs; contracts cannot perform I/O
- command execution uses argument arrays with shell: false, never untrusted shell strings

Events are versioned, serializable, replayable, secret-free by default, scoped to
repository and session, and validated at runtime.
