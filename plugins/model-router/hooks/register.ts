// plugins/model-router/hooks/register.ts
//
// model-router: model + effort routing for main turns (turn.step) and
// subagents (agent.spawn).
//
// Host contract (official engine declarations, verified against
// @anthropic-ai/claude-code 2.1.329 — see
// .claude-plugin/types/claude-code/index.d.ts):
//   - turn.step STREAMS: the hook is an async generator. Delegation is
//     `const result = yield* next(e)` (forwarding every chunk) and a
//     rewrite is `yield* next({ ...e, model })` — returning next(e)
//     without yielding would hand the host a generator object instead of
//     the stream, so the generator form is not optional.
//   - agent.spawn: rewrite with `next({ ...e, model })`; e.resume is set
//     for resumed runs, whose changes the host IGNORES — skip them.
//   - state flows through the official atom/read/update helpers. NOTE:
//     an offline `claude plugin validate` run types the atom ref against
//     an EMPTY PluginState (its checker does not merge this plugin's
//     contract) and so flags the atom() line above the same way it flags
//     Claude Code's own turn-band example mod — the real engine lays the
//     merged declarations at .claude-plugin/types/claude-code/index.d.ts
//     and the same line typechecks cleanly there.
//
// Static-analysis rules honored here: full $.x.y(...) calls; string-literal
// event names; `$` passed only to getPolicy, a top-level function of this
// file; imports are relative files of this plugin plus 'claude-code'.

import type { AgentSpawnInput, EngineInterface, On, TurnStepInput } from 'claude-code';
import { atom, read } from 'claude-code';
import type { RoutingContext, RoutingPolicy } from '../policies/types';
import { buildRoutingContext } from '../policies/classifier';
import { classifyText } from '../policies/signals';
import { route } from '../policies/router';
import { DEFAULT_POLICY } from '../policies/default-policy';

// The policy state key, declared in contract.d.ts. read() resolves to
// the stored policy or the module default (initial) when unset.
const POLICY = atom({ plugin: 'model-router', key: 'policy' } as const, DEFAULT_POLICY);

async function getPolicy($: EngineInterface): Promise<RoutingPolicy> {
  return read($, POLICY);
}

function buildContext(scope: 'main-turn' | 'subagent'): RoutingContext {
  // Baseline context, used when the event carries nothing to classify. The
  // main turn always uses it: turn.step exposes the model and effort but no
  // prompt text (`request` is untyped on the engine), so classifying it would
  // mean guessing its shape. Suggest-only mode is the honest default.
  return {
    scope,
    taskType: 'general',
    complexity: 'medium',
    risk: 'low',
    requiredCapabilities: [],
    previousOutcome: 'none',
  };
}

/**
 * Context for a subagent spawn, from the text the event really carries
 * (description, name, subagentType). No recognised signal keeps the baseline.
 */
function spawnContext(e: AgentSpawnInput): { ctx: RoutingContext; because: string } {
  const text = [e.description, e.name, e.subagentType]
    .filter((part): part is string => typeof part === 'string')
    .join(' ');
  const found = classifyText(text);
  if (found === null) return { ctx: buildContext('subagent'), because: '' };
  return {
    ctx: buildRoutingContext('subagent', found.input),
    because: ` because: ${found.evidence.join(', ')}`,
  };
}

export function register(on: On): void {
  // turn.step: main-turn model + effort routing (streaming event). The
  // effort rewrite keeps the official union (level names or a number).
  on('turn.step', async function* ($, e: TurnStepInput, next) {
    const policy = await getPolicy($);
    const decision = route(buildContext('main-turn'), policy);
    if (policy.suggestOnly) {
      $.ui.log(
        `model-router: suggest model=${decision.model} effort=${decision.effort} (${decision.reason})`,
      );
      // Forward the stream unchanged and return the finished result.
      const result = yield* next(e);
      return result;
    }
    $.ui.log(`model-router: apply model=${decision.model} effort=${decision.effort}`);
    return yield* next({ ...e, model: decision.model, effort: decision.effort });
  });

  // agent.spawn: subagent model routing.
  on('agent.spawn', async ($, e: AgentSpawnInput, next) => {
    // Resumed runs ignore event changes — do not touch them.
    if (e.resume) return next(e);
    const policy = await getPolicy($);
    // Preserve an explicit model selection (post-M7 §6 invariant).
    if (e.model !== undefined) {
      $.ui.log(`model-router: subagent ${e.name ?? '<unnamed>'} keeps explicit model ${e.model}`);
      return next(e);
    }
    const { ctx, because } = spawnContext(e);
    const decision = route(ctx, policy);
    if (policy.suggestOnly) {
      $.ui.log(
        `model-router: suggest subagent ${e.name ?? '<unnamed>'} model=${decision.model}${because}`,
      );
      return next(e);
    }
    $.ui.log(`model-router: apply subagent ${e.name ?? '<unnamed>'} model=${decision.model}${because}`);
    return next({ ...e, model: decision.model });
    // Fail open: routing is advisory, never a safety gate. If the handler or
    // the downstream chain throws, return nothing so the host proceeds with
    // the original, un-routed spawn instead of blocking it.
  }).catch(() => undefined);
}
