// packages/cli/src/application/agent/providers/claude-code/index.ts
//
// Barrel for the secure Claude Code provider (ADR-0019 PR4). The provider
// adapter boundary (Kit -> agent) is intentionally SEPARATE from the
// claude-code-adapter package, which remains the HOST adapter boundary
// (agent -> Kit); see ADR-0019 §2 and packages/claude-code-adapter/src/index.ts.

export {
  deriveClaudeCodePermissionConfig,
  inferCapabilityFromBashCommand,
  inferCapabilityFromToolUse,
  bashRulesForCapability,
  BASH_RULE_CAPABILITIES,
  CLAUDE_CODE_SUPPORTED_CAPABILITIES,
  type ClaudeCodePermissionConfig,
  type ClaudeCodePermissionMode,
} from './permission-config.js';
export { buildClaudeArgv, buildClaudeResumeArgv, CLAUDE_VERSION_ARGS, type ClaudeArgv } from './claude-argv.js';
export { ClaudeStreamParser, capabilityOfToolUse, type ClaudeFinalResult, type StreamObservation } from './stream-parser.js';
export {
  generateResumeToken,
  loadSessionRecord,
  saveSessionRecord,
  verifyResumeToken,
  type StoredSessionRecord,
} from './resume-store.js';
export { ensureRuntimeModsActive, type ModsParityResult } from './mod-parity.js';
export { ClaudeCodeProvider, type ClaudeCodeProviderOptions } from './provider.js';
