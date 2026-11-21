// packages/cli/src/application/agent/gateway.test.ts
//
// Gateway unit tests (PR3, ADR-0019 v2 revisions A/C/D): the frozen
// request, the policy chain, capability/budget honesty cross-checks,
// gateway-enforced duration, idempotent event persistence with a
// fail-closed policyHash check, sequence auditing, result correlation,
// cancellation, resume — and the proof that resume tokens never reach
// disk.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGENT_EVENT_SCHEMA_VERSION,
  AGENT_EXECUTION_SCHEMA_VERSION,
  AGENT_POLICY_SNAPSHOT_SCHEMA_VERSION,
  type AgentEventSink,
  type AgentExecutionEvent,
  type AgentExecutionHandle,
  type AgentExecutionRequest,
  type AgentExecutionResult,
  type AgentPolicySnapshot,
  type AgentProvider,
  type AgentProviderCapabilities,
  type AgentProviderId,
  computePolicyHash,
} from '@agentic-sdlc-kit/contracts';
import { MockAgentProvider, sampleAgentExecutionRequest } from '@agentic-sdlc-kit/testing';
import { findInExecutionRecords } from './execution-store.js';
import { AgentGateway } from './gateway.js';

function tempProjectRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'kit-gateway-'));
}

/** Build a consistent request+snapshot pair from the shared fixture. */
function buildRequest(overrides: Partial<AgentExecutionRequest> = {}): {
  request: AgentExecutionRequest;
  snapshot: AgentPolicySnapshot;
} {
  const base = structuredClone(
    sampleAgentExecutionRequest,
  ) as unknown as AgentExecutionRequest;
  const snapshot: AgentPolicySnapshot = {
    schemaVersion: AGENT_POLICY_SNAPSHOT_SCHEMA_VERSION,
    permissions: base.permissions,
    budget: base.budget,
    approvalPolicy: base.approvalPolicy,
  };
  const request: AgentExecutionRequest = {
    ...base,
    policyHash: computePolicyHash(snapshot),
    ...overrides,
  };
  return { request, snapshot };
}

/**
 * Minimal scripted provider for gateway edge cases: replays a fixed event
 * list on subscribe and resolves/rejects result() as configured. It never
 * touches the filesystem — the assertions are about what the GATEWAY
 * persists.
 */
class ScriptedProvider implements AgentProvider {
  readonly id: AgentProviderId;
  private readonly events: readonly AgentExecutionEvent[];
  private readonly result: (request: AgentExecutionRequest) => Promise<AgentExecutionResult>;
  readonly started: AgentExecutionRequest[] = [];

  constructor(opts: {
    id?: string;
    events?: readonly AgentExecutionEvent[];
    result?: (request: AgentExecutionRequest) => Promise<AgentExecutionResult>;
  }) {
    // Default 'mock': the shared sample request's providerId is 'mock', so
    // the gateway's registry lookup succeeds without request surgery.
    this.id = (opts.id ?? 'mock') as AgentProviderId;
    this.events = opts.events ?? [];
    this.result =
      opts.result ?? ((request) => Promise.resolve(buildScriptedResult(request.executionId)));
  }

  async capabilities(): Promise<AgentProviderCapabilities> {
    return {
      capabilities: ['repository.read', 'repository.write', 'process.test'],
      budgetEnforcement: {
        maxDurationMs: 'gateway-enforced',
        maxToolCalls: 'gateway-enforced',
        maxInputTokens: 'best-effort',
        maxOutputTokens: 'best-effort',
        maxTotalTokens: 'best-effort',
        maxEstimatedCost: 'best-effort',
      },
    };
  }

  async healthCheck(): Promise<{ available: boolean }> {
    return { available: true };
  }

  async start(
    request: AgentExecutionRequest,
    _signal: AbortSignal,
  ): Promise<AgentExecutionHandle> {
    this.started.push(request);
    const listeners = new Set<AgentEventSink>();
    // Events replay synchronously to every subscriber (the gateway
    // subscribes before awaiting result()).
    return {
      executionId: request.executionId,
      result: () => this.result(request),
      events: (onEvent: AgentEventSink): (() => void) => {
        for (const e of this.events) onEvent(e);
        listeners.add(onEvent);
        return () => listeners.delete(onEvent);
      },
    };
  }

  async resume(): Promise<AgentExecutionHandle> {
    throw new Error('scripted provider does not resume');
  }

  async cancel(): Promise<void> {
    /* no-op */
  }
}

