// packages/contracts/src/agent/provider.ts
//
// M36 agent provider behavior contract (ADR-0019). A provider translates
// Kit's provider-neutral AgentExecutionRequest into a concrete agent
// invocation (Claude Code, Codex, ...) and normalizes the result back.
//
// Hard rules (ADR-0019, ADR-0020):
//   - A provider MUST NOT bypass Kit policy. It executes within the
//     capabilities and writablePaths granted by the request; the tool
//     broker is the authority, not the provider.
//   - A provider MUST NOT import or depend on any @agentic-sdlc-kit/*
//     package except @agentic-sdlc-kit/contracts. (Architecture gate.)
//   - A provider MUST report timeouts/cancellations/crashes with the
//     matching status, never `completed`.
//   - resume() takes (executionId, resumeToken) — not the full request.
//     The gateway persists the original request so the provider does not
//     need it re-passed (re-passing invites drift between the persisted
//     and re-submitted request).
//
// This is a behavior interface (no Zod, no implementation). It lives in
// contracts so the gateway, the orchestrator, and every provider share
// one canonical type.

import type { AgentCapability } from './capability.js';
import type { AgentEventSink } from './events.js';
import type { AgentExecutionRequest, AgentExecutionResult, AgentProviderId } from './execution.js';

export interface AgentHealth {
  readonly available: boolean;
  readonly message?: string;
}

export interface AgentProvider {
  readonly id: AgentProviderId;

  /** The capabilities this provider can exercise. Must be a subset of AGENT_CAPABILITIES. */
  capabilities(): Promise<readonly AgentCapability[]>;

  /** Probe provider configuration and connectivity without executing work. */
  healthCheck(): Promise<AgentHealth>;

  /**
   * Execute a bounded task. The result MUST be a valid AgentExecutionResult.
   * If `signal` is already aborted, return a `cancelled` result rather than
   * throwing. If `onEvent` is supplied, emit normalized lifecycle events
   * with monotonic per-execution sequence numbers. Events are observability,
   * not control — emitting `tool.requested` does not authorize the tool.
   */
  execute(
    request: AgentExecutionRequest,
    signal: AbortSignal,
    onEvent?: AgentEventSink,
  ): Promise<AgentExecutionResult>;

  /**
   * Resume a previously interrupted execution. The gateway persists the
   * original request, so resume is addressed by (executionId, resumeToken)
   * rather than re-passing the full request.
   */
  resume(
    executionId: string,
    resumeToken: string,
    signal: AbortSignal,
    onEvent?: AgentEventSink,
  ): Promise<AgentExecutionResult>;

  /**
   * Cancel an in-flight execution. Cancelling an unknown executionId is a
   * no-op (resolves void), not an error — the execution is already stopped.
   */
  cancel(executionId: string): Promise<void>;
}
