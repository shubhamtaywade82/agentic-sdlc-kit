// plugins/model-router/policies/advise.ts
//
// Turns a prompt into an advisory line when the routing table would pick a
// model other than the default. Claude Code hooks cannot switch the model, so
// the output is context for the agent, not an enforced routing decision.

import { buildRoutingContext } from './classifier.js';
import { DEFAULT_POLICY } from './default-policy.js';
import { route } from './router.js';

const PRODUCTION = /\b(prod|production)\b/i;
const DESTRUCTIVE = /\b(delete|drop|truncate|destroy|force[- ]push|rm -rf|reset --hard)\b/i;
const SECURITY = /\b(auth|oauth|jwt|crypto|password|secret|token|credential)s?\b/i;
const FILE_TOKEN = /[\w./-]+\.[a-z]{1,5}\b/gi;

export function estimateFileCount(prompt: string): number {
  return new Set(prompt.match(FILE_TOKEN) ?? []).size;
}

/** The advisory text for escalating prompts, or null otherwise. */
export function adviseForPrompt(prompt: string): string | null {
  const ctx = buildRoutingContext(
    'main-turn',
    {
      prompt,
      touchesProduction: PRODUCTION.test(prompt),
      destructive: DESTRUCTIVE.test(prompt),
      securitySensitive: SECURITY.test(prompt),
      estimatedFileCount: estimateFileCount(prompt),
    },
  );
  // Advise only on escalation. Suggesting a cheaper model for every trivial
  // prompt would add noise to each turn without changing any outcome.
  const escalates = ctx.risk === 'high' || ctx.risk === 'critical' || ctx.complexity === 'high';
  if (!escalates) return null;
  const decision = route(ctx, DEFAULT_POLICY);
  return (
    `model-router (advisory, not enforced by the host): suggests model ${decision.model}, ` +
    `effort ${decision.effort}. Reason: ${decision.reason}.`
  );
}
