// packages/contracts/src/agent/agent.test.ts
//
// Contract tests for the M36 agent execution surface. These verify the
// Zod schemas parse valid payloads, reject invalid ones, and survive a
// JSON round trip (no functions, no undefined-dependent shapes). See
// TESTING.md §4.4 and CONTRACTS.md §10.

import { describe, expect, it } from 'vitest';
import {
  AGENT_CAPABILITIES,
  AGENT_EVENT_SCHEMA_VERSION,
  AGENT_EXECUTION_SCHEMA_VERSION,
  AgentCapabilitySchema,
  AgentErrorCodeSchema,
  AgentExecutionErrorSchema,
  AgentExecutionEventSchema,
  AgentExecutionRequestSchema,
  AgentExecutionResultSchema,
  AgentExecutionStatusSchema,
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
  instructions: 'Implement user registration with email verification.',
  context: {
    projectRoot: '/repo/worktree/run-001',
    specificationRef: 'docs/specifications/features/FEATURE-001/spec.md',
    planRef: 'docs/plans/FEATURE-001/plan.md',
    relevantFiles: ['src/auth/registration.ts'],
    constraints: ['No new runtime dependencies'],
  },
  permissions: {
    capabilities: ['repository.read', 'repository.write', 'process.test'],
    writablePaths: ['/repo/worktree/run-001/src'],
    networkAllowed: false,
    maxToolCalls: 50,
    maxDurationMs: 600_000,
    maxTokens: 200_000,
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
    executionId: 'exec-001',
    seq: 1,
    at: '2026-11-20T12:00:00.000Z',
    ...over,
  };
}

describe('AgentExecutionRequestSchema', () => {
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

  it('rejects a non-positive maxToolCalls', () => {
    const r = AgentExecutionRequestSchema.safeParse({
      ...validRequest,
      permissions: { ...validRequest.permissions, maxToolCalls: 0 },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a capability outside the allowlist (arbitrary shell is not a capability)', () => {
    const r = AgentExecutionRequestSchema.safeParse({
      ...validRequest,
      permissions: { ...validRequest.permissions, capabilities: ['process.shell'] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a wrong schemaVersion', () => {
    const r = AgentExecutionRequestSchema.safeParse({ ...validRequest, schemaVersion: 2 });
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
      summary: 'Agent exceeded maxDurationMs after partial implementation.',
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

describe('AgentExecutionEventSchema', () => {
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
    for (const c of cases) {
      const r = AgentExecutionEventSchema.safeParse(event({ type: c.type, ...c.extra }));
      expect(r.success, `event type ${c.type}`).toBe(true);
    }
  });

  it('rejects an event missing the monotonic seq field', () => {
    const e = event({ type: 'execution.started' });
    delete (e as { seq?: number }).seq;
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
