// packages/testing/src/fixtures/agent-execution.ts
//
// Sample valid AgentExecutionRequest (v2) for provider contract tests and
// orchestrator fixtures. Matches the contract in
// packages/contracts/src/agent/execution.ts.

import {
  AGENT_EXECUTION_SCHEMA_VERSION,
  type AgentExecutionRequest,
} from '@agentic-sdlc-kit/contracts';

/** A stable fake policy snapshot hash for fixtures/tests. */
export const SAMPLE_POLICY_HASH = 'sha256:fixture-policy-0001';

export const sampleAgentExecutionRequest: AgentExecutionRequest = {
  schemaVersion: AGENT_EXECUTION_SCHEMA_VERSION,
  executionId: 'exec-fixture-001',
  workflowRunId: 'run-fixture-001',
  taskId: 'TASK-001',
  providerId: 'mock',
  taskKind: 'implementation',
  policyHash: SAMPLE_POLICY_HASH,
  workspace: {
    id: 'ws-fixture-001',
    kind: 'git-worktree',
    rootPath: '/repo/worktrees/run-fixture-001',
    branch: 'kit/run-fixture-001',
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
    writablePaths: ['/repo/worktrees/run-fixture-001/src'],
    networkAllowed: false,
  },
  budget: {
    maxDurationMs: 600_000,
    maxToolCalls: 50,
  },
  approvalPolicy: {
    requireApprovalFor: ['external.approval'],
    allowAutonomousExecution: true,
  },
};
