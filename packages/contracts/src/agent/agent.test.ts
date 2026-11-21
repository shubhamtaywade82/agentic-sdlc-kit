// packages/contracts/src/agent/agent.test.ts
//
// Contract tests for the M36 agent execution surface (v2 revisions A–D).
// These verify the Zod schemas parse valid payloads, reject invalid ones,
// and survive a JSON round trip (no functions, no undefined-dependent
// shapes). See TESTING.md §4.4 and CONTRACTS.md §10.

import { describe, expect, it } from 'vitest';
import {
  AGENT_CAPABILITIES,
  AGENT_EVENT_SCHEMA_VERSION,
  AGENT_EXECUTION_SCHEMA_VERSION,
  BudgetEnforcementLevelSchema,
  AgentCapabilitySchema,
  AgentErrorCodeSchema,
  AgentExecutionErrorSchema,
  AgentExecutionEventSchema,
  AgentExecutionRequestSchema,
  AgentExecutionResultSchema,
  AgentExecutionStatusSchema,
  ExecutionBudgetSchema,
  ExecutionWorkspaceSchema,
  NON_SUCCESS_ERROR_CODES,
  RETRYABLE_ERROR_CODES,
} from './index.js';

const validRequest = {
  schemaVersion: AGENT_EXECUTION_SCHEMA_VERSION,
  executionId: 'exec-001',
  workflowRunId: 'run-001',
  taskId: 'TASK-001',
  providerId: 'claude-code',
  taskKind: 'implementation',
  policyHash: 'sha256:9f2c1ab4',
  workspace: {
    id: 'ws-001',
    kind: 'git-worktree',
    rootPath: '/repo/worktrees/run-001',
    branch: 'kit/run-001',
    baseCommitSha: 'a1b2c3d4e5f6',
    createdAt: '2026-11-20T12:00:00.000Z',
  },
  instructions: 'Implement user registration with email verification.',
  context: {
    specificationRef: 'docs/specifications/features/FEATURE-001/spec.md',
    planRef: 'docs/plans/FEATURE-001/plan.md',
    relevantFiles: ['src/auth/registration.ts'],
    constraints: ['No new runtime dependencies'],
  },
  permissions: {
    capabilities: ['repository.read', 'repository.write', 'process.test'],
    writablePaths: ['/repo/worktrees/run-001/src'],
    networkAllowed: false,
  },
  budget: {
    maxDurationMs: 600_000,
    maxToolCalls: 50,
    maxInputTokens: 150_000,
    maxOutputTokens: 50_000,
  },
  approvalPolicy: {
    requireApprovalFor: ['external.approval'],
    allowAutonomousExecution: true,
  },
};

const validResult = {
  schemaVersion: AGENT_EXECUTION_SCHEMA_VERSION,
  executionId: 'exec-001',
  workflowRunId: 'run-001',
  taskId: 'TASK-001',
  providerId: 'claude-code',
  status: 'completed',
  summary: 'Implemented registration service and email verification flow.',
  proposedArtifacts: [
    { path: 'src/auth/registration.ts', operation: 'create' },
    { path: 'src/auth/verification.ts', operation: 'create' },
  ],
  requestedApprovals: [],
  usage: { inputTokens: 12_000, outputTokens: 3_400, durationMs: 42_000 },
  errors: [],
};

function event(over: Record<string, unknown>): unknown {
  return {
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    eventId: 'evt-001',
    executionId: 'exec-001',
    sequence: 1,
    policyHash: validRequest.policyHash,
    occurredAt: '2026-11-20T12:00:00.000Z',
    ...over,
  };
}

