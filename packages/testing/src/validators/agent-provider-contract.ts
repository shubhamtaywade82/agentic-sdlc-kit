// packages/testing/src/validators/agent-provider-contract.ts
//
// Reusable AgentProvider contract harness. Any AgentProvider implementation
// (the mock, a real Claude Code adapter, a future Codex adapter) can be run
// against this to prove it satisfies the M36 contract. A provider package's
// own test suite calls `runAgentProviderContract(() => new MyProvider(),
// sampleAgentExecutionRequest)`; failures point at the contract clause that
// was violated.
//
// See ADR-0019 §4 and ADR-0020 §4. Uses vitest `expect` (the testing
// package is a test-utility package; this matches the existing
// `validators/contracts.ts` pattern).

import { expect } from 'vitest';
import {
  AGENT_CAPABILITIES,
  AgentExecutionEventSchema,
  AgentExecutionResultSchema,
  type AgentExecutionRequest,
  type AgentProvider,
} from '@agentic-sdlc-kit/contracts';

export interface AgentProviderContractOptions {
  /** Max time to wait for execute() to resolve. Default 2000ms. */
  readonly executeTimeoutMs?: number;
}

/**
 * Assert that a provider satisfies the AgentProvider contract. Throws
 * (via vitest `expect`) on the first violation.
 */
export async function runAgentProviderContract(
  providerFactory: () => AgentProvider,
  request: AgentExecutionRequest,
  opts: AgentProviderContractOptions = {},
): Promise<void> {
  const provider = providerFactory();
  const timeoutMs = opts.executeTimeoutMs ?? 2000;

  // 1. id is a valid kebab-case provider id and matches the request.
  expect(provider.id).toMatch(/^[a-z][a-z0-9-]*$/);
  expect(provider.id).toBe(request.providerId);

  // 2. capabilities() returns a non-empty subset of the allowlist.
  const caps = await provider.capabilities();
  expect(caps.length).toBeGreaterThan(0);
  for (const c of caps) {
    expect(AGENT_CAPABILITIES).toContain(c);
  }

  // 3. healthCheck() returns an availability verdict.
  const health = await provider.healthCheck();
  expect(typeof health.available).toBe('boolean');

  // 4. execute() returns a result that parses and echoes the request's
  //    correlation ids.
  const events: unknown[] = [];
  const result = await provider.execute(request, AbortSignal.timeout(timeoutMs), (e) =>
    events.push(e),
  );
  const parsed = AgentExecutionResultSchema.safeParse(result);
  expect(parsed.success, 'result must parse against AgentExecutionResultSchema').toBe(true);
  if (!parsed.success) return; // unreachable; satisfies TS
  expect(parsed.data.executionId).toBe(request.executionId);
  expect(parsed.data.workflowRunId).toBe(request.workflowRunId);
  expect(parsed.data.taskId).toBe(request.taskId);
  expect(parsed.data.providerId).toBe(request.providerId);
  expect(parsed.data.summary.length).toBeGreaterThan(0);

  // 5. every emitted event parses and seq is monotonic starting at 1.
  let expectedSeq = 1;
  for (const e of events) {
    const ep = AgentExecutionEventSchema.safeParse(e);
    expect(ep.success, 'emitted event must parse against AgentExecutionEventSchema').toBe(true);
    if (!ep.success) continue;
    expect(ep.data.seq).toBe(expectedSeq);
    expectedSeq += 1;
  }

  // 6. an already-aborted signal yields a non-completed status (cancelled /
  //    interrupted / timed_out), never `completed`, and does not hang.
  const abortedResult = await provider.execute(request, AbortSignal.abort());
  const abortedParsed = AgentExecutionResultSchema.safeParse(abortedResult);
  expect(abortedParsed.success).toBe(true);
  if (abortedParsed.success) {
    expect(abortedParsed.data.status).not.toBe('completed');
  }

  // 7. cancel() of an unknown executionId resolves void (no throw).
  await expect(provider.cancel('exec-that-never-existed')).resolves.toBeUndefined();
}