function buildScriptedResult(executionId: string): AgentExecutionResult {
  return {
    schemaVersion: AGENT_EXECUTION_SCHEMA_VERSION,
    executionId,
    workflowRunId: 'run-fixture-001',
    taskId: 'TASK-001',
    providerId: 'mock',
    status: 'completed',
    summary: 'scripted completion',
    proposedArtifacts: [],
    requestedApprovals: [],
    usage: { durationMs: 1 },
    errors: [],
  };
}

function scriptedEvent(
  executionId: string,
  policyHash: string,
  sequence: number,
  eventId = `evt-${executionId}-${sequence}`,
): AgentExecutionEvent {
  return {
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    eventId,
    executionId,
    sequence,
    policyHash,
    occurredAt: new Date().toISOString(),
    type: 'execution.started',
  };
}

describe('AgentGateway start: validation and cross-checks', () => {
  it('rejects a request that fails contract validation (nothing persisted)', async () => {
    const root = await tempProjectRoot();
    const gateway = new AgentGateway({ providers: [], projectRoot: root });
    const { request, snapshot } = buildRequest();
    const bad = { ...request, schemaVersion: 99 } as AgentExecutionRequest;
    const res = await gateway.start(bad, { policySnapshot: snapshot });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('CONTRACT_INVALID');
    expect(await gateway.listExecutions()).toEqual([]);
  });

  it('fails with AGENT_PROVIDER_NOT_CONFIGURED when the provider is not registered', async () => {
    const root = await tempProjectRoot();
    const gateway = new AgentGateway({ providers: [], projectRoot: root });
    const { request, snapshot } = buildRequest();
    const res = await gateway.start(request, { policySnapshot: snapshot });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('AGENT_PROVIDER_NOT_CONFIGURED');
      expect(res.error.message).toContain(request.providerId);
    }
  });

  it('rejects a snapshot that diverges from the request policy fields', async () => {
    const root = await tempProjectRoot();
    const provider = new MockAgentProvider();
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root });
    const { request, snapshot } = buildRequest();
    const diverged: AgentPolicySnapshot = {
      ...snapshot,
      permissions: { ...snapshot.permissions, networkAllowed: true },
    };
    // request.policyHash still hashes the ORIGINAL snapshot — chain broken.
    const res = await gateway.start(request, { policySnapshot: diverged });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('POLICY_VIOLATION');
  });

  it('rejects a policyHash that does not match the snapshot', async () => {
    const root = await tempProjectRoot();
    const provider = new MockAgentProvider();
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root });
    const { request, snapshot } = buildRequest({ policyHash: 'sha256:not-the-snapshot' });
    const res = await gateway.start(request, { policySnapshot: snapshot });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('POLICY_VIOLATION');
  });

  it('rejects capabilities the provider does not support (honest grant)', async () => {
    const root = await tempProjectRoot();
    const provider = new MockAgentProvider(); // supports no git.write
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root });
    const { request, snapshot } = buildRequest();
    const extended: AgentPolicySnapshot = {
      ...snapshot,
      permissions: {
        ...snapshot.permissions,
        capabilities: [...snapshot.permissions.capabilities, 'git.write'],
      },
    };
    const res = await gateway.start(
      { ...request, permissions: extended.permissions, policyHash: computePolicyHash(extended) },
      { policySnapshot: extended },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('POLICY_VIOLATION');
      expect(res.error.message).toContain('git.write');
    }
  });

  it('rejects a cost budget the provider can only enforce best-effort (rev C)', async () => {
    const root = await tempProjectRoot();
    const provider = new MockAgentProvider(); // cost: best-effort
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root });
    const { request, snapshot } = buildRequest();
    const costly: AgentPolicySnapshot = {
      ...snapshot,
      budget: { ...snapshot.budget, maxEstimatedCost: { amount: 1, currency: 'USD' } },
    };
    const res = await gateway.start(
      { ...request, budget: costly.budget, policyHash: computePolicyHash(costly) },
      { policySnapshot: costly },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('maxEstimatedCost');
  });
});

describe('AgentGateway start: happy path and persistence', () => {
  it('persists the original request BEFORE the provider sees it, then the terminal state', async () => {
    const root = await tempProjectRoot();
    const provider = new MockAgentProvider();
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root });
    const { request, snapshot } = buildRequest();
    const res = await gateway.start(request, { policySnapshot: snapshot });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe('completed');
    expect(res.value.request).toEqual(request); // frozen verbatim (rev A)
    expect(res.value.policySnapshot).toEqual(snapshot);
    expect(res.value.attempts).toBe(1);
    // Events: started, tool.requested, tool.result, completed — all accepted.
    expect(res.value.events.map((e) => e.type)).toEqual([
      'execution.started',
      'tool.requested',
      'tool.result',
      'execution.completed',
    ]);
    // Sequences are monotonic from 1.
    expect(res.value.events.map((e) => e.sequence)).toEqual([1, 2, 3, 4]);
    // Every event echoes the frozen policyHash.
    for (const e of res.value.events) expect(e.policyHash).toBe(request.policyHash);
    // Replay is idempotent: a fresh read returns the same durable record.
    const again = await gateway.getExecution(request.executionId);
    expect(again?.events).toHaveLength(4);
    expect(again?.status).toBe('completed');
  });

  it('is reachable through listExecutions', async () => {
    const root = await tempProjectRoot();
    const provider = new MockAgentProvider();
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root });
    const { request, snapshot } = buildRequest();
    await gateway.start(request, { policySnapshot: snapshot });
    expect((await gateway.listExecutions()).map((e) => e.executionId)).toEqual([
      request.executionId,
    ]);
  });
});

