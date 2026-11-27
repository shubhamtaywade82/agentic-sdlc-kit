// packages/contracts/src/observer/journal.ts
//
// Hash-chained execution journal (ADR-0021 §3).
//
// The feature run state (.ai-kit/state/feature-runs/<featureId>.json)
// is the handoff boundary; the journal is the EXECUTED RECORD: an
// append-only, tamper-evident, per-run event log at
// .ai-kit/journal/feature-runs/<featureId>.jsonl.
//
// Chain rule: every event carries `prevHash` (the `hash` of the
// previous event; the literal string 'GENESIS' for seq 0) and `hash`
// (SHA-256 over the canonical serialization of the event without its
// `hash` field). `kit journal <featureId> --verify` recomputes the
// chain and fails on any gap, reordering, or mutation.
//
// Honest limits (ADR-0021 §3.4):
//   - Modification, insertion, and reordering of recorded events are
//     DETECTABLE. Tail truncation is NOT detectable from the journal
//     alone — a truncated file is still a valid chain. Anchoring (e.g.
//     recording the final hash in the run report or an external system)
//     is the follow-up; the journal never claims more than it proves.
//   - The journal is observability, never authority: an event never
//     authorizes anything and cannot substitute for evidence records.
//     Journal write failures never block the workflow (the run-observer
//     invariant: telemetry must not block the chain).
//   - `payload` carries redacted, bounded strings only — the same
//     redaction policy and excerpt bound as phase evidence.

import { z } from 'zod';

export const JOURNAL_SCHEMA_VERSION = 1 as const;

/** Semantic events in the life of a feature run. */
export const JournalEventKindSchema = z.enum([
  /** `kit feature <id> start` created the run state. */
  'workflow.started',
  /** A phase attempt satisfied its invariant and advanced the task. */
  'phase.recorded',
  /** A phase attempt was recorded but did NOT advance (e.g. Red failed with a non-assertion classification). */
  'phase.rejected',
  /** A phase attempt ran and violated its invariant (e.g. Green failed). */
  'phase.failed',
  /** Final verification completed. `payload.status` is 'passed' | 'failed'. */
  'workflow.finalized',
  /** The kit offered the host an action (`kit next`). Recorded when the offer changes. Trace only: never a verdict. */
  'next.offered',
]);
export type JournalEventKind = z.infer<typeof JournalEventKindSchema>;

/**
 * Who invoked the kit. The kit CANNOT infer agent vs. human at the CLI
 * boundary — a host declares itself (`--host <id>` or KIT_HOST env) and
 * the kit records the declaration, defaulting to 'human'. An undeclared
 * agent is recorded honestly as what the kit observed, not what it
 * guessed.
 */
export const JournalActorSchema = z.object({
  kind: z.enum(['agent', 'human', 'kit']),
  /** Declared host id (e.g. 'claude-code', 'cursor', 'agy', 'github-actions'). */
  host: z.string().min(1).optional(),
});
export type JournalActor = z.infer<typeof JournalActorSchema>;

/** SHA-256 hex digest (64 lowercase hex chars) or the GENESIS sentinel. */
const HashSchema = z.string().regex(/^(GENESIS|[0-9a-f]{64})$/, 'expected 64 hex chars or GENESIS');

export const JournalEventSchema = z.object({
  schemaVersion: z.literal(JOURNAL_SCHEMA_VERSION),
  /** 0-based position in the chain; strictly increasing, no gaps. */
  seq: z.number().int().nonnegative(),
  /** ISO 8601 timestamp. */
  ts: z.string().min(1),
  /** The feature run this event belongs to (run id == feature id). */
  featureId: z.string().min(1),
  /** Target task, when the event is task-scoped. */
  taskId: z.string().optional(),
  kind: JournalEventKindSchema,
  actor: JournalActorSchema,
  /** Redacted, bounded event detail (evidence excerpts, statuses). */
  payload: z.record(z.unknown()),
  /** Hash of the previous event ('GENESIS' for seq 0). */
  prevHash: HashSchema,
  /** SHA-256 over the canonical serialization of this event without `hash`. */
  hash: HashSchema.refine((h) => h !== 'GENESIS', 'the GENESIS sentinel is only valid as prevHash'),
});
export type JournalEvent = z.infer<typeof JournalEventSchema>;
