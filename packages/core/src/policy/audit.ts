// packages/core/src/policy/audit.ts
//
// Audit event builder. Produces an AuditEvent from a PolicyEvaluation and a
// ClassifiedAction. The event is persisted by the M10 Mod; this module
// only builds it.

import type { AuditEvent, ClassifiedAction } from '@agentic-sdlc-kit/contracts';
import type { PolicyEvaluation } from './policy-pack-evaluator.js';

export interface BuildAuditEventInput {
  evaluation: PolicyEvaluation;
  action: ClassifiedAction;
  runId?: string;
  approval?: { approver: string; grantedAt: string; rationale: string };
  bypass?: { flag: string; setUser: string; scope: string };
  outcome: AuditEvent['outcome'];
  now: () => string;
  idGenerator: () => string;
}

export function buildAuditEvent(input: BuildAuditEventInput): AuditEvent {
  return {
    schemaVersion: 1,
    id: input.idGenerator(),
    at: input.now(),
    ...(input.runId !== undefined ? { runId: input.runId } : {}),
    action: {
      category: input.action.category,
      impact: input.action.impact,
      // Human-readable scope summary; never raw secret values.
      scopeSummary: JSON.stringify(input.action.scope),
    },
    verdict: input.evaluation.verdict,
    ...(input.evaluation.matchedRuleId !== undefined
      ? { matchedRuleId: input.evaluation.matchedRuleId }
      : {}),
    ...(input.approval !== undefined ? { approval: input.approval } : {}),
    ...(input.bypass !== undefined ? { bypass: input.bypass } : {}),
    outcome: input.outcome,
  };
}
