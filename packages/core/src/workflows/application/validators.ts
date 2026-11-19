// packages/core/src/workflows/application/validators.ts
//
// Validates that the ApplicationContext matches the current stage.
// A workflow in the `architecture` stage MUST have a brief and a
// specification; a workflow in the `implementation` stage MUST have a
// plan; and so on. This catches "advanced to stage X without doing stage
// X-1" bugs.

import {
  Errors,
  type Result,
  type ApplicationContext,
  type ApplicationStage,
} from '@agentic-sdlc-kit/contracts';

interface StageRequirement {
  stage: ApplicationStage;
  requires: ReadonlyArray<(ctx: ApplicationContext) => boolean>;
  description: string;
}

const STAGE_REQUIREMENTS: ReadonlyArray<StageRequirement> = [
  {
    stage: 'discovery',
    requires: [(c) => c.brief !== undefined && c.brief.length > 0],
    description: 'discovery requires a brief',
  },
  {
    stage: 'requirements',
    requires: [(c) => c.brief !== undefined && c.brief.length > 0],
    description: 'requirements requires a brief',
  },
  {
    stage: 'architecture',
    requires: [
      (c) => c.brief !== undefined && c.brief.length > 0,
      (c) => c.specification !== undefined,
    ],
    description: 'architecture requires a brief and a specification',
  },
  {
    stage: 'planning',
    requires: [
      (c) => c.specification !== undefined,
      (c) => c.architectureDecisionIds !== undefined && c.architectureDecisionIds.length > 0,
    ],
    description: 'planning requires a specification and architecture decisions',
  },
  {
    stage: 'scaffolding',
    requires: [(c) => c.plan !== undefined],
    description: 'scaffolding requires a plan',
  },
  {
    stage: 'implementation',
    requires: [
      (c) => c.plan !== undefined,
      (c) => c.scaffoldedFilePaths !== undefined && c.scaffoldedFilePaths.length > 0,
    ],
    description: 'implementation requires a plan and scaffolded files',
  },
  {
    stage: 'verification',
    requires: [(c) => c.plan !== undefined],
    description: 'verification requires a plan',
  },
  {
    stage: 'review',
    requires: [(c) => c.verificationReports !== undefined && c.verificationReports.length > 0],
    description: 'review requires at least one verification report',
  },
  {
    stage: 'release',
    requires: [
      (c) => c.verificationReports !== undefined && c.verificationReports.length > 0,
      (c) => c.reviewReportPath !== undefined,
    ],
    description: 'release requires verification reports and a review report',
  },
];

export function validateContextForStage(
  stage: ApplicationStage,
  ctx: ApplicationContext,
): Result<true> {
  for (const req of STAGE_REQUIREMENTS) {
    if (req.stage !== stage) continue;
    for (const check of req.requires) {
      if (!check(ctx)) {
        return {
          ok: false,
          error: Errors.contractInvalid(req.description, { stage }),
        };
      }
    }
  }
  return { ok: true, value: true };
}
