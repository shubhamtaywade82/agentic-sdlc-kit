// packages/cli/src/application/agent/index.ts
//
// M36 Mode 1 (kit-orchestrated) execution surface, PR3+PR4 (ADR-0019 §4):
// the agent gateway, the execution store it persists to, the git-worktree
// workspace manager, the feature orchestrator that drives the EXISTING
// core TDD state machine through a configured provider, and — since PR4 —
// the secure Claude Code provider that fills the injection seam.
//
// No new packages (ADR-0019 §4): everything lives in the CLI application
// layer. Providers are INJECTED via AgentGatewayOptions; the shipped CLI
// registers claude-code (PR4), whose healthCheck fails honestly (exit 3,
// never a silent fallback) when the claude CLI is missing.

export * from './execution-store.js';
export * from './gateway.js';
export * from './workspace.js';
export * from './orchestrator.js';
export * from './providers/claude-code/index.js';
