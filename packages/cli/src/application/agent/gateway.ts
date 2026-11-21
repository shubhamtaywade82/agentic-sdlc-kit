// packages/cli/src/application/agent/gateway.ts
//
// Agent gateway (ADR-0019 v2 revision A + §4, PR3). The gateway sits
// between the orchestrator and every AgentProvider and owns everything
// durable about an execution:
//
//   - the ORIGINAL request, frozen and persisted BEFORE the provider is
//     called, so it can never drift between attempts (revision A);
//   - the canonical policy snapshot the execution was granted under, and
//     its hash — every event must echo it or be rejected (fail closed,
//     ADR-0020 §4);
//   - the event stream, persisted idempotently (dedupe on eventId) with
//     an audit trail of rejections and sequence anomalies (revision D);
//   - the final result, validated for correlation before it is trusted;
//   - gateway-enforced bounds the gateway can always keep: duration
//     (it owns the abort signal and cancels the provider) and tool-call
//     count (counted from tool.requested events). Exceeding an enforced
//     bound is a terminal outcome, never silent continuation.
//
// Providers are INJECTED. The shipped CLI registers none, so
// `kit feature <id> run` fails with AGENT_PROVIDER_NOT_CONFIGURED until a
// provider is configured (PR4 adds claude-code). Embedding code (tests,
// tooling) constructs the gateway with its own provider list.
//
// SECURITY: resume tokens are credentials (ADR-0020 §6). The gateway
// holds them in memory only and never writes them to the execution
// record. `resume(executionId, token)` is addressed by the persisted
// execution id; the original request is NEVER re-submitted to the
// provider on resume.

import {
  AgentExecutionEventSchema,
  AgentExecutionRequestSchema,
  AgentExecutionResultSchema,
  Errors,
  computePolicyHash,
  type AgentEventSink,
  type AgentExecutionHandle,
  type AgentExecutionRequest,
  type AgentExecutionResult,
  type AgentPolicySnapshot,
  type AgentProvider,
  type AgentProviderCapabilities,
  type AgentProviderId,
  type ExecutionBudget,
  type KitError,
  type Result,
} from '@agentic-sdlc-kit/contracts';
import {
  listExecutionIds,
  loadExecution,
  saveExecution,
  type EventAuditKind,
  type EventAuditNote,
  type StoredAgentExecution,
} from './execution-store.js';

export interface AgentGatewayOptions {
  /** Providers this gateway can dispatch to. Empty = nothing configured. */
  readonly providers: ReadonlyArray<AgentProvider>;
  /** Project root; execution records persist under .ai-kit/state/. */
  readonly projectRoot: string;
  /** Injectable clock for deterministic tests. */
  readonly now?: () => Date;
  /** Bounded drain window after a cancel/timeout before the gateway concludes (default 5s). */
  readonly drainMs?: number;
}

export interface StartExecutionOptions {
  /**
   * The canonical policy snapshot freezing what this execution may do.
   * Must equal the request's inline permissions/budget/approvalPolicy,
   * and request.policyHash must be computePolicyHash(snapshot).
   */
  readonly policySnapshot: AgentPolicySnapshot;
  /** External cancellation (SIGINT, orchestrator shutdown). */
  readonly signal?: AbortSignal;
}

/** How long to wait for the provider to land its result after the gateway cancels. */
const DEFAULT_CANCEL_DRAIN_MS = 5_000;

export class AgentGateway {
  private readonly providers: Map<AgentProviderId, AgentProvider>;
  private readonly projectRoot: string;
  private readonly now: () => Date;
  private readonly drainMs: number;
  /** Resume tokens, held in memory ONLY (never persisted). */
  private readonly resumeTokens = new Map<string, string>();
  /** In-flight execution controllers, so cancel() can reach them. */
  private readonly inFlight = new Map<string, AbortController>();
  /**
   * Per-execution persistence queue. Event arrivals, the terminal result,
   * and late drain reports all write the SAME record file; concurrent
   * writes would race on the tmp file. Saves for one execution are
   * strictly serialized — last enqueued state wins on disk.
   */
  private readonly persistQueues = new Map<string, Promise<void>>();

  constructor(opts: AgentGatewayOptions) {
    this.providers = new Map(opts.providers.map((p) => [p.id, p]));
    this.projectRoot = opts.projectRoot;
    this.now = opts.now ?? (() => new Date());
    this.drainMs = opts.drainMs ?? DEFAULT_CANCEL_DRAIN_MS;
  }

