// packages/contracts/src/observer/event-schema.ts
//
// M13 event contract (M13-01, M13-02). Versioned event schema for the
// run-observer Mod. Every event has a stable id and schema; missing
// telemetry is represented honestly (never as zero).

import { z } from 'zod';

export const OBSERVER_EVENT_SCHEMA_VERSION = 1 as const;

export const ObserverEventKindSchema = z.enum([
  'session-start',
  'session-end',
  'turn-start',
  'turn-step',
  'turn-complete',
  'agent-spawn',
  'agent-complete',
  'tool-call',
  'tool-result',
  'verification',
  'escalation',
  'failure',
  'blocked-action',
]);

export const ObserverEventSchema = z.object({
  schemaVersion: z.literal(OBSERVER_EVENT_SCHEMA_VERSION),
  id: z.string(),
  // The run this event belongs to.
  runId: z.string(),
  // The session this event belongs to (may differ from run if a session
  // spans multiple runs).
  sessionId: z.string().optional(),
  // ISO 8601 timestamp.
  at: z.string(),
  kind: ObserverEventKindSchema,
  // The model and effort in effect when the event occurred (if applicable).
  model: z.string().optional(),
  effort: z.string().optional(),
  // Token usage (only present for turn-complete events where the host
  // exposes it).
  tokensIn: z.number().int().nonnegative().optional(),
  tokensOut: z.number().int().nonnegative().optional(),
  // Estimated cost in arbitrary units (only where reliable data exists).
  estimatedCostUnits: z.number().nonnegative().optional(),
  // A redacted summary of the event payload (never raw secrets).
  summary: z.string(),
  // Whether telemetry for this event is partial (some fields missing).
  partial: z.boolean().default(false),
});

export type ObserverEvent = z.infer<typeof ObserverEventSchema>;
export type ObserverEventKind = z.infer<typeof ObserverEventKindSchema>;
