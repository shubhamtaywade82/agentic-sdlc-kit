// packages/contracts/src/application/application-context.ts
//
// Application workflow context (M8 Phase A — M8-01).
//
// Carries the artifacts the workflow has produced so far: product brief,
// PRD, architecture, plan, scaffold manifest, verification reports. Each
// field is optional because the workflow fills them in as it advances.
// The validator in core/workflows/application/validators.ts checks that
// the context matches the current stage (e.g., you cannot be in the
// `architecture` stage without a `brief` and `requirements`).

import { z } from 'zod';
import { FeatureSpecificationSchema } from '../specification/specification.js';
import { ImplementationPlanSchema } from '../planning/task.js';
import { VerificationReportSchema } from '../verification/report.js';

export const ApplicationContextSchema = z.object({
  // Filled in during `intake` and `discovery`:
  brief: z.string().optional(),
  // Filled in during `requirements`:
  specification: FeatureSpecificationSchema.optional(),
  // Filled in during `architecture`:
  architectureDecisionIds: z.array(z.string()).optional(),
  // Filled in during `planning`:
  plan: ImplementationPlanSchema.optional(),
  // Filled in during `scaffolding`:
  scaffoldedFilePaths: z.array(z.string()).optional(),
  // Filled in during `implementation` and `verification`:
  verificationReports: z.array(VerificationReportSchema).optional(),
  // Filled in during `review`:
  reviewReportPath: z.string().optional(),
  // Filled in during `release`:
  releaseVersion: z.string().optional(),
  // Unresolved decisions the workflow is blocked on:
  openDecisions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        stage: z.string(),
        raisedAt: z.string(),
      }),
    )
    .default([]),
});

export type ApplicationContext = z.infer<typeof ApplicationContextSchema>;