  hasProvider(id: string): boolean {
    return this.providers.has(id);
  }

  listProviders(): AgentProviderId[] {
    return [...this.providers.keys()];
  }

  /** The in-memory resume token for an execution, if one was issued. */
  resumeTokenFor(executionId: string): string | undefined {
    return this.resumeTokens.get(executionId);
  }

  async start(
    request: AgentExecutionRequest,
    opts: StartExecutionOptions,
  ): Promise<Result<StoredAgentExecution>> {
    // 1. Contract validation — a malformed request never reaches a provider.
    const parsed = AgentExecutionRequestSchema.safeParse(request);
    if (!parsed.success) {
      return {
        ok: false,
        error: Errors.contractInvalid(
          `Agent execution request failed contract validation: ${formatIssues(parsed.error.issues)}`,
        ),
      };
    }
    const valid = parsed.data;

    // 2. Provider must be configured.
    const provider = this.providers.get(valid.providerId);
    if (!provider) {
      return {
        ok: false,
        error: Errors.agentProviderNotConfigured(
          `No agent provider '${valid.providerId}' is configured ` +
            `(registered: ${this.listProviders().join(', ') || 'none'}). ` +
            `Mode 1 execution requires a provider; it will not fall back to ` +
            `pretending a manual workflow completed.`,
        ),
      };
    }

    // 3. Policy chain: the snapshot is the frozen policy; the request's
    //    inline policy fields must match it exactly and its policyHash
    //    must be the hash of the snapshot. Any drift fails closed.
    const policyCheck = validatePolicyChain(valid, opts.policySnapshot);
    if (!policyCheck.ok) return { ok: false, error: policyCheck.error };

    // 4. Provider capability + budget honesty cross-checks (rev C).
    const caps = await provider.capabilities();
    const capCheck = checkCapabilityGrant(valid, caps);
    if (!capCheck.ok) return { ok: false, error: capCheck.error };
    const budgetCheck = checkBudgetEnforceability(valid.budget, caps, provider.id);
    if (!budgetCheck.ok) return { ok: false, error: budgetCheck.error };

    // 5. Persist the ORIGINAL request before the provider sees it (rev A).
    const createdAt = this.now().toISOString();
    const execution: StoredAgentExecution = {
      executionId: valid.executionId,
      workflowRunId: valid.workflowRunId,
      taskId: valid.taskId,
      providerId: valid.providerId,
      policyHash: valid.policyHash,
      policySnapshot: opts.policySnapshot,
      request: valid,
      status: 'running',
      attempts: 1,
      events: [],
      eventAudit: [],
      gatewayNotes: [],
      createdAt,
      updatedAt: createdAt,
    };
    const persistErr = await this.persist(execution);
    if (persistErr) return { ok: false, error: persistErr };

    // 6. Run under the gateway's controller, which links the external
    //    signal and the duration budget.
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener('abort', onExternalAbort, { once: true });
    }
    try {
      const handle = await provider.start(valid, controller.signal);
      return await this.awaitSettlement(execution, handle, controller, valid.budget);
    } finally {
      if (opts.signal) opts.signal.removeEventListener('abort', onExternalAbort);
    }
  }

  /**
   * Resume a persisted execution by (executionId, resumeToken). The
   * original request is NOT re-submitted — the gateway already froze it
   * (revision A). The token is a credential: used, never stored.
   */
  async resume(executionId: string, resumeToken: string): Promise<Result<StoredAgentExecution>> {
    const existing = await loadExecution(this.projectRoot, executionId);
    if (!existing) {
      return {
        ok: false,
        error: Errors.contractInvalid(
          `Unknown agent execution '${executionId}' — nothing to resume`,
        ),
      };
    }
    const provider = this.providers.get(existing.providerId);
    if (!provider) {
      return {
        ok: false,
        error: Errors.agentProviderNotConfigured(
          `Provider '${existing.providerId}' for execution ${executionId} is not configured`,
        ),
      };
    }
    const execution: StoredAgentExecution = {
      ...existing,
      attempts: existing.attempts + 1,
      status: 'running',
      updatedAt: this.now().toISOString(),
    };
    const persistErr = await this.persist(execution);
    if (persistErr) return { ok: false, error: persistErr };

    const controller = new AbortController();
    const handle = await provider.resume(executionId, resumeToken);
    return await this.awaitSettlement(execution, handle, controller, execution.request.budget);
  }

  /** Cancel an execution (idempotent; unknown ids are an error, not a guess). */
  async cancel(executionId: string): Promise<Result<StoredAgentExecution>> {
    const existing = await loadExecution(this.projectRoot, executionId);
    if (!existing) {
      return {
        ok: false,
        error: Errors.contractInvalid(`Unknown agent execution '${executionId}'`),
      };
    }
    const provider = this.providers.get(existing.providerId);
    if (provider) await provider.cancel(executionId); // unknown id: no-op by contract
    // Reach the in-flight execution: aborting its controller starts the
    // bounded drain inside awaitSettlement, which finalizes the record.
    this.inFlight.get(executionId)?.abort();
    if (isTerminal(existing.status)) return { ok: true, value: existing };
    const now = this.now().toISOString();
    const execution: StoredAgentExecution = {
      ...existing,
      status: 'cancelled',
      completedAt: now,
      updatedAt: now,
    };
    const persistErr = await this.persist(execution);
    if (persistErr) return { ok: false, error: persistErr };
    return { ok: true, value: execution };
  }

  async getExecution(executionId: string): Promise<StoredAgentExecution | undefined> {
    return loadExecution(this.projectRoot, executionId);
  }

  async listExecutions(): Promise<StoredAgentExecution[]> {
    const out: StoredAgentExecution[] = [];
    for (const id of await listExecutionIds(this.projectRoot)) {
      const record = await loadExecution(this.projectRoot, id);
      if (record) out.push(record);
    }
    return out;
  }

  // ---- internals -------------------------------------------------------

  /**
   * Wire a provider handle into the durable record: subscribe events,
   * race the result against the duration budget, count tool calls, and
   * persist the terminal state. `handle.result()` rejecting is a
   * transport-level failure: the record ends `interrupted`, and the
   * gateway surfaces an INTERNAL error (the provider was unreachable or
   * violated the handle contract) — it is never reported as `completed`.
   */
  private async awaitSettlement(
    initial: StoredAgentExecution,
    handle: AgentExecutionHandle,
    controller: AbortController,
    budget: ExecutionBudget,
  ): Promise<Result<StoredAgentExecution>> {
    let current = initial;
    let lastAcceptedSequence = 0;
    let toolCalls = 0;

    const sink: AgentEventSink = (event: unknown) => {
      const outcome = this.acceptEvent(current, event, lastAcceptedSequence);
      current = outcome.execution;
      lastAcceptedSequence = outcome.lastAcceptedSequence;
      if (outcome.toolCall) toolCalls += 1;
    };
    const unsubscribe = handle.events(sink);
    this.inFlight.set(initial.executionId, controller);

    type Settlement = { kind: 'result'; result: AgentExecutionResult } | { kind: 'breach' } | { kind: 'transport' };
    let breachNotifier: (() => void) | undefined;
    let durationBreached = false;
    const breach = new Promise<void>((resolve) => {
      breachNotifier = resolve;
    });

    const durationTimer = setTimeout(() => {
      // Gateway-enforced duration: abort, cancel, then allow a bounded
      // drain for the provider's own result before declaring timed_out.
      durationBreached = true;
      controller.abort();
      void this.providers.get(current.providerId)?.cancel(current.executionId);
      breachNotifier?.();
    }, budget.maxDurationMs);
    // Any OTHER abort (external signal, gateway.cancel) also starts the
    // bounded drain: the provider gets the window to land its own result;
    // if it never does, the gateway concludes cancelled.
    const onAbortDrain = (): void => breachNotifier?.();
    controller.signal.addEventListener('abort', onAbortDrain, { once: true });

    let drainTimer: ReturnType<typeof setTimeout> | undefined;
    const settlement: Settlement = await new Promise<Settlement>((resolve) => {
      let settled = false;
      const settle = (value: Settlement): void => {
        if (settled) return;
        settled = true;
        clearTimeout(durationTimer);
        if (drainTimer) clearTimeout(drainTimer);
        resolve(value);
      };
      void handle
        .result()
        .then((result) => settle({ kind: 'result', result }))
        .catch(() => settle({ kind: 'transport' }));
      void breach.then(() => {
        drainTimer = setTimeout(() => settle({ kind: 'breach' }), this.drainMs);
      });
    });
    clearTimeout(durationTimer);
    if (drainTimer) clearTimeout(drainTimer);
    controller.signal.removeEventListener('abort', onAbortDrain);
    unsubscribe();
    this.inFlight.delete(initial.executionId);

    if (settlement.kind === 'transport') {
      return this.finalize(current, {
        status: 'interrupted',
        gatewayNotes: [
          ...current.gatewayNotes,
          'gateway: handle.result() rejected — transport-level failure (provider unreachable or handle contract violated)',
        ],
        error: Errors.internal(
          `Provider '${current.providerId}' transport-level failure for execution ` +
            `'${current.executionId}' — recorded as interrupted, never completed`,
        ),
      });
    }

    if (settlement.kind === 'breach') {
      // The provider did not land a result inside the drain window. If the
      // duration budget fired, the outcome is timed_out; any other abort
      // (external signal, gateway.cancel) is a cancellation. Either way it
      // is terminal — a hung execution is never left "running".
      const outcome: StoredAgentExecution['status'] = durationBreached ? 'timed_out' : 'cancelled';
      // If the provider's own result lands after the breach, record what
      // it reported verbatim; the enforced outcome stands.
      void handle
        .result()
        .then(async (late) => {
          const stored = await loadExecution(this.projectRoot, current.executionId);
          if (stored && stored.status === outcome && !stored.providerReportedStatus) {
            await this.persist({ ...stored, providerReportedStatus: late.status });
          }
        })
        .catch(() => undefined);
      return this.finalize(current, {
        status: outcome,
        gatewayNotes: [
          ...current.gatewayNotes,
          durationBreached
            ? `gateway: duration budget of ${budget.maxDurationMs}ms exceeded (gateway-enforced; provider cancelled)`
            : `gateway: execution aborted and the provider landed no result within the ${this.drainMs}ms drain window — concluded cancelled`,
        ],
      });
    }

    const rawResult = settlement.result;

    // If the duration budget fired but the provider still landed a result
    // inside the drain window, the enforced outcome is timed_out: the
    // provider's report is kept verbatim, but a budget breach is not
    // negotiable (a provider cannot out-run the gateway's clock).
    if (durationBreached) {
      const drained = AgentExecutionResultSchema.safeParse(rawResult);
      return this.finalize(current, {
        status: 'timed_out',
        ...(drained.success ? { result: drained.data } : {}),
        ...(drained.success ? { providerReportedStatus: drained.data.status } : {}),
        gatewayNotes: [
          ...current.gatewayNotes,
          `gateway: duration budget of ${budget.maxDurationMs}ms exceeded (gateway-enforced; provider cancelled)`,
          ...(drained.success
            ? [`gateway: provider reported '${drained.data.status}' within the drain window — recorded verbatim`]
            : []),
        ],
      });
    }

    // The result must parse and correlate to THIS execution.
    const parsedResult = AgentExecutionResultSchema.safeParse(rawResult);
    if (!parsedResult.success) {
      return this.finalize(current, {
        status: 'interrupted',
        gatewayNotes: [
          ...current.gatewayNotes,
          `gateway: provider result failed contract validation: ${formatIssues(parsedResult.error.issues)}`,
        ],
        error: Errors.contractInvalid(
          `Provider '${current.providerId}' returned an invalid result for ${current.executionId}`,
        ),
      });
    }
    const result = parsedResult.data;
    if (result.executionId !== current.executionId) {
      return this.finalize(current, {
        status: 'interrupted',
        gatewayNotes: [
          ...current.gatewayNotes,
          `gateway: result claims executionId '${result.executionId}' — correlation refused`,
        ],
        error: Errors.contractInvalid(
          `Provider result for execution '${current.executionId}' claims to be for ` +
            `'${result.executionId}' — refusing to trust it`,
        ),
      });
    }

    // Tool-call budget (gateway-enforced): counted from tool.requested events.
    if (toolCalls > budget.maxToolCalls) {
      controller.abort();
      void this.providers.get(current.providerId)?.cancel(current.executionId);
      return this.finalize(current, {
        status: 'failed',
        result,
        gatewayNotes: [
          ...current.gatewayNotes,
          `gateway: tool-call budget of ${budget.maxToolCalls} exceeded (${toolCalls} tool calls observed)`,
        ],
      });
    }

    // A session resume token is a credential: memory only, never the record.
    if (result.session?.resumeToken) {
      this.resumeTokens.set(result.executionId, result.session.resumeToken);
    }

    return this.finalize(current, { status: result.status, result });
  }

  private async finalize(
    current: StoredAgentExecution,
    outcome: {
      status: StoredAgentExecution['status'];
      result?: AgentExecutionResult;
      providerReportedStatus?: AgentExecutionResult['status'];
      gatewayNotes?: string[];
      error?: KitError;
    },
  ): Promise<Result<StoredAgentExecution>> {
    const now = this.now().toISOString();
    const final: StoredAgentExecution = {
      ...current,
      status: outcome.status,
      // RESUME TOKENS ARE CREDENTIALS (ADR-0020 §6.8): the gateway may hold
      // them in memory (this.resumeTokens) but must NEVER write them to
      // the execution record. The session id is not secret and stays;
      // the token is scrubbed from the persisted copy of the result. PR4
      // hardening: the first real provider to issue session tokens exposed
      // that the original persist path wrote the result verbatim.
      ...(outcome.result !== undefined ? { result: scrubResultForDisk(outcome.result) } : {}),
      ...(outcome.providerReportedStatus !== undefined
        ? { providerReportedStatus: outcome.providerReportedStatus }
        : {}),
      ...(outcome.gatewayNotes !== undefined ? { gatewayNotes: outcome.gatewayNotes } : {}),
      completedAt: now,
      updatedAt: now,
    };
    const persistErr = await this.persist(final);
    if (persistErr) return { ok: false, error: persistErr };
    if (outcome.error) return { ok: false, error: outcome.error };
    return { ok: true, value: final };
  }

  /**
   * Accept-or-reject one provider event against the frozen policy chain:
   * schema validity, execution correlation, policyHash echo (fail
   * closed), eventId idempotency, and sequence monotonicity. Rejected
   * events are audited, never silently dropped.
   */
  private acceptEvent(
    execution: StoredAgentExecution,
    rawEvent: unknown,
    lastAcceptedSequence: number,
  ): { execution: StoredAgentExecution; lastAcceptedSequence: number; toolCall: boolean } {
    const at = this.now().toISOString();
    const audit = (kind: EventAuditKind, detail: string): EventAuditNote => ({ kind, at, detail });

    const parsed = AgentExecutionEventSchema.safeParse(rawEvent);
    if (!parsed.success) {
      return {
        execution: withAudit(
          execution,
          audit(
            'invalid-event',
            `event failed schema validation: ${JSON.stringify(rawEvent).slice(0, 160)}`,
          ),
        ),
        lastAcceptedSequence,
        toolCall: false,
      };
    }
    const event = parsed.data;

    if (event.executionId !== execution.executionId) {
      return {
        execution: withAudit(
          execution,
          audit(
            'wrong-execution-id',
            `event for '${event.executionId}' arrived on '${execution.executionId}'`,
          ),
        ),
        lastAcceptedSequence,
        toolCall: false,
      };
    }

    // Policy traceability (rev D): the echo must match the frozen hash.
    if (event.policyHash !== execution.policyHash) {
      return {
        execution: withAudit(
          execution,
          audit(
            'policy-hash-mismatch',
            `event ${event.eventId} echoed policyHash '${event.policyHash}' but the ` +
              `execution runs under '${execution.policyHash}' — rejected (fail closed)`,
          ),
        ),
        lastAcceptedSequence,
        toolCall: false,
      };
    }

    // Idempotent persistence: a repeated eventId is a no-op, not a duplicate row.
    if (execution.events.some((e) => e.eventId === event.eventId)) {
      return {
        execution: withAudit(
          execution,
          audit('duplicate-event-id', `eventId ${event.eventId} already persisted — skipped`),
        ),
        lastAcceptedSequence,
        toolCall: false,
      };
    }

    const notes: EventAuditNote[] = [];
    if (event.sequence <= lastAcceptedSequence) {
      notes.push(
        audit(
          'sequence-anomaly',
          `sequence ${event.sequence} is not greater than the last accepted ${lastAcceptedSequence}`,
        ),
      );
    } else if (event.sequence > lastAcceptedSequence + 1) {
      notes.push(
        audit(
          'sequence-anomaly',
          `sequence jumps from ${lastAcceptedSequence} to ${event.sequence} — events were skipped or lost`,
        ),
      );
    }

    const updated: StoredAgentExecution = {
      ...execution,
      events: [...execution.events, event],
      eventAudit: [...execution.eventAudit, ...notes],
      updatedAt: at,
    };
    // Best-effort durability per event; the terminal persist is authoritative.
    void this.persist(updated);
    return {
      execution: updated,
      lastAcceptedSequence: Math.max(lastAcceptedSequence, event.sequence),
      toolCall: event.type === 'tool.requested',
    };
  }

  private async persist(execution: StoredAgentExecution): Promise<KitError | undefined> {
    const previous = this.persistQueues.get(execution.executionId) ?? Promise.resolve();
    let report: (error: KitError | undefined) => void = () => undefined;
    const settled = new Promise<KitError | undefined>((resolve) => {
      report = resolve;
    });
    const chained = previous.then(async () => {
      try {
        await saveExecution(this.projectRoot, execution);
        report(undefined);
      } catch (e) {
        report(
          Errors.internal(
            `Failed to persist agent execution ${execution.executionId}: ${String(e)}`,
          ),
        );
      }
    });
    this.persistQueues.set(execution.executionId, chained);
    return settled;
  }
}

