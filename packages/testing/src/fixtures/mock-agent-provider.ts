// packages/testing/src/fixtures/mock-agent-provider.ts
//
// MockAgentProvider — a deterministic, in-process AgentProvider (v2,
// handle-based) for tests. It performs no real agent work; it emits a
// configurable event sequence and returns a configurable result that
// parses against AgentExecutionResultSchema. Used by the provider
// contract harness and by orchestrator integration tests that need a
// stand-in for a real provider.
//
// Invariants exercised by the mock (and asserted by the contract harness):
//   - start()/resume() return AgentExecutionHandle, not results.
//   - An already-aborted signal yields a `cancelled` result, never `completed`.
//   - Events carry unique eventId, monotonic per-execution sequence
//     starting at 1, and echo the request's policyHash.
//   - The events() subscription returns an unsubscribe function.
//   - Result fields echo the request's correlation ids.
//   - cancel() of an unknown executionId resolves void (no throw).
//   - The resumeToken parameter is treated as a credential: the mock
//     never places it in events or results.

import {
  AGENT_EVENT_SCHEMA_VERSION,
  AGENT_EXECUTION_SCHEMA_VERSION,
  type AgentCapability,
  type AgentEventSink,
  type AgentExecutionError,
  type AgentExecutionEvent,
  type AgentExecutionHandle,
  type AgentExecutionRequest,
  type AgentExecutionResult,
  type AgentExecutionStatus,
  type AgentHealth,
  type AgentProvider,
  type AgentProviderCapabilities,
  type AgentProviderId,
} from '@agentic-sdlc-kit/contracts';

export interface MockAgentProviderOptions {
  /** Capabilities the mock claims to support. Default: a fixed subset. */
  readonly capabilities?: readonly AgentCapability[];
  /** Override the final status; default `completed`. */
  readonly status?: AgentExecutionStatus;
  /** Override the summary; default echoes the request instructions. */
  readonly summary?: string;
  /** Whether to emit lifecycle events; default true. */
  readonly emitEvents?: boolean;
  /** Artificial delay before completing, to exercise abort/timeout paths. */
  readonly delayMs?: number;
  /** Override healthCheck output; default `{ available: true }`. */
  readonly health?: AgentHealth;
  /**
   * Simulate the agent doing real work in the execution workspace: called
   * on the completion path, after `execution.started` and before the final
   * result. Orchestrator integration tests use this to make the task's
   * verification command actually fail (Red) or pass (Green) inside the
   * workspace — exactly what a real provider's edits would do. If it
   * throws, the execution ends `failed` with the error message.
   */
  readonly performWork?: (request: AgentExecutionRequest) => Promise<void> | void;
  /**
   * Policy hash the mock echoes in events produced by resume(). The mock
   * cannot know the original request's policy on resume (the gateway owns
   * the request and does not re-submit it), so gateway tests that want a
   * clean replay pass the real hash here. Default: the synthetic fixture
   * hash used by the provider contract harness.
   */
  readonly resumePolicyHash?: string;
}

const DEFAULT_CAPABILITIES: readonly AgentCapability[] = [
  'repository.read',
  'repository.write',
  'git.read',
  'process.test',
  'process.lint',
];

/**
 * Honest enforcement levels for the mock: it can enforce duration and
 * tool calls (the gateway always can), and it can count tokens (it is
 * in-process), but it has NO cost information — cost is best-effort,
 * never claimed as enforced (revision C honesty rule).
 */
