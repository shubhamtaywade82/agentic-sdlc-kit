// packages/contracts/src/agent/execution.ts
//
// M36 agent execution request and result contracts (ADR-0019 v2, ADR-0020).
//
// Design rules:
//   - The request is provider-neutral and capability-scoped. It carries
//     NO provider-specific fields (no model name, no prompt-template id).
//     Provider selection is the gateway's job; the request describes the
//     work and its bounds.
//   - The request references an EXPLICIT ExecutionWorkspace (v2, revision
//     B): an execution never assumes the current process directory is its
//     environment. The workspace is created and owned by the gateway.
//   - The request carries a policyHash (v2, revision D): the hash of the
//     canonical, versioned ExecutionPolicy snapshot in force. Providers
//     echo it in every event so each decision is traceable to the exact
//     policy that authorized it; the gateway rejects mismatched echoes.
//   - Bounds live in an explicit ExecutionBudget (v2, revision C) with
//     per-limit enforcement levels declared by the provider's
//     capabilities. Token or monetary cost enforcement is NEVER claimed
//     where the provider does not expose reliable usage information.
//   - The result's `proposedArtifacts` is INFORMATIONAL — it is what the
//     agent claims it changed. Kit independently inspects git to establish
//     truth. A `completed` result is never sufficient to mark a workflow
//     task complete (ADR-0018: agent claims are not evidence).
//   - A timeout, cancellation, or provider crash MUST be reported with the
//     matching status, never `completed`.

import { z } from 'zod';
import { AgentCapabilitySchema } from './capability.js';
import { AgentExecutionErrorSchema } from './errors.js';
import { AgentResumeTokenSchema, AgentSessionIdSchema } from './session.js';
// Reuse the kit's canonical identifier contract (CONTRACTS.md §1.2) instead
// of redefining TaskId/RunId here. The agent surface references tasks and
// runs by their existing Identifier shape; re-exporting parallel types
// would collide at the contracts barrel.
import { IdentifierSchema } from '../common/identifier.js';

export const AGENT_EXECUTION_SCHEMA_VERSION = 2 as const;

// Provider ids are kebab-case (e.g. "claude-code", "codex"). This keeps
// them filename- and url-safe across config files and CLI flags.
export const AgentProviderIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, 'providerId must be kebab-case');
export type AgentProviderId = z.infer<typeof AgentProviderIdSchema>;

export const AgentTaskKindSchema = z.enum([
  'requirements',
  'architecture',
  'planning',
  'test_authoring',
  'implementation',
  'debugging',
  'code_review',
  'documentation',
]);
export type AgentTaskKind = z.infer<typeof AgentTaskKindSchema>;

export const AgentExecutionStatusSchema = z.enum([
  'completed',
  'failed',
  'cancelled',
  'timed_out',
  'interrupted',
  'needs_approval',
]);
export type AgentExecutionStatus = z.infer<typeof AgentExecutionStatusSchema>;

/**
 * Statuses that mean "the agent produced no usable work." A workflow task
 * MUST NOT advance to a completed phase when the execution ended in any of
 * these. This is the contract-level expression of ADR-0018's "agent claims
 * are not evidence": even a `completed` result is insufficient, but these
 * statuses are sufficient to STOP the task.
 */
export const AGENT_FAILURE_STATUSES: readonly AgentExecutionStatus[] = [
  'failed',
  'cancelled',
  'timed_out',
  'interrupted',
];

export const AgentApprovalPolicySchema = z.object({
  // Capabilities that require a human approval before the agent may
  // proceed autonomously. The tool broker enforces these.
  requireApprovalFor: z.array(AgentCapabilitySchema),
  // If false, any approval-required action blocks the execution with
  // status `needs_approval` instead of prompting. CI runs are autonomous
  // but never silent: a blocked run explains what it is waiting for.
  allowAutonomousExecution: z.boolean(),
});
export type AgentApprovalPolicy = z.infer<typeof AgentApprovalPolicySchema>;

/**
 * How a workspace is isolated (ADR-0020 §7). A git worktree isolates
 * repository changes; it is NOT an OS sandbox — provider processes must
 * additionally run with restricted host permissions or in a container.
 */
export const ExecutionWorkspaceKindSchema = z.enum(['git-worktree', 'container', 'directory']);
export type ExecutionWorkspaceKind = z.infer<typeof ExecutionWorkspaceKindSchema>;

/**
 * The explicit execution environment (ADR-0019 v2, revision B). A request
 * NEVER assumes the current process directory: the gateway creates the
 * workspace and the request references it. For `git-worktree` (and only
 * that kind) `branch` and `baseCommitSha` are required — the orchestrator
 * uses them to derive clean diffs for evidence.
 */
export const ExecutionWorkspaceSchema = z
  .object({
    id: z.string().min(1),
    kind: ExecutionWorkspaceKindSchema,
    rootPath: z.string().min(1),
    branch: z.string().min(1).optional(),
    baseCommitSha: z.string().min(1).optional(),
    createdAt: z.string().min(1),
  })
  .superRefine((ws, ctx) => {
    if (ws.kind === 'git-worktree' && (!ws.branch || !ws.baseCommitSha)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['branch'],
        message:
          'a git-worktree workspace requires both branch and baseCommitSha',
      });
    }
  });
export type ExecutionWorkspace = z.infer<typeof ExecutionWorkspaceSchema>;

