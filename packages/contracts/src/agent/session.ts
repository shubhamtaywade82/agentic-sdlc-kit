// packages/contracts/src/agent/session.ts
//
// M36 agent session contract (ADR-0019 v2). A session is a resumable provider
// conversation bound to one workflow task. resumeToken is opaque to Kit;
// the provider owns its format and rotation.
//
// Resume is addressed by (executionId, resumeToken) — NOT by re-passing
// the full original request. The gateway persists the original request so
// the provider does not need it re-submitted, which avoids drift between
// a persisted request and a resubmitted one.
//
// SECURITY: a resumeToken is a CREDENTIAL (ADR-0020 §6). It is never
// logged, never included in ordinary events, and never persisted
// unencrypted. Compromise of a resume token is treated as compromise of
// the execution it can resume.

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
