/**
 * model-router — deterministic routing rules (pure policy, no $ usage).
 *
 * Deterministic rules first. An AI classifier ($.model.classify) is a
 * deliberate future extension, NOT enabled in v1 — routing decisions must be
 * explainable from configuration and agent names alone.
 *
 * Complexity and risk are two DIFFERENT dimensions: a simple database deletion
 * is low complexity but high consequence; a complex documentation analysis may
 * be high complexity but low operational risk. The tier heuristic below only
 * classifies the expected reasoning load of the agent's job (see README for
 * the 4-tier routing table incl. risk tiers).
 *
 * Pinned-model preservation: the main conversation model is never rewritten
 * unless `router.main.model` is explicitly configured, and subagent models are
 * only changed through explicit or keyword rules.
 */

export type Tier = 'fast' | 'balanced' | 'reasoning';

export type Effort = 'low' | 'medium' | 'high';

export interface AgentRule {
  /** Explicit model id, or "inherit" to keep the engine default. */
  model?: string;
  effort?: Effort;
}

/**
 * The `router:` block of .ai/project.yml, normalized. Canonical type lives here
 * (pure policy module); the vendored profile reader in policies/profile.ts
 * imports it type-only, so this file stays import-free and self-contained.
 */
export interface RouterConfig {
  enabled: boolean;
  /** Pinned model for the MAIN conversation only (never subagents). */
  main?: { model?: string };
  agents: { [agentName: string]: AgentRule };
}

export interface RouteDecision {
  /** Model id to switch to; undefined = leave the engine default. */
  model?: string;
  /** Recommended effort (currently informational; see README roadmap). */
  effort?: Effort;
  tier: Tier;
  reason: string;
}

function tierForEffort(effort: Effort | undefined): Tier {
  if (effort === 'high') return 'reasoning';
  if (effort === 'low') return 'fast';
  return 'balanced';
}

/**
 * Routing decision for a spawned agent, or null = don't touch.
 *
 * 1. Explicit `router.agents[name]` wins. `model: inherit` keeps the engine
 *    default model (only effort, if any, would apply).
 * 2. Otherwise a keyword heuristic on the agent name:
 *    reviewer|security|architect|review → reasoning (effort high)
 *    analyst|discovery|explor           → balanced (effort medium)
 *    lint|format|summar|index           → fast (effort low)
 * 3. Anything else → null (no interference).
 */
export function routeAgent(agentName: string, cfg: RouterConfig): RouteDecision | null {
  const name = agentName.toLowerCase();

  // 1. Explicit mapping.
  const rule = cfg.agents[agentName];
  if (rule !== undefined) {
    const model = rule.model !== undefined && rule.model !== 'inherit' ? rule.model : undefined;
    if (model === undefined && rule.effort === undefined) return null; // nothing to apply
    return {
      model,
      effort: rule.effort,
      tier: tierForEffort(rule.effort),
      reason: 'explicit mapping in .ai/project.yml',
    };
  }

  // 2. Keyword heuristic (most specific first).
  if (/reviewer|security|architect|review/.test(name)) {
    return {
      tier: 'reasoning',
      effort: 'high',
      reason: 'keyword heuristic: review/security/architecture agent',
    };
  }
  if (/analyst|discovery|explor/.test(name)) {
    return {
      tier: 'balanced',
      effort: 'medium',
      reason: 'keyword heuristic: analysis/discovery agent',
    };
  }
  if (/lint|format|summar|index/.test(name)) {
    return {
      tier: 'fast',
      effort: 'low',
      reason: 'keyword heuristic: mechanical agent',
    };
  }

  // 3. Don't touch.
  return null;
}

/**
 * Model override for a MAIN conversation model request, or null = pass through.
 * Returns a model only when `router.main.model` is configured AND differs from
 * `currentModel` — the model the engine is about to use (pinned-model
 * preservation: an interactively selected model is never rewritten).
 */
export function routeMain(
  currentModel: string | undefined,
  cfg: RouterConfig,
): { model: string } | null {
  const pinned = cfg.main !== undefined ? cfg.main.model : undefined;
  if (pinned === undefined || pinned === '') return null;
  if (pinned === currentModel) return null;
  return { model: pinned };
}
