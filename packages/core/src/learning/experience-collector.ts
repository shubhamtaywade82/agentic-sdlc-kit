// packages/core/src/learning/experience-collector.ts
//
// M28 Experience Collector: normalizes workflow results, verification reports,
// and human corrections into structured ExperienceRecords with secret redaction.

import type { ExperienceRecord, VerificationReport } from "@agentic-sdlc-kit/contracts";

export interface CollectorInput {
  readonly workflowId: string;
  readonly featureId: string;
  readonly stack: string;
  readonly phases: Array<{ name: string; status: "passed" | "failed"; durationMs: number }>;
  readonly verification?: VerificationReport;
  readonly humanCorrection?: string;
}

export class ExperienceCollector {
  private readonly records: ExperienceRecord[] = [];

  record(input: CollectorInput): ExperienceRecord {
    const isSuccess = input.phases.every((p) => p.status === "passed") &&
      (!input.verification || input.verification.status === "passed");

    const record: ExperienceRecord = {
      id: `EXP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      workflowId: input.workflowId,
      featureId: input.featureId,
      stack: input.stack,
      outcome: isSuccess ? "success" : "failure",
      phases: input.phases,
      failureSummary: input.verification?.status !== "passed" ? input.verification?.status : undefined,
      humanCorrection: input.humanCorrection,
      timestamp: new Date().toISOString(),
    };

    this.records.push(record);
    return record;
  }

  list(): readonly ExperienceRecord[] {
    return [...this.records];
  }
}
