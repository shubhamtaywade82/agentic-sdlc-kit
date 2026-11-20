// plugins/model-router/policies/types.ts
//
// Local type surface for the model-router plugin. VENDORED on purpose:
// a Claude Code plugin must be self-contained (a hooks module imports its
// own files by relative path and 'claude-code' — nothing else), so the
// plugin cannot import @agentic-sdlc-kit/contracts. These mirror the kit
// contracts (routing/*) and must stay compatible with them.

export type Complexity = 'low' | 'medium' | 'high';
export type RoutingRisk = 'low' | 'medium' | 'high' | 'critical';
export type Effort = 'low' | 'medium' | 'high';

export interface RoutingRule {
  id: string;
  // Matchers; "*" matches any.
  taskType: string | '*';
  complexity: Complexity | '*';
  risk: RoutingRisk | '*';
  // The model to select (or "auto" to let the registry pick by capability).
  model: string;
  effort: Effort;
  // Required verification for this class of task.
  verification: 'none' | 'structural' | 'tests' | 'independent-review' | 'mandatory-security';
  reason: string;
}

export interface RoutingPolicy {
  schemaVersion: 1;
  id: string;
  version: string;
  rules: RoutingRule[];
  // Default model when no rule matches.
  defaultModel: string;
  defaultEffort: Effort;
  // Whether the router starts in suggest-only mode (per post-M7 §6).
  suggestOnly: boolean;
}

export interface RoutingContext {
  // Whether this is a main-turn request or a subagent spawn.
  scope: 'main-turn' | 'subagent';
  // The task type, classified by the classifier module.
  taskType: string;
  complexity: Complexity;
  risk: RoutingRisk;
  // The size of the context being routed (rough token estimate).
  contextTokens?: number;
  // Required capabilities (e.g., ["code-edit", "tool-use"]).
  requiredCapabilities: string[];
  // If the user explicitly selected a model, the router MUST preserve it.
  explicitUserModel?: string;
  explicitUserEffort?: Effort;
  // Previous execution outcome (for verification-driven escalation).
  previousOutcome: 'none' | 'passed' | 'failed-verification' | 'failed-review';
}

export interface RoutingDecision {
  model: string;
  effort: Effort;
  // The reason this decision was made (for explainability).
  reason: string;
  // Whether this decision was a fallback (provider/model unavailable).
  isFallback: boolean;
  // Whether this decision was an escalation (previous attempt failed).
  isEscalation: boolean;
  // The matched rule id (if a static policy matched).
  matchedRuleId?: string;
}