describe('AgentGateway event pipeline (rev D): fail closed, idempotent', () => {
  it('rejects events whose policyHash echo does not match the frozen policy', async () => {
    const root = await tempProjectRoot();
    const { request, snapshot } = buildRequest();
    const provider = new ScriptedProvider({
      events: [
        scriptedEvent(request.executionId, 'sha256:wrong-policy', 1),
        scriptedEvent(request.executionId, request.policyHash, 2),
      ],
    });
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root });
    const res = await gateway.start(request, { policySnapshot: snapshot });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Only the matching event was accepted...
    expect(res.value.events.map((e) => e.sequence)).toEqual([2]);
    // ...and the rejection is audited, not silent.
    expect(res.value.eventAudit.map((a) => a.kind)).toContain('policy-hash-mismatch');
  });

  it('skips duplicate eventIds idempotently and audits them', async () => {
    const root = await tempProjectRoot();
    const { request, snapshot } = buildRequest();
    const dup = scriptedEvent(request.executionId, request.policyHash, 1);
    const provider = new ScriptedProvider({
      events: [dup, { ...dup, sequence: 2 }],
    });
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root });
    const res = await gateway.start(request, { policySnapshot: snapshot });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.events).toHaveLength(1);
    expect(res.value.eventAudit.map((a) => a.kind)).toContain('duplicate-event-id');
  });

  it('flags non-monotonic sequences and gaps, but stores the events (detectable)', async () => {
    const root = await tempProjectRoot();
    const { request, snapshot } = buildRequest();
    const provider = new ScriptedProvider({
      events: [
        scriptedEvent(request.executionId, request.policyHash, 1),
        scriptedEvent(request.executionId, request.policyHash, 1, 'evt-sequence-regression'),
        scriptedEvent(request.executionId, request.policyHash, 5),
      ],
    });
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root });
    const res = await gateway.start(request, { policySnapshot: snapshot });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.events).toHaveLength(3);
    const anomalies = res.value.eventAudit.filter((a) => a.kind === 'sequence-anomaly');
    expect(anomalies).toHaveLength(2);
  });

  it('rejects events for a different executionId', async () => {
    const root = await tempProjectRoot();
    const { request, snapshot } = buildRequest();
    const provider = new ScriptedProvider({
      events: [scriptedEvent('someone-else', request.policyHash, 1)],
    });
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root });
    const res = await gateway.start(request, { policySnapshot: snapshot });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.events).toHaveLength(0);
    expect(res.value.eventAudit.map((a) => a.kind)).toContain('wrong-execution-id');
  });
});

