// packages/cli/src/application/agent/providers/claude-code/claude-argv.ts
//
// Claude Code headless argv builder (ADR-0019 PR4; ADR-0020 §6).
//
// ADR-0020 §6.1/§6.2: the provider process is spawned with an allowlisted
// executable + ARGV ARRAY, `shell: false` — never a shell string, never
// model-generated shell. This module is a PURE function over the request:
// same request in, same argv out; every flag is derived from the canonical
// policy (via permission-config) or the frozen request.
//
// Headless mode (Claude Code `-p` / --print) with `--output-format
// stream-json --verbose` emits newline-delimited JSON lifecycle events the
// provider parses (stream-parser.ts) — a final `result` object carries the
// status, session id, and usage the provider normalizes into the honest
// AgentExecutionResult.
//
// SECURITY INVARIANT: `--dangerously-skip-permissions` and
// `--permission-mode bypassPermissions` are NEVER emitted — asserted here
// and pinned by provider tests (ADR-0019 §6.5, ADR-0020).

import type { AgentExecutionRequest } from '@agentic-sdlc-kit/contracts';
import {
  deriveClaudeCodePermissionConfig,
  type ClaudeCodePermissionConfig,
} from './permission-config.js';

export interface ClaudeArgv {
  /** The full argv for the claude CLI (argv[0] is the executable; this is argv.slice(1)). */
  readonly args: readonly string[];
  /** The derived permission config, exposed for tests and audit assertions. */
  readonly permissionConfig: ClaudeCodePermissionConfig;
}

/** Build the headless invocation for one execution (pure). */
export function buildClaudeArgv(request: AgentExecutionRequest): ClaudeArgv {
  const config = deriveClaudeCodePermissionConfig(request.permissions, request.budget);

  const args: string[] = [
    // Headless (print) mode: one bounded, non-interactive execution.
    '-p',
    request.instructions,
    '--output-format',
    'stream-json',
    // stream-json in print mode requires verbose output.
    '--verbose',
    // The generated runtime policy representation (ADR-0020 §2).
    '--permission-mode',
    config.permissionMode,
  ];

  if (config.allowedTools.length > 0) {
    args.push('--allowedTools', config.allowedTools.join(','));
  }
  if (config.disallowedTools.length > 0) {
    args.push('--disallowedTools', config.disallowedTools.join(','));
  }
  if (config.maxTurns !== undefined) {
    // Defense in depth on the turn count; the GATEWAY enforces the real
    // maxToolCalls from tool.requested events (gateway-enforced, honestly
    // declared). Claude Code hitting --max-turns first is surfaced as a
    // BUDGET_EXCEEDED failure, never silent continuation.
    args.push('--max-turns', String(config.maxTurns));
  }

  assertNeverBypassesPermissions(args);
  return { args, permissionConfig: config };
}

/** Build the headless RESUME invocation (cross-process, PR4). */
export function buildClaudeResumeArgv(executionId: string, sessionId: string): ClaudeArgv {
  // The gateway owns the original request and never re-submits it
  // (revision A). The provider only knows how to continue the provider
  // session: a bounded continuation prompt addressed by session id.
  const args = [
    '-p',
    `Continue the interrupted agent execution ${executionId}. Complete the pending work; ` +
      `do not start unrelated work. Finish and report what remains done.`,
    '--output-format',
    'stream-json',
    '--verbose',
    '--resume',
    sessionId,
    // A resumed session is as bounded as the original one: minimal tool
    // surface, no subagents, no network unless the caller re-grants it via
    // the gateway's resume path (which validates policy before calling).
    '--disallowedTools',
    'Task,WebFetch,WebSearch',
  ];
  assertNeverBypassesPermissions(args);
  return { args, permissionConfig: deriveMinimalResumeConfig() };
}

function deriveMinimalResumeConfig(): ClaudeCodePermissionConfig {
  return {
    allowedTools: [],
    disallowedTools: ['Task', 'WebFetch', 'WebSearch'],
    permissionMode: 'default',
    maxTurns: undefined,
  };
}

/**
 * Fail closed at build time if any bypass flag ever slips in. This is an
 * implementation assertion, not just a test: PR4 is security-critical and
 * this invariant is cheap to guarantee at the source.
 */
function assertNeverBypassesPermissions(args: readonly string[]): void {
  for (const arg of args) {
    if (arg.includes('bypassPermissions') || arg.includes('--dangerously-skip-permissions')) {
      throw new Error(
        'claude-code provider invariant violated: permission bypass flags are never ' +
          'generated (ADR-0019 §6.5). Refusing to build the invocation.',
      );
    }
  }
}

/** Health-probe argv (no execution, no permissions surface). */
export const CLAUDE_VERSION_ARGS: readonly string[] = ['--version'];
