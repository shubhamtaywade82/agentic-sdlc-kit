// packages/testing/src/validators/agent-provider-contract.ts
//
// Reusable AgentProvider contract harness (v2, revisions A–D). Any
// AgentProvider implementation (the mock, a real Claude Code adapter, a
// future Codex adapter) can be run against this to prove it satisfies the
// M36 contract. A provider package's own test suite calls
// `runAgentProviderContract(() => new MyProvider(), sampleAgentExecutionRequest)`;
// failures point at the contract clause that was violated.
//
// See ADR-0019 v2 and ADR-0020. Uses vitest `expect` (the testing
// package is a test-utility package; this matches the existing
// `validators/contracts.ts` pattern).

import { expect } from 'vitest';
import {
  AGENT_CAPABILITIES,
  AgentExecutionEventSchema,
  AgentExecutionResultSchema,
  BudgetEnforcementLevelSchema,
  type AgentExecutionRequest,
  type AgentProvider,
} from '@agentic-sdlc-kit/contracts';

export interface AgentProviderContractOptions {
  /** Max time to wait for a handle's result to resolve. Default 2000ms. */
  readonly executeTimeoutMs?: number;
  /**
   * A resumeToken the harness may use to exercise resume(). Resume tokens
   * are credentials supplied by the caller, never invented here.
   */
  readonly resumeToken?: string;
}

/**
 * Assert that a provider satisfies the AgentProvider contract (v2).
 * Throws (via vitest `expect`) on the first violation.
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

  // 2. capabilities() returns a non-empty subset of the allowlist, plus
  //    honest per-limit budget enforcement levels (revision C).
  const caps = await provider.capabilities();
  expect(caps.capabilities.length).toBeGreaterThan(0);
  for (const c of caps.capabilities) {
    expect(AGENT_CAPABILITIES).toContain(c);
  }
  const levels = Object.values(caps.budgetEnforcement);
  expect(levels.length).toBe(6);
  for (const level of levels) {
    expect(BudgetEnforcementLevelSchema.safeParse(level).success).toBe(true);
  }

  // 3. healthCheck() returns an availability verdict.
  const health = await provider.healthCheck();
  expect(typeof health.available).toBe('boolean');

  // 4. start() returns a handle whose result() parses and echoes the
  //    request's correlation ids (revision A: handle-based execution).
  const handle = await provider.start(request, AbortSignal.timeout(timeoutMs));
  expect(handle.executionId).toBe(request.executionId);

  const events: unknown[] = [];
  const unsubscribe = handle.events((e) => events.push(e));
  const result = await handle.result();
  unsubscribe();

  const parsed = AgentExecutionResultSchema.safeParse(result);
  expect(parsed.success, 'result must parse against AgentExecutionResultSchema').toBe(true);
  if (!parsed.success) return; // unreachable; satisfies TS
  expect(parsed.data.executionId).toBe(request.executionId);
  expect(parsed.data.workflowRunId).toBe(request.workflowRunId);
  expect(parsed.data.taskId).toBe(request.taskId);
  expect(parsed.data.providerId).toBe(request.providerId);
  expect(parsed.data.summary.length).toBeGreaterThan(0);

  // 5. every emitted event parses; sequence is monotonic starting at 1;
  //    eventId is unique; policyHash echoes the request's policy snapshot
  //    (revision D — the gateway rejects mismatched echoes, so providers
  //    must get this right).
  let expectedSeq = 1;
  const seenEventIds = new Set<string>();
  for (const e of events) {
    const ep = AgentExecutionEventSchema.safeParse(e);
    expect(ep.success, 'emitted event must parse against AgentExecutionEventSchema').toBe(true);
    if (!ep.success) continue;
    expect(ep.data.sequence).toBe(expectedSeq);
    expectedSeq += 1;
    expect(ep.data.policyHash).toBe(request.policyHash);
    expect(seenEventIds.has(ep.data.eventId)).toBe(false);
    seenEventIds.add(ep.data.eventId);
  }

  // 6. an already-aborted signal yields a non-completed status (cancelled /
  //    interrupted / timed_out), never `completed`, and does not hang.
  const abortedHandle = await provider.start(request, AbortSignal.abort());
  const abortedResult = await abortedHandle.result();
  const abortedParsed = AgentExecutionResultSchema.safeParse(abortedResult);
  expect(abortedParsed.success).toBe(true);
  if (abortedParsed.success) {
    expect(abortedParsed.data.status).not.toBe('completed');
  }

  // 7. resume() returns a handle addressed by (executionId, resumeToken)
  //    only — the gateway holds the original request, so the provider
  //    must not need it re-submitted (revision A).
  if (opts.resumeToken) {
    const resumedHandle = await provider.resume(request.executionId, opts.resumeToken);
    expect(resumedHandle.executionId).toBe(request.executionId);
    const resumedResult = await resumedHandle.result();
    expect(AgentExecutionResultSchema.safeParse(resumedResult).success).toBe(true);
  }

  // 8. cancel() of an unknown executionId resolves void (no throw).
  await expect(provider.cancel('exec-that-never-existed')).resolves.toBeUndefined();
}
