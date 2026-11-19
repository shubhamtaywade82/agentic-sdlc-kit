// packages/contracts/src/architecture/operational-design.ts
//
// Operational design contract (M8 Phase C — M8-18).
// Deployment, configuration, observability plan.

import { z } from 'zod';

export const DeploymentTargetSchema = z.enum([
  'container-orchestrated',
  'container-single-host',
  'serverless',
  'paas',
  'self-hosted-vm',
  'static-hosting',
]);

export const ObservabilityChannelSchema = z.enum(['logs', 'metrics', 'traces', 'events']);

export const OperationalDesignSchema = z.object({
  schemaVersion: z.literal(1),
  briefId: z.string(),
  deployment: z.object({
    target: DeploymentTargetSchema,
    rationale: z.string().min(1),
    regions: z.array(z.string()).default([]),
  }),
  configuration: z.object({
    // How the app loads config (env, file, secret manager).
    source: z.enum(['env', 'file', 'secret-manager', 'mixed']),
    // Schema for the config variables (names only — never values).
    variables: z.array(
      z.object({
        name: z.string(),
        required: z.boolean(),
        sensitive: z.boolean(),
        description: z.string(),
      }),
    ),
  }),
  observability: z.object({
    channels: z.array(ObservabilityChannelSchema),
    sinks: z.array(z.string()),
    // Sampling rate for traces (0.0 to 1.0). Documented as a string to
    // avoid float precision issues in JSON.
    traceSampling: z.string().optional(),
  }),
  scaling: z.object({
    strategy: z.enum(['horizontal', 'vertical', 'none']),
    triggers: z.array(z.string()).default([]),
  }),
});

export type DeploymentTarget = z.infer<typeof DeploymentTargetSchema>;
export type ObservabilityChannel = z.infer<typeof ObservabilityChannelSchema>;
export type OperationalDesign = z.infer<typeof OperationalDesignSchema>;