describe('AgentGateway results and enforced bounds', () => {
  it('refuses a result that fails contract validation (interrupted, never completed)', async () => {
    const root = await tempProjectRoot();
    const { request, snapshot } = buildRequest();
    const provider = new ScriptedProvider({
      result: () =>
        Promise.resolve({ bogus: true } as unknown as AgentExecutionResult),
    });
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root });
    const res = await gateway.start(request, { policySnapshot: snapshot });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('CONTRACT_INVALID');
    const stored = await gateway.getExecution(request.executionId);
    expect(stored?.status).toBe('interrupted');
  });

  it('refuses a result correlated to a different executionId', async () => {
    const root = await tempProjectRoot();
    const { request, snapshot } = buildRequest();
    const provider = new ScriptedProvider({
      result: () => Promise.resolve(buildScriptedResult('not-my-execution')),
    });
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root });
    const res = await gateway.start(request, { policySnapshot: snapshot });
    expect(res.ok).toBe(false);
    const stored = await gateway.getExecution(request.executionId);
    expect(stored?.status).toBe('interrupted');
    expect(stored?.gatewayNotes.join(' ')).toContain('correlation refused');
  });

  it('treats a transport-level rejection as interrupted with an INTERNAL error', async () => {
    const root = await tempProjectRoot();
    const { request, snapshot } = buildRequest();
    const provider = new ScriptedProvider({
      result: () => Promise.reject(new Error('provider unreachable')),
    });
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root });
    const res = await gateway.start(request, { policySnapshot: snapshot });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('INTERNAL');
    const stored = await gateway.getExecution(request.executionId);
    expect(stored?.status).toBe('interrupted');
  });

  it('enforces the duration budget itself: breach ends timed_out with the provider report kept', async () => {
    const root = await tempProjectRoot();
    const provider = new MockAgentProvider({ delayMs: 2_000 });
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root });
    const { request, snapshot } = buildRequest();
    const tight: AgentPolicySnapshot = {
      ...snapshot,
      budget: { ...snapshot.budget, maxDurationMs: 100 },
    };
    const res = await gateway.start(
      { ...request, budget: tight.budget, policyHash: computePolicyHash(tight) },
      { policySnapshot: tight },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe('timed_out');
    expect(res.value.providerReportedStatus).toBe('cancelled'); // mock reports cancelled after the gateway's abort
    expect(res.value.gatewayNotes.join(' ')).toContain('duration budget');
  });

  it('propagates an external abort as cancelled', async () => {
    const root = await tempProjectRoot();
    const provider = new MockAgentProvider({ delayMs: 2_000 });
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root });
    const { request, snapshot } = buildRequest();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    const res = await gateway.start(request, { policySnapshot: snapshot, signal: controller.signal });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe('cancelled');
  });

  it('an already-aborted signal yields cancelled without executing work', async () => {
    const root = await tempProjectRoot();
    let workRan = false;
    const provider = new MockAgentProvider({
      delayMs: 0,
      performWork: () => {
        workRan = true;
      },
    });
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root });
    const { request, snapshot } = buildRequest();
    const controller = new AbortController();
    controller.abort();
    const res = await gateway.start(request, { policySnapshot: snapshot, signal: controller.signal });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe('cancelled');
    expect(workRan).toBe(false);
  });
});

describe('AgentGateway resume and cancel', () => {
  it('resume reuses the persisted execution and increments attempts; token never persists', async () => {
    const root = await tempProjectRoot();
    const { request, snapshot } = buildRequest();
    const provider = new MockAgentProvider({
      resumePolicyHash: request.policyHash,
    });
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root });
    const first = await gateway.start(request, { policySnapshot: snapshot });
    expect(first.ok).toBe(true);

    const SECRET_TOKEN = 'tok-NEVER-PERSIST-abc123';
    const second = await gateway.resume(request.executionId, SECRET_TOKEN);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.attempts).toBe(2);
    expect(second.value.status).toBe('completed');
    // The mock's resume replays the same eventIds — idempotent skip.
    expect(second.value.eventAudit.map((a) => a.kind)).toContain('duplicate-event-id');
    // SECURITY (ADR-0020 §6): the credential never reached disk.
    expect(await findInExecutionRecords(root, SECRET_TOKEN)).toEqual([]);
    expect(provider.wasResumedWith(request.executionId)).toBe(SECRET_TOKEN);
  });

  it('resume of an unknown execution is an error', async () => {
    const root = await tempProjectRoot();
    const gateway = new AgentGateway({
      providers: [new MockAgentProvider()],
      projectRoot: root,
    });
    const res = await gateway.resume('never-started', 'tok');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('CONTRACT_INVALID');
  });

  it('cancel of an unknown execution is an error, not a guess', async () => {
    const root = await tempProjectRoot();
    const gateway = new AgentGateway({
      providers: [new MockAgentProvider()],
      projectRoot: root,
    });
    const res = await gateway.cancel('never-started');
    expect(res.ok).toBe(false);
  });

  it('cancel marks a non-terminal execution cancelled and is idempotent', async () => {
    const root = await tempProjectRoot();
    const { request, snapshot } = buildRequest();
    const provider = new ScriptedProvider({
      // Never settles on its own: only the gateway's cancel path can end it.
      result: () => new Promise<AgentExecutionResult>(() => undefined),
    });
    const gateway = new AgentGateway({ providers: [provider], projectRoot: root, drainMs: 200 });
    const startPromise = gateway.start(request, { policySnapshot: snapshot });
    // Give the start path a tick to persist the record, then cancel.
    await new Promise((r) => setTimeout(r, 20));
    await gateway.cancel(request.executionId);
    const res = await startPromise;
    // The scripted provider never lands a result; after the drain window
    // the gateway concludes the execution ended by its own cancellation.
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.status).toBe('cancelled');
    const stored = await gateway.getExecution(request.executionId);
    expect(stored?.status).toBe('cancelled');
    const again = await gateway.cancel(request.executionId);
    expect(again.ok).toBe(true);
  });
});
