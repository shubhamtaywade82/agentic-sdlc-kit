// packages/contracts/src/scaffolding/scaffold-contract.ts
//
// Scaffold contract: the request to scaffold a project and the resulting
// plan + executed operations (M8 Phase D — M8-20, M8-22, M8-25).
//
// INVARIANTS (post-M7 roadmap §2.3 Phase D):
//   - The scaffolder MUST show planned file operations before executing.
//   - It MUST NOT overwrite existing files silently.
//   - It MUST preserve user configuration (preserve: true files).
//   - It MUST validate template variables.
//   - It MUST record generated files.
//   - It MUST support safe recovery from interrupted generation.

import { z } from 'zod';
import { TemplateManifestSchema } from './template-manifest.js';

export const FileOperationKindSchema = z.enum(['create', 'skip-existing', 'overwrite-approved']);

export const PlannedFileOperationSchema = z.object({
  path: z.string().min(1),
  kind: FileOperationKindSchema,
  // If kind === "skip-existing" or "overwrite-approved", the reason.
  reason: z.string().optional(),
});

export const ScaffoldRequestSchema = z.object({
  templateId: z.string(),
  templateVersion: z.string(),
  targetDir: z.string().min(1),
  variables: z.record(z.string(), z.string()),
  // Set to true to actually write files; false = dry-run, plan only.
  execute: z.boolean().default(false),
});

export const ScaffoldPlanSchema = z.object({
  schemaVersion: z.literal(1),
  request: ScaffoldRequestSchema,
  template: TemplateManifestSchema,
  plannedOperations: z.array(PlannedFileOperationSchema),
  validationErrors: z.array(z.string()).default([]),
});

export const ScaffoldResultSchema = z.object({
  schemaVersion: z.literal(1),
  plan: ScaffoldPlanSchema,
  executedOperations: z.array(
    z.object({
      path: z.string(),
      kind: FileOperationKindSchema,
      bytesWritten: z.number().int().nonnegative().optional(),
    }),
  ),
  // Files recorded in .ai-kit/manifest.json so future re-runs and
  // uninstall know what the scaffold owns.
  ownedFiles: z.array(z.string()),
  interrupted: z.boolean().default(false),
});

export type FileOperationKind = z.infer<typeof FileOperationKindSchema>;
export type PlannedFileOperation = z.infer<typeof PlannedFileOperationSchema>;
export type ScaffoldRequest = z.infer<typeof ScaffoldRequestSchema>;
export type ScaffoldPlan = z.infer<typeof ScaffoldPlanSchema>;
export type ScaffoldResult = z.infer<typeof ScaffoldResultSchema>;
