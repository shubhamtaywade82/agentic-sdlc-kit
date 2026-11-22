// packages/contracts/src/workflow/next-action.ts
//
// Host-driven agent protocol (ADR-0021): the `kit next` primitive.
//
// Tier C hosts (Cursor, AGY, CI, any terminal-capable agent) drive the
// kit through the CLI rather than being driven by it (that is the
// ADR-0019 provider direction). `kit next --json` is their ONLY required
// entry point: a bounded, machine-readable answer to "what is the next
// action, against what target, under which constraints?".
//
// Protocol rules (ADR-0021 §2):
//   - The payload is bounded. An agent never needs to read prose docs to
//     make progress; every field it needs to act is present.
//   - `verificationCommand` is the TASK'S OWN command from the plan
//     (ADR-0018 P1) — empty when the next action is not task-scoped.
//   - `advisoryLessons` are ADVISORY ONLY. A lesson never authorizes an
//     action and never satisfies a phase invariant; the evidence gate in
//     core.workflows.feature-workflow is the sole authority (mirrors the
//     model-router invariant: the router cannot be the authority for
//     security).
//   - `blockingQuestions` is honest: an empty array means "the kit is
//     not waiting on a human", not "no question could ever matter".
//     Tier C has no approval surface today; absence of an approval UI is
//     a capability downgrade, never a policy bypass (SECURITY.md §3.1).
//
// This schema is a wire contract: any host may parse it. Breaking
// changes require a new schemaVersion (CONTRACTS.md §9).

import { z } from 'zod';
import { WorkflowStatusSchema } from './workflow.js';

export const NEXT_ACTION_SCHEMA_VERSION = 1 as const;

/** What the driver must do next to make progress on this run. */
export const NextRequiredActionSchema = z.enum([
  /** No run state exists for this feature — start one. */
  'feature.start',
  /** Write the failing test for `taskId`, then run its red phase. */
  'task.red',
  /** Implement `taskId` minimally, then run its green phase. */
  'task.green',
  /** Refactor `taskId` (behavior preserved), then run its refactor phase. */
  'task.refactor',
  /** All tasks completed — audit the evidence chain and run final verification. */
  'feature.verify',
  /** The run passed final verification; nothing further is required. */
  'run.completed',
]);
export type NextRequiredAction = z.infer<typeof NextRequiredActionSchema>;

/**
 * A reference to an advisory lesson surfaced by the learning loop.
 * `advisory: true` is a literal, not a flag: the type system carries the
 * promise that a lesson is advice, never authority.
 */
export const LessonRefSchema = z.object({
  lessonId: z.string().min(1),
  summary: z.string().min(1),
  advisory: z.literal(true),
});
export type LessonRef = z.infer<typeof LessonRefSchema>;

/**
 * Execution constraints the kit will enforce on the next phase
 * verification. Bounded by default; a host may not raise them beyond
 * what the phase runner enforces (core.workflows feature-workflow,
 * ProcessVerificationRunner).
 */
export const NextActionConstraintsSchema = z.object({
  /** Phase verification timeout (default 60_000 ms, runTddPhase). */
  timeoutMs: z.number().int().positive(),
  /** Output capture bound (default 10 MiB, ProcessVerificationRunner). */
  maxOutputBytes: z.number().int().positive(),
});
export type NextActionConstraints = z.infer<typeof NextActionConstraintsSchema>;

export const NextActionSchema = z.object({
  schemaVersion: z.literal(NEXT_ACTION_SCHEMA_VERSION),
  /** The feature run this action belongs to (one run per feature id). */
  featureId: z.string().min(1),
  status: WorkflowStatusSchema,
  /** Target task of the next action; absent for run-level actions. */
  taskId: z.string().optional(),
  /** TDD phase the target task is in; present iff taskId is present. */
  phase: z.enum(['red', 'green', 'refactor']).optional(),
  requiredAction: NextRequiredActionSchema,
  /**
   * The task's own verification command from the plan (ADR-0018 P1).
   * Empty when the next action is not task-scoped (feature.start,
   * feature.verify, run.completed) — the profile commands govern there.
   */
  verificationCommand: z.array(z.string()),
  /** The literal CLI invocation that executes the required action. */
  nextInvocation: z.string().min(1),
  /** Questions the kit is waiting on a human to answer. Honest, possibly empty. */
  blockingQuestions: z.array(z.string()),
  /** Advisory lessons (ADVISORY ONLY — never authority; ADR-0021 §4). */
  advisoryLessons: z.array(LessonRefSchema),
  constraints: NextActionConstraintsSchema,
});
export type NextAction = z.infer<typeof NextActionSchema>;