const MOCK_BUDGET_ENFORCEMENT: AgentProviderCapabilities['budgetEnforcement'] = {
  maxDurationMs: 'gateway-enforced',
  maxToolCalls: 'gateway-enforced',
  maxInputTokens: 'best-effort',
  maxOutputTokens: 'best-effort',
  maxTotalTokens: 'best-effort',
  maxEstimatedCost: 'best-effort',
};

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'));
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export class MockAgentProvider implements AgentProvider {
  readonly id: AgentProviderId;
  private readonly opts: MockAgentProviderOptions;
  private readonly cancelled = new Set<string>();
  /** Captured resume calls, keyed by executionId (for orchestration tests). */
  private readonly resumed = new Map<string, string>();

  constructor(opts: MockAgentProviderOptions = {}) {
    this.id = 'mock';
    this.opts = opts;
  }

  async capabilities(): Promise<AgentProviderCapabilities> {
    return {
      capabilities: [...(this.opts.capabilities ?? DEFAULT_CAPABILITIES)],
      budgetEnforcement: { ...MOCK_BUDGET_ENFORCEMENT },
    };
  }

  async healthCheck(): Promise<AgentHealth> {
    return this.opts.health ?? { available: true };
  }

  /** True if resume() was called for the executionId (test helper). */
  wasResumedWith(executionId: string): string | undefined {
    return this.resumed.get(executionId);
  }

  private buildResult(
    request: Pick<
      AgentExecutionRequest,
      'executionId' | 'workflowRunId' | 'taskId' | 'instructions' | 'policyHash'
    >,
    status: AgentExecutionStatus,
    extraErrors: readonly AgentExecutionError[] = [],
  ): AgentExecutionResult {
    return {
      schemaVersion: AGENT_EXECUTION_SCHEMA_VERSION,
      executionId: request.executionId,
      workflowRunId: request.workflowRunId,
      taskId: request.taskId,
      providerId: this.id,
      status,
      summary:
        this.opts.summary ??
        `Mock agent ${status === 'completed' ? 'completed' : 'ended as ' + status}: ${request.instructions.slice(0, 80)}`,
      proposedArtifacts:
        status === 'completed' ? [{ path: 'src/auth/registration.ts', operation: 'create' }] : [],
      requestedApprovals: [],
      usage: { durationMs: this.opts.delayMs ?? 0 },
      errors:
        status === 'cancelled'
          ? [{ code: 'CANCELLED', message: 'execution aborted', retryable: false }, ...extraErrors]
          : [...extraErrors],
    };
  }

  private runExecution(
    request: Pick<
      AgentExecutionRequest,
      'executionId' | 'workflowRunId' | 'taskId' | 'instructions' | 'policyHash'
    >,
    signal: AbortSignal,
    fullRequest?: AgentExecutionRequest,
  ): AgentExecutionHandle {
    const listeners = new Set<AgentEventSink>();
    // Events emitted before the first subscription are buffered and
    // replayed to each new subscriber, so subscribing after start()
    // resolves never silently loses history (deterministic for tests).
    const buffer: AgentExecutionEvent[] = [];
    let sequence = 0;

    type EventPayload =
      | { type: 'execution.started' }
      | { type: 'message.delta'; content: string }
      | { type: 'tool.requested'; toolCallId: string; capability: AgentCapability }
      | { type: 'tool.result'; toolCallId: string; status: 'succeeded' | 'failed' | 'denied' }
      | { type: 'approval.required'; approvalId: string; action: string; reason: string }
      | { type: 'execution.progress'; taskId: string; progress?: number }
      | { type: 'execution.completed'; status: AgentExecutionStatus };

    const nextEvent = (payload: EventPayload): void => {
      if (this.opts.emitEvents === false) return;
      sequence += 1;
      const event: AgentExecutionEvent = {
        schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
        eventId: `evt-${request.executionId}-${sequence}`,
        executionId: request.executionId,
        sequence,
        policyHash: request.policyHash,
        occurredAt: new Date().toISOString(),
        ...payload,
      };
      buffer.push(event);
      for (const sink of listeners) sink(event);
    };

    const resultPromise = (async (): Promise<AgentExecutionResult> => {
      if (this.cancelled.has(request.executionId) || signal.aborted) {
        return this.buildResult(request, 'cancelled');
      }

      nextEvent({ type: 'execution.started' });
      nextEvent({ type: 'tool.requested', toolCallId: 'mock-tc-1', capability: 'process.test' });
      nextEvent({ type: 'tool.result', toolCallId: 'mock-tc-1', status: 'succeeded' });

      if (this.opts.delayMs && this.opts.delayMs > 0) {
        try {
          await abortableDelay(this.opts.delayMs, signal);
        } catch {
          return this.buildResult(request, 'cancelled');
        }
      }

      // Simulated agent work happens on the completion path only: a
      // cancelled/timed-out execution performs no work. It receives the
      // FULL request (workspace paths, task ids) and is only available on
      // the start() path — resume() has no original request to simulate.
      if (this.opts.performWork && fullRequest) {
        try {
          await this.opts.performWork(fullRequest);
        } catch (e) {
          nextEvent({ type: 'execution.completed', status: 'failed' });
          return this.buildResult(request, 'failed', [
            {
              code: 'PROVIDER_INTERNAL',
              message: `simulated work failed: ${String(e)}`,
              retryable: true,
            },
          ] as const);
        }
      }

      const status = this.opts.status ?? 'completed';
      nextEvent({ type: 'execution.completed', status });
      return this.buildResult(request, status);
    })();

    return {
      executionId: request.executionId,
      result: () => resultPromise,
      events: (onEvent: AgentEventSink): (() => void) => {
        for (const buffered of buffer) onEvent(buffered);
        listeners.add(onEvent);
        return () => listeners.delete(onEvent);
      },
    };
  }

  async start(request: AgentExecutionRequest, signal: AbortSignal): Promise<AgentExecutionHandle> {
    return this.runExecution(request, signal, request);
  }

  async resume(executionId: string, resumeToken: string): Promise<AgentExecutionHandle> {
    // The mock does not truly persist sessions; resume behaves like a fresh
    // execution keyed by a synthetic request so the contract shape is
    // honored. The synthetic ids use the canonical Identifier shape so the
    // result parses. The resumeToken is recorded internally but NEVER
    // echoed in events or results — it is a credential.
    this.resumed.set(executionId, resumeToken);
    return this.runExecution(
      {
        executionId,
        workflowRunId: 'RUN-002',
        taskId: 'TASK-002',
        instructions: 'resume',
        policyHash: this.opts.resumePolicyHash ?? 'sha256:mock-resume-policy',
      },
      AbortSignal.timeout(60_000),
    );
  }

  async cancel(executionId: string): Promise<void> {
    // Cancelling an unknown executionId is a no-op, not an error.
    this.cancelled.add(executionId);
  }
}
