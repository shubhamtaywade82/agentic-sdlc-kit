// packages/core/src/learning/promotion-gate.ts
//
// M33 Controlled Promotion Gate: requires independent verification and explicit
// human approval before promoting any self-evolution change.

import type {
  ExperimentReport,
  SkillImprovementHypothesis,
  SkillPromotionRequest,
} from '@agentic-sdlc-kit/contracts';

export class PromotionGate {
  private readonly requests = new Map<string, SkillPromotionRequest>();

  createRequest(
    hypothesis: SkillImprovementHypothesis,
    report: ExperimentReport,
  ): SkillPromotionRequest | null {
    if (report.verdict !== 'promoted') return null;

    const request: SkillPromotionRequest = {
      id: `PROMOTE-${Date.now()}`,
      hypothesisId: hypothesis.id,
      targetSkill: hypothesis.targetSkill,
      branchName: `evolve/${hypothesis.targetSkill.toLowerCase()}-${Date.now()}`,
      diffSummary: hypothesis.proposedChange,
      status: 'pending_approval',
      createdAt: new Date().toISOString(),
    };

    this.requests.set(request.id, request);
    return request;
  }

  approve(requestId: string, approvedBy: string): SkillPromotionRequest | undefined {
    const existing = this.requests.get(requestId);
    if (!existing || existing.status !== 'pending_approval') return undefined;

    const approved: SkillPromotionRequest = {
      ...existing,
      status: 'approved',
      approvedBy,
    };
    this.requests.set(requestId, approved);
    return approved;
  }

  rollback(requestId: string): SkillPromotionRequest | undefined {
    const existing = this.requests.get(requestId);
    if (!existing) return undefined;

    const rolledBack: SkillPromotionRequest = {
      ...existing,
      status: 'rolled_back',
    };
    this.requests.set(requestId, rolledBack);
    return rolledBack;
  }

  get(id: string): SkillPromotionRequest | undefined {
    return this.requests.get(id);
  }
}