describe('AgentExecutionRequestSchema (v2)', () => {
  it('parses a valid, fully-populated request', () => {
    const r = AgentExecutionRequestSchema.safeParse(validRequest);
    expect(r.success).toBe(true);
  });

  it('survives a JSON round trip', () => {
    const parsed = AgentExecutionRequestSchema.parse(validRequest);
    const re = AgentExecutionRequestSchema.safeParse(JSON.parse(JSON.stringify(parsed)));
    expect(re.success).toBe(true);
  });

  it('rejects an uppercase providerId (must be kebab-case)', () => {
    const r = AgentExecutionRequestSchema.safeParse({ ...validRequest, providerId: 'ClaudeCode' });
    expect(r.success).toBe(false);
  });

  it('rejects an empty instructions string', () => {
    const r = AgentExecutionRequestSchema.safeParse({ ...validRequest, instructions: '' });
    expect(r.success).toBe(false);
  });

  it('rejects a missing workspace (revision B: no cwd assumption)', () => {
    const { workspace, ...withoutWorkspace } = validRequest;
    expect(workspace).toBeDefined();
    const r = AgentExecutionRequestSchema.safeParse(withoutWorkspace);
    expect(r.success).toBe(false);
  });

  it('rejects a git-worktree workspace without branch/baseCommitSha', () => {
    const r = AgentExecutionRequestSchema.safeParse({
      ...validRequest,
      workspace: { ...validRequest.workspace, branch: undefined, baseCommitSha: undefined },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a workspace with an unknown kind', () => {
    const r = AgentExecutionRequestSchema.safeParse({
      ...validRequest,
      workspace: { ...validRequest.workspace, kind: 'vm' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a missing budget (revision C)', () => {
    const { budget, ...withoutBudget } = validRequest;
    expect(budget).toBeDefined();
    const r = AgentExecutionRequestSchema.safeParse(withoutBudget);
    expect(r.success).toBe(false);
  });

  it('rejects a missing policyHash (revision D: policy traceability)', () => {
    const { policyHash, ...withoutHash } = validRequest;
    expect(policyHash).toBeDefined();
    const r = AgentExecutionRequestSchema.safeParse(withoutHash);
    expect(r.success).toBe(false);
  });

  it('rejects a capability outside the allowlist (arbitrary shell is not a capability)', () => {
    const r = AgentExecutionRequestSchema.safeParse({
      ...validRequest,
      permissions: { ...validRequest.permissions, capabilities: ['process.shell'] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a v1 schemaVersion', () => {
    const r = AgentExecutionRequestSchema.safeParse({ ...validRequest, schemaVersion: 1 });
    expect(r.success).toBe(false);
  });
});

describe('ExecutionWorkspaceSchema', () => {
  it('accepts a container workspace without git fields', () => {
    const r = ExecutionWorkspaceSchema.safeParse({
      id: 'ws-c',
      kind: 'container',
      rootPath: '/var/containers/exec-1',
      createdAt: '2026-11-20T12:00:00.000Z',
    });
    expect(r.success).toBe(true);
  });

  it('rejects an empty rootPath', () => {
    const r = ExecutionWorkspaceSchema.safeParse({
      id: 'ws-c',
      kind: 'directory',
      rootPath: '',
      createdAt: '2026-11-20T12:00:00.000Z',
    });
    expect(r.success).toBe(false);
  });
});

describe('ExecutionBudgetSchema', () => {
  it('requires duration and tool calls (gateway-enforceable)', () => {
    const r = ExecutionBudgetSchema.safeParse({ maxDurationMs: 1000, maxToolCalls: 10 });
    expect(r.success).toBe(true);
  });

  it('rejects a non-positive duration', () => {
    const r = ExecutionBudgetSchema.safeParse({ maxDurationMs: 0, maxToolCalls: 10 });
    expect(r.success).toBe(false);
  });

  it('accepts an estimated cost with currency', () => {
    const r = ExecutionBudgetSchema.safeParse({
      maxDurationMs: 1000,
      maxToolCalls: 10,
      maxEstimatedCost: { amount: 2.5, currency: 'USD' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects an estimated cost without currency', () => {
    const r = ExecutionBudgetSchema.safeParse({
      maxDurationMs: 1000,
      maxToolCalls: 10,
      maxEstimatedCost: { amount: 2.5 },
    });
    expect(r.success).toBe(false);
  });
});

describe('BudgetEnforcementLevelSchema (revision C honesty)', () => {
  it('accepts exactly the three honest levels', () => {
    expect(BudgetEnforcementLevelSchema.options).toEqual([
      'provider-enforced',
      'gateway-enforced',
      'best-effort',
    ]);
  });

  it('rejects a made-up level like "always-enforced"', () => {
    const r = BudgetEnforcementLevelSchema.safeParse('always-enforced');
    expect(r.success).toBe(false);
  });
});

describe('AgentExecutionResultSchema', () => {
  it('parses a valid completed result', () => {
    const r = AgentExecutionResultSchema.safeParse(validResult);
    expect(r.success).toBe(true);
  });

  it('parses a failed result with a typed error', () => {
    const r = AgentExecutionResultSchema.safeParse({
      ...validResult,
      status: 'timed_out',
      summary: 'Agent exceeded budget maxDurationMs after partial implementation.',
      errors: [{ code: 'PROVIDER_TIMEOUT', message: 'exceeded 600000ms', retryable: false }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an empty summary (a result must explain itself)', () => {
    const r = AgentExecutionResultSchema.safeParse({ ...validResult, summary: '' });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown status', () => {
    const r = AgentExecutionResultSchema.safeParse({ ...validResult, status: 'success' });
    expect(r.success).toBe(false);
  });

  it('rejects a result whose proposedArtifacts use an invalid operation', () => {
    const r = AgentExecutionResultSchema.safeParse({
      ...validResult,
      proposedArtifacts: [{ path: 'src/x.ts', operation: 'move' }],
    });
    expect(r.success).toBe(false);
  });
});

describe('AgentExecutionEventSchema (v2 envelope, revision D)', () => {
  it('parses each event variant', () => {
    const cases: Array<{ type: string; extra: Record<string, unknown> }> = [
      { type: 'execution.started', extra: {} },
      { type: 'message.delta', extra: { content: 'hello' } },
      { type: 'tool.requested', extra: { toolCallId: 'tc-1', capability: 'process.test' } },
      { type: 'tool.result', extra: { toolCallId: 'tc-1', status: 'succeeded' } },
      {
        type: 'approval.required',
        extra: { approvalId: 'ap-1', action: 'deploy', reason: 'production deploy' },
      },
      { type: 'execution.progress', extra: { taskId: 'TASK-001', progress: 0.5 } },
      { type: 'execution.completed', extra: { status: 'completed' } },
    ];
    for (const [i, c] of cases.entries()) {
      const r = AgentExecutionEventSchema.safeParse(
        event({ type: c.type, sequence: i + 1, eventId: `evt-${i + 1}`, ...c.extra }),
      );
      expect(r.success, `event type ${c.type}`).toBe(true);
    }
  });

  it('rejects an event missing the monotonic sequence field', () => {
    const e = event({ type: 'execution.started' });
    delete (e as { sequence?: number }).sequence;
    const r = AgentExecutionEventSchema.safeParse(e);
    expect(r.success).toBe(false);
  });

  it('rejects an event missing eventId (idempotent persistence key)', () => {
    const e = event({ type: 'execution.started' });
    delete (e as { eventId?: string }).eventId;
    const r = AgentExecutionEventSchema.safeParse(e);
    expect(r.success).toBe(false);
  });

  it('rejects an event missing policyHash (policy traceability)', () => {
    const e = event({ type: 'execution.started' });
    delete (e as { policyHash?: string }).policyHash;
    const r = AgentExecutionEventSchema.safeParse(e);
    expect(r.success).toBe(false);
  });

  it('rejects an event with an unknown discriminator', () => {
    const r = AgentExecutionEventSchema.safeParse(event({ type: 'tool.queued' }));
    expect(r.success).toBe(false);
  });

  it('rejects a tool.requested event whose capability is outside the allowlist', () => {
    const r = AgentExecutionEventSchema.safeParse(
      event({ type: 'tool.requested', toolCallId: 'tc-1', capability: 'process.shell' }),
    );
    expect(r.success).toBe(false);
  });
});

describe('capability and error taxonomy', () => {
  it('AGENT_CAPABILITIES matches the schema options (cannot drift)', () => {
    expect(AgentCapabilitySchema.options).toEqual([...AGENT_CAPABILITIES]);
  });

  it('does not include an arbitrary-shell capability', () => {
    expect(AgentCapabilitySchema.options).not.toContain('process.shell');
    expect(AgentCapabilitySchema.options).not.toContain('shell.exec');
  });

  it('NON_SUCCESS and RETRYABLE error sets are disjoint', () => {
    const overlap = NON_SUCCESS_ERROR_CODES.filter((c) => RETRYABLE_ERROR_CODES.includes(c));
    expect(overlap).toEqual([]);
  });

  it('every error code in the sets is a valid AgentErrorCode', () => {
    const valid = AgentErrorCodeSchema.options;
    for (const c of [...NON_SUCCESS_ERROR_CODES, ...RETRYABLE_ERROR_CODES]) {
      expect(valid).toContain(c);
    }
  });

  it('AgentExecutionErrorSchema rejects an unknown code', () => {
    const r = AgentExecutionErrorSchema.safeParse({
      code: 'WHOOPS',
      message: 'x',
      retryable: false,
    });
    expect(r.success).toBe(false);
  });
});

describe('status taxonomy', () => {
  it('does not include a "success" alias — only "completed"', () => {
    expect(AgentExecutionStatusSchema.options).toContain('completed');
    expect(AgentExecutionStatusSchema.options).not.toContain('success');
  });
});
