// packages/mod-sdk reference: this Mod's register function is typed by
// @agentic-sdlc-kit/mod-sdk. The host runtime (Claude Code) provides the
// actual `on` and `$` at load time; the SDK's types are advisory.
//
// Per ADR-0015: policy evaluation is in policies/ (pure functions); the
// register function is thin and only wires events to policies.

import type { On, ToolCallEvent, ToolCheckEvent } from '@agentic-sdlc-kit/mod-sdk';
import { classifyShellCommand } from '../policies/shell-policy.js';
import { classifyGitCommand } from '../policies/git-policy.js';
import { evaluateAction } from '../policies/evaluator.js';
import type { PolicyContext } from '@agentic-sdlc-kit/contracts';

// Default context: interactive. The host or the installer can override
// this by setting state.sdlc-guard.context before the first event.
function getContext($: { state: { get: <T>(ref: { plugin: string; key: string }) => T | undefined } }): PolicyContext {
  const stored = $.state.get<PolicyContext>({ plugin: 'sdlc-guard', key: 'context' });
  if (stored) return stored;
  return { interactive: true };
}

export function register(on: On): void {
  // tool.check: permission decision (allow / ask / deny).
  on('tool.check', async ($, e: ToolCheckEvent, next) => {
    const tool = e.tool;
    // Only inspect Bash and Edit/Write tools; everything else passes through.
    if (tool !== 'Bash' && tool !== 'Edit' && tool !== 'Write') {
      return next(e);
    }
    const ctx = getContext($);
    // For Bash, classify the command.
    if (tool === 'Bash') {
      const command = (e.input as { command?: unknown }).command;
      if (typeof command !== 'string') return next(e);
      // Try git classification first, then shell.
      const action = classifyGitCommand(command) ?? classifyShellCommand(command);
      if (action === null) return next(e);
      const decision = evaluateAction(action, ctx);
      if (decision.verdict === 'deny') return 'deny' as const;
      if (decision.verdict === 'require-approval') return 'ask' as const;
      return next(e);
    }
    // For Edit/Write on protected paths, defer to the file policy.
    // (M10 ships the shell/git/migration policies; file-policy is M10-08.)
    return next(e);
  });

  // tool.call: pre-execution governance for Bash destructive commands.
  on('tool.call', { tool: 'Bash' }, async ($, e: ToolCallEvent, next) => {
    const command = (e.input as { command?: unknown }).command;
    if (typeof command !== 'string') return next(e);
    const action = classifyGitCommand(command) ?? classifyShellCommand(command);
    if (action === null) return next(e);
    const ctx = getContext($);
    const decision = evaluateAction(action, ctx);
    if (decision.verdict === 'deny') {
      $.ui.log(`sdlc-guard: denied ${action.category} — ${decision.reason}`);
      return { deny: `sdlc-guard: ${decision.reason}` };
    }
    if (decision.verdict === 'require-approval') {
      $.ui.log(`sdlc-guard: approval required for ${action.category}`);
      // Defer to the host's approval flow; the host asks the user.
      return next(e);
    }
    return next(e);
  });
}