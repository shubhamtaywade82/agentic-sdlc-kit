// plugins/sdlc-guard/hooks/register.ts
//
// sdlc-guard: destructive-operation governance as a Claude Code mod.
//
// Host contract (official docs, verified November 2026):
//   - tool.call { tool: 'Bash' }: the command is e.command (tool arguments
//     are FIELDS of the event). Deny by returning { deny } without calling
//     next; ask the user by awaiting $.ui.ask BEFORE next (an unanswered or
//     dismissed question refuses the command).
//   - tool.check { tool: 'Bash' }: the arguments are under e.input; answer
//     with { decision: 'allow' | 'ask' | 'deny', reason? }.
//   - Both registrations chain .catch(...) so a throw or timeout REFUSES
//     the command instead of letting it through (the host otherwise skips
//     a failed hook — fail-open — which is exactly what a guard must not
//     do).
//
// Static-analysis rules honored here: every mods API call is written in
// full ($.ui.log, $.ui.ask, $.state.get); event names are string literals;
// `$` is never assigned or destructured, and is passed only to getContext,
// a top-level function of this same file.
//
// Per ADR-0015: policy evaluation is in policies/ (pure functions); the
// register function is thin and only wires events to policies.

import type { ModsApi, On, ToolCallEvent, ToolCheckEvent } from 'claude-code';
import { classifyGitCommand } from '../policies/git-policy';
import { classifyShellCommand } from '../policies/shell-policy';
import { evaluateAction } from '../policies/evaluator';
import type { PolicyContext } from '../policies/types';

// Default context: interactive. The host or the installer can override
// this by setting state.sdlc-guard.context before the first event.
function getContext($: ModsApi): PolicyContext {
  const stored = $.state.get<PolicyContext>({ plugin: 'sdlc-guard', key: 'context' });
  if (stored) return stored;
  return { interactive: true };
}

export function register(on: On): void {
  // tool.check: permission decision (allow / ask / deny) for Bash calls.
  // The tool's arguments live under e.input for this event.
  on('tool.check', { tool: 'Bash' }, async ($, e: ToolCheckEvent, next) => {
    const command = e.input.command;
    if (typeof command !== 'string') return next(e);
    const action = classifyGitCommand(command) ?? classifyShellCommand(command);
    if (action === null) return next(e);
    const ctx = getContext($);
    const decision = evaluateAction(action, ctx);
    if (decision.verdict === 'deny') {
      return { decision: 'deny', reason: `sdlc-guard: ${decision.reason}` };
    }
    if (decision.verdict === 'require-approval') {
      return { decision: 'ask', reason: `sdlc-guard: ${decision.reason}` };
    }
    return next(e);
  }).catch(() => ({
    decision: 'deny',
    reason: 'sdlc-guard: internal error — refusing (fail closed)',
  }));

  // tool.call: pre-execution governance for Bash destructive commands.
  // The command is a field of the event: e.command.
  on('tool.call', { tool: 'Bash' }, async ($, e: ToolCallEvent, next) => {
    const command = e.command;
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
      // Ask the user; start from the safe answer so an unanswered question
      // (dismissed dialog, headless run) REFUSES the command.
      $.ui.log(`sdlc-guard: approval required for ${action.category}`);
      let answer = 'Refuse';
      try {
        answer = await $.ui.ask(
          `sdlc-guard: ${action.category} requires approval — run this command?\n${command}`,
          ['Run it', 'Refuse'],
        );
      } catch {
        // Dismissed, or nobody to ask (e.g. a headless run): refuse.
      }
      if (answer !== 'Run it') {
        $.ui.log(`sdlc-guard: user refused ${action.category}`);
        return { deny: `sdlc-guard: ${action.category} declined — ${decision.reason}` };
      }
      $.ui.log(`sdlc-guard: user approved ${action.category}`);
      return next(e);
    }
    return next(e);
  }).catch(() => ({ deny: 'sdlc-guard: internal error — refusing (fail closed)' }));
}
