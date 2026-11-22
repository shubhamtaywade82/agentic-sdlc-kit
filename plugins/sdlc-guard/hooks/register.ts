// plugins/sdlc-guard/hooks/register.ts
//
// sdlc-guard: destructive-operation governance as a Claude Code mod.
//
// Host contract (official engine declarations, verified against
// @anthropic-ai/claude-code 2.1.329 — see
// .claude-plugin/types/claude-code/index.d.ts):
//   - tool.call { tool: 'Bash' }: the command is e.command (tool arguments
//     are FIELDS of the event, narrowed to the Bash variant by the
//     matcher). Deny by returning { deny } without calling next; ask the
//     user by awaiting $.ui.ask BEFORE next (an unanswered or dismissed
//     question refuses the command).
//   - tool.check { tool: 'Bash' }: the arguments are under e.input —
//     untyped on the official engine, so read via a checked cast; answer
//     with { decision: 'allow' | 'ask' | 'deny', reason? }.
//   - Both registrations chain .catch(...) so a throw or timeout REFUSES
//     the command instead of letting it through (the host otherwise skips
//     a failed hook — fail-open — which is exactly what a guard must not
//     do).
//   - state flows through the official atom/read/update helpers. NOTE:
//     an offline `claude plugin validate` run types the atom ref against
//     an EMPTY PluginState (its checker does not merge this plugin's
//     contract) and so flags the atom() line above the same way it flags
//     Claude Code's own turn-band example mod — the real engine lays the
//     merged declarations at .claude-plugin/types/claude-code/index.d.ts
//     and the same line typechecks cleanly there.
//
// Static-analysis rules honored here: every mods API call is written in
// full ($.ui.log, $.ui.ask); event names are string literals; `$` is never
// assigned or destructured, and is passed only to getContext, a top-level
// function of this same file.
//
// Per ADR-0015: policy evaluation is in policies/ (pure functions); the
// register function is thin and only wires events to policies. Bash is
// classified by tokens (policies/classify.ts), not substrings, so split flags,
// +refspec pushes, wrappers and sh -c bodies are seen.

import type { EngineInterface, On } from 'claude-code';
import { atom, read } from 'claude-code';
import { decideBash } from '../policies/decision';
import type { PolicyContext } from '../policies/types';

// The context state key, declared in contract.d.ts. read() resolves to
// the stored context or the interactive default when unset.
const CONTEXT = atom(
  { plugin: 'sdlc-guard', key: 'context' } as const,
  {
    interactive: true,
  } as PolicyContext,
);

async function getContext($: EngineInterface): Promise<PolicyContext> {
  return read($, CONTEXT);
}

export function register(on: On): void {
  // tool.check: permission decision (allow / ask / deny) for Bash calls.
  // The tool's arguments live under e.input for this event (untyped on
  // the official engine).
  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const input = e.input as { command?: unknown } | undefined | null;
    const command = input?.command;
    if (typeof command !== 'string') return next(e);
    const decision = decideBash(command, await getContext($));
    if (decision.kind === 'deny') return { decision: 'deny', reason: decision.reason };
    if (decision.kind === 'ask') return { decision: 'ask', reason: decision.reason };
    return next(e);
  }).catch(() => ({
    decision: 'deny',
    reason: 'sdlc-guard: internal error — refusing (fail closed)',
  }));

  // tool.call: pre-execution governance for Bash destructive commands.
  // The command is a field of the event: e.command (the matcher narrows e
  // to the Bash variant).
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = e.command;
    if (typeof command !== 'string') return next(e);
    const decision = decideBash(command, await getContext($));
    if (decision.kind === 'deny') {
      $.ui.log(`sdlc-guard: denied — ${decision.reason}`);
      return { deny: decision.reason };
    }
    if (decision.kind === 'ask') {
      // Ask the user; start from the safe answer so an unanswered question
      // (dismissed dialog, headless run) REFUSES the command.
      $.ui.log(`sdlc-guard: approval required — ${decision.reason}`);
      let answer = 'Refuse';
      try {
        answer = await $.ui.ask(
          `${decision.reason} — run this command?\n${command}`,
          ['Run it', 'Refuse'],
        );
      } catch {
        // Dismissed, or nobody to ask (e.g. a headless run): refuse.
      }
      if (answer !== 'Run it') {
        $.ui.log('sdlc-guard: user refused the command');
        return { deny: `${decision.reason} — declined by the user` };
      }
      $.ui.log('sdlc-guard: user approved the command');
      return next(e);
    }
    return next(e);
  }).catch(() => ({ deny: 'sdlc-guard: internal error — refusing (fail closed)' }));
}
