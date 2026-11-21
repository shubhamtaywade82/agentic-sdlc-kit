// packages/contracts/src/agent/events.ts
//
// M36 agent execution event contract (ADR-0019 v2, revision D). Events
// are the normalized lifecycle stream emitted by a provider during an
// execution; the GATEWAY persists them and replay is idempotent. Every
// event carries:
//   - `eventId`      — unique per event; makes persistence and replay
//                      idempotent (the same event stored twice is
//                      detectable, not duplicable)
//   - `sequence`    — monotonically increasing per executionId; gaps and
//                      duplicates are detectable in the audit log
//   - `policyHash`  — echo of the request's policy snapshot hash; the
//                      gateway rejects events whose hash does not match
//                      the execution's policy (fail closed, ADR-0020 §4)
//
// Invariant: events are OBSERVABILITY, not control.
//   - A `tool.requested` event does NOT authorize the tool — the tool
//     broker's authorization decision is the only authority.
//   - An `execution.completed` event does NOT complete the workflow task —
//     only Kit's independent evidence check can mark a task complete
//     (ADR-0018, ADR-0019).

import { z } from 'zod';
import { AgentCapabilitySchema } from './capability.js';

export const AgentExecutionEventKindSchema = z.enum([
  'execution.started',
  'message.delta',
  'tool.requested',
  'tool.result',
  'approval.required',
  'execution.progress',
  'execution.completed',
]);
export type AgentExecutionEventKind = z.infer<typeof AgentExecutionEventKindSchema>;

export const AGENT_EVENT_SCHEMA_VERSION = 2 as const;

// Fields common to every event variant (the persistence envelope, kept
// stable while per-kind payloads stay typed in the discriminated union).
const AgentExecutionEventBaseSchema = z.object({
  schemaVersion: z.literal(AGENT_EVENT_SCHEMA_VERSION),
  // Unique per event; gateway persistence is idempotent on it.
  eventId: z.string().min(1),
  // Correlates to AgentExecutionRequest.executionId.
  executionId: z.string().min(1),
  // Monotonic per-execution sequence; the first event for an executionId
  // is sequence=1. Kit uses it to detect gaps and duplicates in the audit log.
  sequence: z.number().int().positive(),
  // Echo of AgentExecutionRequest.policyHash — the policy snapshot in
  // force when the event was produced. Mismatches fail closed.
  policyHash: z.string().min(1),
  // ISO 8601 timestamp.
  occurredAt: z.string(),
});

export const AgentExecutionEventSchema = z.discriminatedUnion('type', [
  AgentExecutionEventBaseSchema.extend({
    type: z.literal('execution.started'),
  }),
  AgentExecutionEventBaseSchema.extend({
    type: z.literal('message.delta'),
    content: z.string(),
  }),
  AgentExecutionEventBaseSchema.extend({
    type: z.literal('tool.requested'),
    toolCallId: z.string().min(1),
    capability: AgentCapabilitySchema,
  }),
  AgentExecutionEventBaseSchema.extend({
    type: z.literal('tool.result'),
    toolCallId: z.string().min(1),
    status: z.enum(['succeeded', 'failed', 'denied']),
  }),
  AgentExecutionEventBaseSchema.extend({
    type: z.literal('approval.required'),
    approvalId: z.string().min(1),
    action: z.string().min(1),
    reason: z.string().min(1),
  }),
  AgentExecutionEventBaseSchema.extend({
    type: z.literal('execution.progress'),
    taskId: z.string().min(1),
    progress: z.number().min(0).max(1).optional(),
  }),
  AgentExecutionEventBaseSchema.extend({
    type: z.literal('execution.completed'),
    status: z.enum([
      'completed',
      'failed',
      'cancelled',
      'timed_out',
      'interrupted',
      'needs_approval',
    ]),
  }),
]);

export type AgentExecutionEvent = z.infer<typeof AgentExecutionEventSchema>;

/**
 * Event sink subscribed via an AgentExecutionHandle. Providers that emit
 * lifecycle events deliver them through the handle's `events()`
 * subscription; providers that do not stream simply never deliver.
 * The subscription returns an unsubscribe function.
 */
export type AgentEventSink = (event: AgentExecutionEvent) => void;
