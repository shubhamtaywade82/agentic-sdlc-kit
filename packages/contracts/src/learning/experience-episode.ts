// packages/contracts/src/learning/experience-episode.ts
//
// M28 experience episode (M28-01 through M28-08). Every completed workflow
// produces an ExperienceEpisode record that the learning engine consumes.
//
// Per RESEARCH.md §3.2: keep sensitive source code, secrets, private
// prompts and user data out of shared learning records unless explicitly
// required and authorized. Store evidence references and minimal summaries
// by default.

import { z } from 'zod';

export const EXPERIENCE_EPISODE_SCHEMA_VERSION = 1 as const;

export const WorkflowKindSchema = z.enum(['app', 'feature', 'fix', 'refactor', 'release']);

export const EpisodeOutcomeSchema = z.enum(['success', 'partial', 'failed']);

export const ExperienceEpisodeSchema = z.object({
  schemaVersion: z.literal(EXPERIENCE_EPISODE_SCHEMA_VERSION),
  id: z.string(),
  // The run this episode came from.
  runId: z.string(),
  // Scope: where this episode is allowed to be shared.
  scope: z.object({
    organizationId: z.string().optional(),
    projectId: z.string().optional(),
    stacks: z.array(z.string()).default([]),
  }),
  // The workflow that produced this episode.
  workflow: WorkflowKindSchema,
  // A content-derived fingerprint of the task (so we can detect duplicates
  // and correlate similar tasks). NOT the raw prompt.
  taskFingerprint: z.string().min(1),
  // The kit version that produced this episode.
  kitVersion: z.string().min(1),
  // The runtime version (if known).
  runtimeVersion: z.string().optional(),
  // Component versions in effect when the episode ran.
  components: z.object({
    skillVersions: z.record(z.string(), z.string()).default({}),
    agentVersions: z.record(z.string(), z.string()).default({}),
    modVersions: z.record(z.string(), z.string()).default({}),
    stackPackVersions: z.record(z.string(), z.string()).default({}),
  }),
  // The outcome.
  outcome: z.object({
    status: EpisodeOutcomeSchema,
    acceptanceCriteriaPassed: z.number().int().nonnegative(),
    acceptanceCriteriaFailed: z.number().int().nonnegative(),
    regressionDetected: z.boolean(),
  }),
  // Evidence references (paths/ids; never raw secret content).
  evidence: z.object({
    verificationReportId: z.string().optional(),
    reviewReportId: z.string().optional(),
    affectedFiles: z.array(z.string()).default([]),
  }),
  // Human feedback (optional).
  feedback: z
    .object({
      humanRating: z.number().min(1).max(5).optional(),
      corrections: z.array(z.string()).default([]),
      approved: z.boolean().optional(),
    })
    .optional(),
  // Timestamps.
  timestamps: z.object({
    startedAt: z.string(),
    completedAt: z.string(),
  }),
});

export type WorkflowKind = z.infer<typeof WorkflowKindSchema>;
export type EpisodeOutcome = z.infer<typeof EpisodeOutcomeSchema>;
export type ExperienceEpisode = z.infer<typeof ExperienceEpisodeSchema>;
