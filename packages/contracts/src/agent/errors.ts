// packages/contracts/src/agent/errors.ts
//
// M36 agent execution error taxonomy (ADR-0019). Errors are classified by
// whether a retry can succeed: a provider crash or rate limit is retryable;
// a policy denial or malformed request is not. A timeout or cancellation
// is NEVER reported as `completed`.

import { z } from 'zod';

export const AgentErrorCodeSchema = z.enum([
  // Provider could not be reached (network, auth, service down).
  'PROVIDER_UNREACHABLE',
  // Provider rate-limited the request; retryable with backoff.
  'PROVIDER_RATE_LIMITED',
  // Provider returned an internal error; retryable.
  'PROVIDER_INTERNAL',
  // The agent attempted an operation outside its granted capabilities.
  // NOT retryable — the grant must change.
  'CAPABILITY_DENIED',
  // An approval-required action was encountered; execution paused.
  'APPROVAL_REQUIRED',
  // A requested approval was rejected by the human approver.
  'APPROVAL_REJECTED',
  // The request was malformed or violated contract; NOT retryable.
  'REQUEST_INVALID',
  // A budget (tokens, tool calls, duration) was exceeded.
  'BUDGET_EXCEEDED',
  // The provider session expired or was evicted; resume may be impossible.
  'SESSION_EXPIRED',
  // The execution exceeded maxDurationMs.
  'PROVIDER_TIMEOUT',
  // The execution was cancelled via AbortSignal or cancel().
  'CANCELLED',
  // Unclassified; treated as non-retryable unless proven otherwise.
  'UNKNOWN',
]);

export type AgentErrorCode = z.infer<typeof AgentErrorCodeSchema>;

export const AgentExecutionErrorSchema = z.object({
  code: AgentErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
});
export type AgentExecutionError = z.infer<typeof AgentExecutionErrorSchema>;

/**
 * Codes that mean "the execution did not produce usable work and must not
 * be treated as success under any circumstance." A workflow task MUST NOT
 * advance when the execution ended with any of these, regardless of any
 * `completed`-flavored summary the provider also returned.
 */
export const NON_SUCCESS_ERROR_CODES: readonly AgentErrorCode[] = [
  'CAPABILITY_DENIED',
  'APPROVAL_REJECTED',
  'REQUEST_INVALID',
  'PROVIDER_TIMEOUT',
  'CANCELLED',
];

/**
 * Codes that MAY justify an automatic retry (with backoff) by the
 * orchestrator. Everything else is terminal for this execution.
 */
export const RETRYABLE_ERROR_CODES: readonly AgentErrorCode[] = [
  'PROVIDER_UNREACHABLE',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_INTERNAL',
];
