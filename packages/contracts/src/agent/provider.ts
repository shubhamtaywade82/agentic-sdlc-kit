// packages/contracts/src/agent/provider.ts
//
// M36 agent provider behavior contract (ADR-0019 v2, revision A). A
// provider translates Kit's provider-neutral AgentExecutionRequest into a
// concrete agent invocation (Claude Code, Codex, ...) and normalizes the
// result back.
//
// Hard rules (ADR-0019 v2, ADR-0020):
//   - A provider MUST NOT bypass Kit policy. It executes within the
//     capabilities and writablePaths granted by the request; the tool
//     broker is the authority, not the provider.
//   - A provider MUST NOT import or depend on any @agentic-sdlc-kit/*
//     package except @agentic-sdlc-kit/contracts. (Architecture gate.)
//   - A provider MUST report timeouts/cancellations/crashes with the
//     matching status, never `completed`.
//   - Execution is HANDLE-BASED (v2, revision A): `start()` returns an
//     AgentExecutionHandle whose `result()` resolves once and whose
//     `events()` is an observability subscription. The gateway holds the
//     original request; `resume()` is addressed by (executionId,
//     resumeToken) only.
//   - RESUME TOKENS ARE CREDENTIALS. They are never logged, never
//     included in ordinary events, and never persisted unencrypted.
//     Compromise of a resume token is treated as compromise of the
//     execution (ADR-0020 §6).
//   - A provider's capabilities() MUST declare budget enforcement levels
//     honestly (revision C): token or cost limits are never declared
//     `provider-enforced` without reliable usage information.
//
// This is a behavior interface (no Zod, no implementation). It lives in
// contracts so the gateway, the orchestrator, and every provider share
// one canonical type.

import type { AgentCapability } from './capability.js';
import type { BudgetEnforcementLevel } from './execution.js';
import type { AgentExecutionRequest, AgentExecutionResult, AgentProviderId } from './execution.js';
import type { AgentEventSink } from './events.js';

export interface AgentHealth {
  readonly available: boolean;
  readonly message?: string;
}

/**
 * What a provider can actually do and enforce (revision C). Capabilities
 * are the allowlist subset; budgetEnforcement states, per limit, how
 * honestly the provider can enforce it. The gateway cross-checks a
 * request's budget against these levels before starting an execution: a
 * token limit sent to a provider that cannot report usage is rejected,
 * not silently downgraded.
 */
export interface AgentProviderCapabilities {
  /** Capabilities this provider can exercise. Must be a subset of AGENT_CAPABILITIES. */
  readonly capabilities: readonly AgentCapability[];
  /**
   * Per-limit enforcement honesty (ADR-0020 §8). Duration is always at
   * least `gateway-enforced` — the gateway owns the provider process.
   */
  readonly budgetEnforcement: {
    readonly maxDurationMs: BudgetEnforcementLevel;
    readonly maxToolCalls: BudgetEnforcementLevel;
    readonly maxInputTokens: BudgetEnforcementLevel;
    readonly maxOutputTokens: BudgetEnforcementLevel;
    readonly maxTotalTokens: BudgetEnforcementLevel;
    readonly maxEstimatedCost: BudgetEnforcementLevel;
  };
}

/**
 * Handle to a running or resumable agent execution (revision A). Returned
 * by start() and resume(); the gateway correlates the handle to the
 * persisted execution it created.
 */
export interface AgentExecutionHandle {
  /** Correlates to the AgentExecutionRequest that created the execution. */
  readonly executionId: string;

  /**
   * Final result. Resolves exactly once; rejects only on transport-level
   * failure (provider unreachable, contract violation). Timeouts,
   * cancellations, and crashes are VALUES (`timed_out`, `cancelled`,
   * `interrupted` results), never rejections and never `completed`.
   */
  result(): Promise<AgentExecutionResult>;

  /**
   * Subscribe to lifecycle events (observability only — an event never
   * authorizes anything). Returns an unsubscribe function. Subscribing
   * after events were emitted may miss them; the gateway persists events
   * independently of this subscription.
   */
  events(onEvent: AgentEventSink): () => void;
}

export interface AgentProvider {
  readonly id: AgentProviderId;

  /** The capabilities and enforcement levels this provider honestly supports. */
  capabilities(): Promise<AgentProviderCapabilities>;

  /** Probe provider configuration and connectivity without executing work. */
  healthCheck(): Promise<AgentHealth>;

  /**
   * Start a bounded execution. The gateway persists the original request
   * BEFORE calling start, so the request can never drift between attempts.
   * If `signal` is already aborted, the handle's result() resolves with a
   * `cancelled` result rather than throwing.
   */
  start(request: AgentExecutionRequest, signal: AbortSignal): Promise<AgentExecutionHandle>;

  /**
   * Resume a previously interrupted execution. Addressed by
   * (executionId, resumeToken) ONLY — the gateway owns the original
   * request and does not re-submit it. The resumeToken is a credential:
   * it is never logged and never appears in events.
   */
  resume(executionId: string, resumeToken: string): Promise<AgentExecutionHandle>;

  /**
   * Cancel an in-flight execution. Cancelling an unknown executionId is a
   * no-op (resolves void), not an error — the execution is already stopped.
   */
  cancel(executionId: string): Promise<void>;
}