function withAudit(execution: StoredAgentExecution, note: EventAuditNote): StoredAgentExecution {
  return { ...execution, eventAudit: [...execution.eventAudit, note] };
}

function isTerminal(status: StoredAgentExecution['status']): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'timed_out' ||
    status === 'interrupted' ||
    status === 'needs_approval'
  );
}

function formatIssues(issues: ReadonlyArray<{ path: (string | number | symbol)[]; message: string }>): string {
  return issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`).join('; ');
}

/**
 * Scrub the resume credential from a result before it reaches disk. The
 * token lives in memory only (this.resumeTokens); the persisted execution
 * record keeps the session id — which is not a credential — but never the
 * token. First exercised for real by the PR4 claude-code provider, whose
 * results carry session tokens by contract.
 */
function scrubResultForDisk(result: AgentExecutionResult): AgentExecutionResult {
  if (!result.session?.resumeToken) return result;
  return { ...result, session: { sessionId: result.session.sessionId } };
}

/** The request's policy fields must be exactly the frozen snapshot's. */
function validatePolicyChain(
  request: AgentExecutionRequest,
  snapshot: AgentPolicySnapshot,
): Result<true> {
  const inline = {
    permissions: request.permissions,
    budget: request.budget,
    approvalPolicy: request.approvalPolicy,
  };
  const rendered = {
    permissions: snapshot.permissions,
    budget: snapshot.budget,
    approvalPolicy: snapshot.approvalPolicy,
  };
  if (JSON.stringify(inline) !== JSON.stringify(rendered)) {
    return {
      ok: false,
      error: Errors.policyViolation(
        'Request policy fields diverge from the policy snapshot — ' +
          'the provider must receive exactly the frozen policy (fail closed)',
      ),
    };
  }
  const hash = computePolicyHash(snapshot);
  if (request.policyHash !== hash) {
    return {
      ok: false,
      error: Errors.policyViolation(
        `request.policyHash '${request.policyHash}' is not the hash of the supplied ` +
          `policy snapshot ('${hash}') — policy traceability is broken`,
      ),
    };
  }
  return { ok: true, value: true };
}

/** Requested capabilities must be a subset of what the provider supports. */
function checkCapabilityGrant(
  request: AgentExecutionRequest,
  caps: AgentProviderCapabilities,
): Result<true> {
  const missing = request.permissions.capabilities.filter((c) => !caps.capabilities.includes(c));
  if (missing.length > 0) {
    return {
      ok: false,
      error: Errors.policyViolation(
        `Provider '${request.providerId}' does not support the granted capabilities: ` +
          `${missing.join(', ')} (supports: ${caps.capabilities.join(', ') || 'none'}) — ` +
          `refusing to grant what cannot be exercised`,
      ),
    };
  }
  return { ok: true, value: true };
}

/**
 * Budget honesty (rev C): a limit the provider cannot enforce or report
 * must not be silently accepted. Monetary cost is the hard case — a
 * provider without reliable cost telemetry declares `best-effort`, and a
 * cost limit under `best-effort` is REJECTED: the evidence could never
 * honestly state the limit held. Token limits at `best-effort` are
 * accepted (the provider reports usage best-effort); duration and tool
 * calls are always gateway-enforced regardless of declaration, because
 * the gateway enforces them itself.
 */
function checkBudgetEnforceability(
  budget: ExecutionBudget,
  caps: AgentProviderCapabilities,
  providerId: string,
): Result<true> {
  if (
    budget.maxEstimatedCost !== undefined &&
    caps.budgetEnforcement.maxEstimatedCost === 'best-effort'
  ) {
    return {
      ok: false,
      error: Errors.policyViolation(
        `Execution budget sets maxEstimatedCost but provider '${providerId}' declares ` +
          `cost enforcement 'best-effort' (no reliable cost telemetry) — the limit ` +
          `cannot be honestly enforced, so the execution is refused (fail closed)`,
      ),
    };
  }
  return { ok: true, value: true };
}
