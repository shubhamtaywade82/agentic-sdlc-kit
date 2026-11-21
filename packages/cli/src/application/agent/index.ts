// packages/cli/src/application/agent/index.ts
//
// M36 Mode 1 (kit-orchestrated) execution surface, PR3 (ADR-0019 §4):
// the agent gateway, the execution store it persists to, the git-worktree
// workspace manager, and the feature orchestrator that drives the
// EXISTING core TDD state machine through a configured provider.
//
// No new packages (ADR-0019 §4): everything lives in the CLI application
// layer. Providers are INJECTED via AgentGatewayOptions — the shipped CLI
// registers none, so `kit feature <id> run` fails with
// AGENT_PROVIDER_NOT_CONFIGURED until PR4 configures claude-code.

export * from './execution-store.js';
export * from './gateway.js';
export * from './workspace.js';
export * from './orchestrator.js';
