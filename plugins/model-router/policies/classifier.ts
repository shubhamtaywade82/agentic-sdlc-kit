// plugins/model-router/policies/classifier.ts
//
// Task complexity and risk classifier (M12-04, M12-05). Pure functions.
//
// Per RESEARCH.md §C and post-M7 §6: complexity and risk are SEPARATE
// dimensions. The classifier must not equate a simple task with a safe
// task. A simple database deletion is low complexity but critical risk.

import type { Complexity, RoutingRisk, RoutingContext } from './types';

export interface ClassifyInput {
  // The task description or prompt being routed.
  prompt: string;
  // Whether the task touches production.
  touchesProduction: boolean;
  // Whether the task is destructive (delete, drop, force-push, etc.).
  destructive: boolean;
  // Whether the task involves security-sensitive code (auth, crypto, secrets).
  securitySensitive: boolean;
  // The estimated number of files affected.
  estimatedFileCount: number;
}

export function classifyComplexity(input: ClassifyInput): Complexity {
  // Heuristic: complexity scales with file count and whether the task
  // spans multiple modules.
  if (input.estimatedFileCount > 10) return 'high';
  if (input.estimatedFileCount > 3) return 'medium';
  if (input.securitySensitive) return 'medium';
  return 'low';
}

export function classifyRisk(input: ClassifyInput): RoutingRisk {
  // Risk is independent of complexity. A one-line production database
  // deletion is low complexity but critical risk.
  if (input.touchesProduction && input.destructive) return 'critical';
  if (input.securitySensitive) return 'high';
  if (input.destructive) return 'high';
  if (input.touchesProduction) return 'medium';
  return 'low';
}

export function buildRoutingContext(
  scope: 'main-turn' | 'subagent',
  input: ClassifyInput,
  opts: {
    explicitUserModel?: string;
    explicitUserEffort?: 'low' | 'medium' | 'high';
    taskType?: string;
  } = {},
): RoutingContext {
  return {
    scope,
    taskType: opts.taskType ?? 'general',
    complexity: classifyComplexity(input),
    risk: classifyRisk(input),
    requiredCapabilities: [],
    ...(opts.explicitUserModel !== undefined ? { explicitUserModel: opts.explicitUserModel } : {}),
    ...(opts.explicitUserEffort !== undefined
      ? { explicitUserEffort: opts.explicitUserEffort }
      : {}),
    previousOutcome: 'none',
  };
}
