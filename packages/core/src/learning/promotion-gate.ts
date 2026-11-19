// packages/core/src/learning/promotion-gate.ts
//
// M33 Controlled Promotion Gate: requires independent verification and explicit
// human approval before promoting any self-evolution change.

import type { ExperimentReport, ImprovementHypothesis, PromotionRequest } from "@agentic-sdlc-kit/contracts";

export class PromotionGate {
  private readonly requests = new Map<string, PromotionRequest>();

  createRequest(
    hypothesis: ImprovementHypothesis,
    report: ExperimentReport,
  ): PromotionRequest | null {
    if (report.verdict !== "promoted") return null;

    const request: PromotionRequest = {
      id: `PROMOTE-${Date.now()}`,
      hypothesisId: hypothesis.id,
      targetSkill: hypothesis.targetSkill,
      branchName: `evolve/${hypothesis.targetSkill.toLowerCase()}-${Date.now()}`,
      diffSummary: hypothesis.proposedChange,
      status: "pending_approval",
      createdAt: new Date().toISOString(),
    };

    this.requests.set(request.id, request);
    return request;
  }

  approve(requestId: string, approvedBy: string): PromotionRequest | undefined {
    const existing = this.requests.get(requestId);
    if (!existing || existing.status !== "pending_approval") return undefined;

    const approved: PromotionRequest = {
      ...existing,
      status: "approved",
      approvedBy,
    };
    this.requests.set(requestId, approved);
    return approved;
  }

  rollback(requestId: string): PromotionRequest | undefined {
    const existing = this.requests.get(requestId);
    if (!existing) return undefined;

    const rolledBack: PromotionRequest = {
      ...existing,
      status: "rolled_back",
    };
    this.requests.set(requestId, rolledBack);
    return rolledBack;
  }

  get(id: string): PromotionRequest | undefined {
    return this.requests.get(id);
  }
}
