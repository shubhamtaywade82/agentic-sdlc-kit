// packages/contracts/src/agent/events.ts
//
// M36 agent execution event contract (ADR-0019). Events are the normalized
// lifecycle stream emitted by a provider during execute(); Kit records them
// for audit and surfaces progress. Each event carries a monotonically
// increasing sequence number per executionId; duplicate or out-of-order
// events are the provider's bug, not Kit's.
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

export const AGENT_EVENT_SCHEMA_VERSION = 1 as const;

// Fields common to every event variant.
const AgentExecutionEventBaseSchema = z.object({
  schemaVersion: z.literal(AGENT_EVENT_SCHEMA_VERSION),
  // Correlates to AgentExecutionRequest.executionId.
  executionId: z.string().min(1),
  // Monotonic per-execution sequence; the first event for an executionId
  // is seq=1. Kit uses seq to detect gaps and duplicates in the audit log.
  seq: z.number().int().positive(),
  // ISO 8601 timestamp.
  at: z.string(),
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
 * Event sink passed to AgentProvider.execute/resume. Providers that emit
 * lifecycle events call this for each event; providers that do not stream
 * simply ignore it.
 */
export type AgentEventSink = (event: AgentExecutionEvent) => void;
