// plugins/model-router/hooks/register.ts
//
// model-router: model + effort routing for main turns (turn.step) and
// subagents (agent.spawn).
//
// Host contract (official docs, verified November 2026):
//   - turn.step STREAMS: the hook is an async generator. Delegation is
//     `const result = yield* next(e)` (forwarding every chunk) and a
//     rewrite is `yield* next({ ...e, model })` — returning next(e)
//     without yielding would hand the host a generator object instead of
//     the stream, so the generator form is not optional.
//   - agent.spawn: rewrite with `next({ ...e, model })`; e.resume is set
//     for resumed runs, whose changes the host IGNORES — skip them.
//
// Per post-M7 §6 the router starts in suggest-only mode: it logs its
// recommendation and changes nothing unless the policy says otherwise.
// The default policy's complexity/risk inputs are the heuristic baseline
// (medium/low) — there is no prompt classifier wired in this milestone,
// and suggest-only mode makes that honest: nothing is silently rerouted.
//
// Static-analysis rules honored here: full $.x.y(...) calls; string-literal
// event names; `$` passed only to getPolicy, a top-level function of this
// file; imports are relative files of this plugin plus 'claude-code' types.

import type { AgentSpawnEvent, ModsApi, On, TurnStepEvent } from 'claude-code';
import type { RoutingContext, RoutingPolicy } from '../policies/types';
import { route } from '../policies/router';

const DEFAULT_POLICY: RoutingPolicy = {
  schemaVersion: 1,
  id: 'default',
  version: '1.0.0',
  rules: [
    {
      id: 'R-simple',
      taskType: '*',
      complexity: 'low',
      risk: 'low',
      model: 'haiku',
      effort: 'low',
      verification: 'structural',
      reason: 'simple low-risk task: lightweight model + low effort',
    },
    {
      id: 'R-routing',
      taskType: '*',
      complexity: 'medium',
      risk: 'medium',
      model: 'sonnet',
      effort: 'medium',
      verification: 'tests',
      reason: 'routine engineering: balanced model + medium effort',
    },
    {
      id: 'R-architecture',
      taskType: '*',
      complexity: 'high',
      risk: 'high',
      model: 'opus',
      effort: 'high',
      verification: 'independent-review',
      reason: 'complex high-risk task: strongest reasoning + independent review',
    },
    {
      id: 'R-critical-risk',
      taskType: '*',
      complexity: '*',
      risk: 'critical',
      model: 'opus',
      effort: 'high',
      verification: 'mandatory-security',
      reason: 'critical risk: approval gate; model routing is irrelevant to authorization',
    },
  ],
  defaultModel: 'sonnet',
  defaultEffort: 'medium',
  suggestOnly: true,
};

function getPolicy($: ModsApi): RoutingPolicy {
  return $.state.get<RoutingPolicy>({ plugin: 'model-router', key: 'policy' }) ?? DEFAULT_POLICY;
}

function buildContext(scope: 'main-turn' | 'subagent'): RoutingContext {
  // Baseline heuristic context (no prompt classifier is wired in this
  // milestone): the default policy routes on it, and suggest-only mode is
  // the honest expression of that limitation.
  return {
    scope,
    taskType: 'general',
    complexity: 'medium',
    risk: 'low',
    requiredCapabilities: [],
    previousOutcome: 'none',
  };
}

export function register(on: On): void {
  // turn.step: main-turn model + effort routing (streaming event).
  on('turn.step', async function* ($, e: TurnStepEvent, next) {
    const policy = getPolicy($);
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
  on('agent.spawn', async ($, e: AgentSpawnEvent, next) => {
    // Resumed runs ignore event changes — do not touch them.
    if (e.resume) return next(e);
    const policy = getPolicy($);
    // Preserve an explicit model selection (post-M7 §6 invariant).
    if (e.model !== undefined) {
      $.ui.log(`model-router: subagent ${e.name ?? '<unnamed>'} keeps explicit model ${e.model}`);
      return next(e);
    }
    const decision = route(buildContext('subagent'), policy);
    if (policy.suggestOnly) {
      $.ui.log(`model-router: suggest subagent ${e.name ?? '<unnamed>'} model=${decision.model}`);
      return next(e);
    }
    $.ui.log(`model-router: apply subagent ${e.name ?? '<unnamed>'} model=${decision.model}`);
    return next({ ...e, model: decision.model });
  });
}
