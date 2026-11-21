// plugins/model-router/policies/default-policy.ts
//
// The routing table shipped with the plugin. Aliases match the Claude Code
// model names used in the kit docs (haiku / sonnet / opus).

import type { RoutingPolicy } from './types.js';

export const DEFAULT_POLICY: RoutingPolicy = {
  schemaVersion: 1,
  id: 'default',
  version: '1.0.0',
  rules: [
    { id: 'R-simple', taskType: '*', complexity: 'low', risk: 'low', model: 'haiku', effort: 'low', verification: 'structural', reason: 'simple low-risk task: lightweight model + low effort' },
    { id: 'R-routing', taskType: '*', complexity: 'medium', risk: 'medium', model: 'sonnet', effort: 'medium', verification: 'tests', reason: 'routine engineering: balanced model + medium effort' },
    { id: 'R-architecture', taskType: '*', complexity: 'high', risk: 'high', model: 'opus', effort: 'high', verification: 'independent-review', reason: 'complex high-risk task: strongest reasoning + independent review' },
    { id: 'R-critical-risk', taskType: '*', complexity: '*', risk: 'critical', model: 'opus', effort: 'high', verification: 'mandatory-security', reason: 'critical risk: approval gate; model routing is irrelevant to authorization' },
  ],
  defaultModel: 'sonnet',
  defaultEffort: 'medium',
  suggestOnly: true,
} as RoutingPolicy;
