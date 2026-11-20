// packages/contracts/src/agent/session.ts
//
// M36 agent session contract (ADR-0019). A session is a resumable provider
// conversation bound to one workflow task. resumeToken is opaque to Kit;
// the provider owns its format and rotation.
//
// Resume is addressed by (executionId, resumeToken) — NOT by re-passing
// the full original request. The gateway persists the original request so
// the provider does not need it re-submitted, which avoids drift between
// a persisted request and a resubmitted one.

import { z } from 'zod';

export const AgentSessionIdSchema = z.string().min(1);
export type AgentSessionId = z.infer<typeof AgentSessionIdSchema>;

export const AgentResumeTokenSchema = z.string().min(1);
export type AgentResumeToken = z.infer<typeof AgentResumeTokenSchema>;

export const AgentSessionRefSchema = z.object({
  sessionId: AgentSessionIdSchema,
  resumeToken: AgentResumeTokenSchema.optional(),
});
export type AgentSessionRef = z.infer<typeof AgentSessionRefSchema>;
