// packages/testing/src/fixtures/agent-execution.ts
//
// Sample valid AgentExecutionRequest for provider contract tests and
// orchestrator fixtures. Matches the contract in
// packages/contracts/src/agent/execution.ts.

import type { AgentExecutionRequest } from '@agentic-sdlc-kit/contracts';

export const sampleAgentExecutionRequest: AgentExecutionRequest = {
  schemaVersion: 1,
  executionId: 'exec-fixture-001',
  workflowRunId: 'run-fixture-001',
  taskId: 'TASK-001',
  providerId: 'mock',
  taskKind: 'implementation',
  instructions: 'Implement user registration with email verification.',
  context: {
    projectRoot: '/repo/worktree/run-fixture-001',
    specificationRef: 'docs/specifications/features/FEATURE-001/spec.md',
    planRef: 'docs/plans/FEATURE-001/plan.md',
    relevantFiles: ['src/auth/registration.ts'],
    constraints: ['No new runtime dependencies'],
  },
  permissions: {
    capabilities: ['repository.read', 'repository.write', 'process.test'],
    writablePaths: ['/repo/worktree/run-fixture-001/src'],
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
