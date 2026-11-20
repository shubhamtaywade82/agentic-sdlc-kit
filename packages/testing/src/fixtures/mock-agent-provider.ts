// packages/testing/src/fixtures/mock-agent-provider.ts
//
// MockAgentProvider — a deterministic, in-process AgentProvider for tests.
// It performs no real agent work; it emits a configurable event sequence
// and returns a configurable result that parses against
// AgentExecutionResultSchema. Used by the provider contract harness and by
// orchestrator integration tests that need a stand-in for a real provider.
//
// Invariants exercised by the mock (and asserted by the contract harness):
//   - Already-aborted signal -> status `cancelled`, never `completed`.
//   - Events carry monotonic per-execution seq starting at 1.
//   - Result fields echo the request's correlation ids.
//   - cancel() of an unknown executionId resolves void (no throw).

import type {
  AgentCapability,
  AgentEventSink,
  AgentExecutionResult,
  AgentExecutionStatus,
  AgentHealth,
  AgentProvider,
  AgentProviderId,
  AgentExecutionRequest,
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
}

const DEFAULT_CAPABILITIES: readonly AgentCapability[] = [
  'repository.read',
  'repository.write',
  'git.read',
  'process.test',
  'process.lint',
];

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

  constructor(opts: MockAgentProviderOptions = {}) {
    this.id = 'mock';
    this.opts = opts;
  }

  async capabilities(): Promise<readonly AgentCapability[]> {
    return [...(this.opts.capabilities ?? DEFAULT_CAPABILITIES)];
  }

  async healthCheck(): Promise<AgentHealth> {
    return this.opts.health ?? { available: true };
  }

  private buildResult(
    request: AgentExecutionRequest,
    status: AgentExecutionStatus,
  ): AgentExecutionResult {
    return {
      schemaVersion: 1,
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
          ? [{ code: 'CANCELLED', message: 'execution aborted', retryable: false }]
          : [],
    };
  }

  async execute(
    request: AgentExecutionRequest,
    signal: AbortSignal,
    onEvent?: AgentEventSink,
  ): Promise<AgentExecutionResult> {
    if (this.cancelled.has(request.executionId) || signal.aborted) {
      return this.buildResult(request, 'cancelled');
    }

    let seq = 0;
    const next = (): number => ++seq;
    const at = () => new Date().toISOString();
    if (onEvent && this.opts.emitEvents !== false) {
      onEvent({
        schemaVersion: 1,
        executionId: request.executionId,
        seq: next(),
        at: at(),
        type: 'execution.started',
      });
      onEvent({
        schemaVersion: 1,
        executionId: request.executionId,
        seq: next(),
        at: at(),
        type: 'tool.requested',
        toolCallId: 'mock-tc-1',
        capability: 'process.test',
      });
      onEvent({
        schemaVersion: 1,
        executionId: request.executionId,
        seq: next(),
        at: at(),
        type: 'tool.result',
        toolCallId: 'mock-tc-1',
        status: 'succeeded',
      });
    }

    if (this.opts.delayMs && this.opts.delayMs > 0) {
      try {
        await abortableDelay(this.opts.delayMs, signal);
      } catch {
        return this.buildResult(request, 'cancelled');
      }
    }

    const status = this.opts.status ?? 'completed';
    if (onEvent && this.opts.emitEvents !== false) {
      onEvent({
        schemaVersion: 1,
        executionId: request.executionId,
        seq: next(),
        at: at(),
        type: 'execution.completed',
        status,
      });
    }
    return this.buildResult(request, status);
  }

  async resume(
    executionId: string,
    _resumeToken: string,
    signal: AbortSignal,
    onEvent?: AgentEventSink,
  ): Promise<AgentExecutionResult> {
    // The mock does not truly persist sessions; resume behaves like a fresh
    // execute keyed by a synthetic request so the contract shape is honored.
    const synthetic: AgentExecutionRequest = {
      schemaVersion: 1,
      executionId,
      workflowRunId: 'resumed',
      taskId: 'task-resumed',
      providerId: this.id,
      taskKind: 'implementation',
      instructions: 'resume',
      context: { projectRoot: '/repo', relevantFiles: [], constraints: [] },
      permissions: {
        capabilities: [...(this.opts.capabilities ?? DEFAULT_CAPABILITIES)],
        writablePaths: [],
        networkAllowed: false,
        maxToolCalls: 1,
        maxDurationMs: 60_000,
      },
      approvalPolicy: { requireApprovalFor: [], allowAutonomousExecution: false },
    };
    return this.execute(synthetic, signal, onEvent);
  }

  async cancel(executionId: string): Promise<void> {
    // Cancelling an unknown executionId is a no-op, not an error.
    this.cancelled.add(executionId);
  }
}