/**
 * How honestly a budget limit is enforced (ADR-0020 §8, revision C).
 *
 * - `provider-enforced` — the provider reliably enforces or reports it.
 * - `gateway-enforced` — Kit enforces it itself (always true for duration
 *   and process bounds: the gateway owns the process).
 * - `best-effort` — reported as such; evidence must state the limit was
 *   not hard-enforced.
 *
 * Token or monetary cost enforcement is NEVER declared `provider-enforced`
 * where the provider does not expose reliable usage information.
 */
export const BudgetEnforcementLevelSchema = z.enum([
  'provider-enforced',
  'gateway-enforced',
  'best-effort',
]);
export type BudgetEnforcementLevel = z.infer<typeof BudgetEnforcementLevelSchema>;

/**
 * Execution budget (ADR-0019 v2, revision C). Duration and tool calls are
 * mandatory (the gateway can always enforce them); token and cost limits
 * are optional and only meaningful when the provider declares an
 * enforcement level for them. Exceeding an enforced limit is a
 * BUDGET_EXCEEDED error, never silent continuation.
 */
export const ExecutionBudgetSchema = z.object({
  maxDurationMs: z.number().int().positive(),
  maxToolCalls: z.number().int().positive(),
  maxInputTokens: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  maxTotalTokens: z.number().int().positive().optional(),
  maxEstimatedCost: z
    .object({
      amount: z.number().nonnegative(),
      currency: z.string().min(1),
    })
    .optional(),
});
export type ExecutionBudget = z.infer<typeof ExecutionBudgetSchema>;

export const AgentExecutionRequestSchema = z.object({
  schemaVersion: z.literal(AGENT_EXECUTION_SCHEMA_VERSION),
  executionId: z.string().min(1),
  workflowRunId: IdentifierSchema,
  taskId: IdentifierSchema,

  providerId: AgentProviderIdSchema,
  taskKind: AgentTaskKindSchema,

  // Hash of the canonical, versioned ExecutionPolicy snapshot in force
  // (ADR-0020). Providers echo it in every event; the gateway rejects
  // events whose policyHash does not match the execution's policy.
  policyHash: z.string().min(1),

  // The explicit execution environment (revision B). The workspace is
  // created by the gateway; a request never assumes the cwd.
  workspace: ExecutionWorkspaceSchema,

  instructions: z.string().min(1),
  context: z.object({
    specificationRef: z.string().optional(),
    planRef: z.string().optional(),
    relevantFiles: z.array(z.string()),
    constraints: z.array(z.string()),
  }),

  permissions: z.object({
    capabilities: z.array(AgentCapabilitySchema),
    // Paths the agent may write. Must be within the run's isolated
    // workspace (worktree). The tool broker rejects writes outside.
    writablePaths: z.array(z.string().min(1)),
    networkAllowed: z.boolean(),
  }),

  // Execution bounds (revision C), separated from permissions: grants say
  // WHAT the agent may do; the budget says HOW MUCH.
  budget: ExecutionBudgetSchema,

  session: z
    .object({
      sessionId: AgentSessionIdSchema,
      resumeToken: AgentResumeTokenSchema.optional(),
    })
    .optional(),

  approvalPolicy: AgentApprovalPolicySchema,
});
export type AgentExecutionRequest = z.infer<typeof AgentExecutionRequestSchema>;

export const AgentArtifactOperationSchema = z.enum(['create', 'update', 'delete']);
export type AgentArtifactOperation = z.infer<typeof AgentArtifactOperationSchema>;

export const AgentProposedArtifactSchema = z.object({
  path: z.string().min(1),
  operation: AgentArtifactOperationSchema,
});
export type AgentProposedArtifact = z.infer<typeof AgentProposedArtifactSchema>;

export const AgentApprovalRequestSchema = z.object({
  approvalId: z.string().min(1),
  action: z.string().min(1),
  reason: z.string().min(1),
});
export type AgentApprovalRequest = z.infer<typeof AgentApprovalRequestSchema>;

export const AgentUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().nonnegative(),
  estimatedCost: z.number().nonnegative().optional(),
  currency: z.string().optional(),
});
export type AgentUsage = z.infer<typeof AgentUsageSchema>;

export const AgentExecutionResultSchema = z.object({
  schemaVersion: z.literal(AGENT_EXECUTION_SCHEMA_VERSION),
  executionId: z.string().min(1),
  workflowRunId: IdentifierSchema,
  taskId: IdentifierSchema,

  providerId: AgentProviderIdSchema,
  status: AgentExecutionStatusSchema,

  session: z
    .object({
      sessionId: AgentSessionIdSchema,
      resumeToken: AgentResumeTokenSchema.optional(),
    })
    .optional(),

  // A non-empty summary is required for every result, including failures:
  // a result that explains nothing is suspicious (ADR-0018 honest reporting).
  summary: z.string().min(1),

  // INFORMATIONAL: what the agent claims it changed. Kit derives truth
  // from git, not from this list (ADR-0018, ADR-0019).
  proposedArtifacts: z.array(AgentProposedArtifactSchema),

  requestedApprovals: z.array(AgentApprovalRequestSchema),

  usage: AgentUsageSchema.optional(),

  errors: z.array(AgentExecutionErrorSchema),
});
export type AgentExecutionResult = z.infer<typeof AgentExecutionResultSchema>;
