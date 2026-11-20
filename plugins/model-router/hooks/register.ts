// plugins/model-router/hooks/register.ts
//
// Model Router Mod: intercepts turn.step (main-turn routing) and
// agent.spawn (subagent routing) to apply the routing policy.
//
// Per ADR-0015: routing logic is in policies/ (pure functions). The
// register function is thin.
//
// Per post-M7 §6: the router starts in suggest-only mode. It logs its
// recommendation but does not override the model unless suggestOnly is
// false in the policy.

import type { On, TurnStepEvent, AgentSpawnEvent } from '@agentic-sdlc-kit/mod-sdk';
import type { RoutingPolicy, RoutingContext } from '@agentic-sdlc-kit/contracts';
import { route } from '../policies/router.js';

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

function getPolicy($: {
  state: { get: <T>(ref: { plugin: string; key: string }) => T | undefined };
}): RoutingPolicy {
  return $.state.get<RoutingPolicy>({ plugin: 'model-router', key: 'policy' }) ?? DEFAULT_POLICY;
}

function buildContextFromTurn(scope: 'main-turn' | 'subagent'): RoutingContext {
  // The host exposes the prompt/request in the turn.step event; for the
  // contract surface we use a minimal context. A real classifier reads the
  // prompt and populates complexity/risk/requiredCapabilities.
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
  // turn.step: main-turn model + effort routing. turn.step is a streaming
  // event, so its hook takes the generator form — async function* — which
  // yields the chunks and returns the result. The router only decides the
  // model before the turn runs; it has no chunks of its own, so it returns
  // the delegated result directly.
  //
  // A pre-stream routing decision produces no chunks of its own; the
  // generator form is the host's required shape for streaming events, and
  // the result is the delegated next(...) return value.
  // eslint-disable-next-line require-yield
  on('turn.step', async function* ($, e: TurnStepEvent, next) {
    const policy = getPolicy($);
    const ctx = buildContextFromTurn('main-turn');
    const decision = route(ctx, policy);
    if (policy.suggestOnly) {
      $.ui.log(
        `model-router: suggest model=${decision.model} effort=${decision.effort} (${decision.reason})`,
      );
      return next(e);
    }
    $.ui.log(`model-router: apply model=${decision.model} effort=${decision.effort}`);
    return next({ ...e, model: decision.model, effort: decision.effort });
  });

  // agent.spawn: subagent model routing (per RESEARCH.md Switchboard reference).
  on('agent.spawn', async ($, e: AgentSpawnEvent, next) => {
    const policy = getPolicy($);
    // If the subagent already has a model, preserve it (explicit selection).
    if (e.model !== undefined) {
      $.ui.log(`model-router: subagent ${e.name ?? '<unnamed>'} keeps explicit model ${e.model}`);
      return next(e);
    }
    const ctx = buildContextFromTurn('subagent');
    const decision = route(ctx, policy);
    if (policy.suggestOnly) {
      $.ui.log(`model-router: suggest subagent ${e.name ?? '<unnamed>'} model=${decision.model}`);
      return next(e);
    }
    return next({ ...e, model: decision.model });
  });
}
