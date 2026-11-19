// packages/contracts/src/installer/install-plan.ts
//
// M15 install plan and uninstall plan (M15-04, M15-08). The installer
// produces a plan BEFORE executing, so the user can review and approve.

import { z } from 'zod';
import { PackageManifestSchema } from './package-manifest.js';

export const InstallOperationKindSchema = z.enum([
  'create', // new file
  'skip-existing', // file exists; preserve=true
  'overwrite-approved', // file exists; user approved overwrite
  'upgrade', // file exists; kit-owned; replace with new version
]);

export const InstallOperationSchema = z.object({
  packageId: z.string(),
  path: z.string().min(1),
  kind: InstallOperationKindSchema,
  reason: z.string().optional(),
});

export const InstallPlanSchema = z.object({
  schemaVersion: z.literal(1),
  scope: z.enum(['project', 'user']),
  profile: z.string(),
  packages: z.array(PackageManifestSchema),
  operations: z.array(InstallOperationSchema),
  // Validation errors (e.g., version conflicts, missing dependencies).
  validationErrors: z.array(z.string()).default([]),
  // Whether this is a dry-run (no execution).
  dryRun: z.boolean().default(true),
});

export const UninstallPlanSchema = z.object({
  schemaVersion: z.literal(1),
  scope: z.enum(['project', 'user']),
  // Files that will be removed (only kit-owned files).
  removePaths: z.array(z.string()),
  // Files that will be preserved (user-owned or modified).
  preservePaths: z.array(z.string()),
  // Whether this is a dry-run.
  dryRun: z.boolean().default(true),
});

export type InstallOperationKind = z.infer<typeof InstallOperationKindSchema>;
export type InstallOperation = z.infer<typeof InstallOperationSchema>;
export type InstallPlan = z.infer<typeof InstallPlanSchema>;
export type UninstallPlan = z.infer<typeof UninstallPlanSchema>;
