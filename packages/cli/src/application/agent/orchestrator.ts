// packages/cli/src/application/agent/orchestrator.ts
//
// Feature orchestrator — Mode 1 (kit-orchestrated) execution, PR3
// (ADR-0019 §1, §4, §5).
//
// The orchestrator is a COORDINATOR, not an engine: it drives the
// EXISTING deterministic workflow APIs from @agentic-sdlc-kit/core —
// startFeatureRun, runTddPhase, finalizeFeatureRun, getFeatureRunState —
// against an isolated git worktree, invoking a configured agent provider
// between phases and letting Kit's independent evidence gates decide
// every transition (ADR-0018: a provider `completed` result is never
// sufficient). No workflow logic is duplicated here; the same state
// machine serves Mode 1 and Mode 2.
//
// Per-run durable state (ADR-0019 §5 "persist execution and workflow
// identities") lives at .ai-kit/state/orchestrations/<featureId>.json in
// the MAIN project root and links the feature run, the workspace
// identity, and every agent execution id. The TDD evidence itself lives
// in the WORKTREE (.ai-kit/state/feature-runs/), exactly where Mode 2
// writes it.
//
// Resumability: the worktree and the feature run state inside it persist
// across invocations. Re-running `kit feature <id> run` after a
// cancellation or crash resumes from the first incomplete task/phase —
// derived from the run state, which is the authority, not from a cached
// pointer. Each pending phase gets ONE fresh execution attempt per
// invocation (bounded by the human, not by a retry loop).
//
// Cancellation: pass an AbortSignal (the CLI wires SIGINT). In-flight
// executions are cancelled through the gateway; the orchestration state
// records `cancelled` and the next invocation resumes.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  AGENT_EXECUTION_SCHEMA_VERSION,
  AGENT_POLICY_SNAPSHOT_SCHEMA_VERSION,
  Errors,
  computePolicyHash,
  type AgentCapability,
  type AgentExecutionRequest,
  type AgentPolicySnapshot,
  type ExecutionWorkspace,
  type Result,
  type VerificationReport,
} from '@agentic-sdlc-kit/contracts';
import {
  finalizeFeatureRun,
  getFeatureRunState,
  loadPlan,
  loadSpecification,
  runTddPhase,
  startFeatureRun,
  validateFeatureId,
  type FeatureRunState,
} from '@agentic-sdlc-kit/core';
import type { StoredAgentExecution } from './execution-store.js';
import type { AgentGateway } from './gateway.js';
import { createWorktreeWorkspace, workspaceExists } from './workspace.js';

export type OrchestrationStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'interrupted'
  | 'needs_approval'
  | 'phase_gate_rejected'
  | 'verification_failed';

export type TddPhase = 'red' | 'green' | 'refactor';

/** One agent execution, linked to the workflow task and phase it served. */
export interface OrchestrationExecutionLink {
  readonly executionId: string;
  readonly taskId: string;
  readonly phase: TddPhase;
  readonly attempt: number;
  readonly startedAt: string;
  endedAt?: string;
  /** Final stored-execution status ('running' while in flight). */
  outcome: string;
}

/** Persisted at .ai-kit/state/orchestrations/<featureId>.json (main root). */
export interface OrchestrationState {
  readonly schemaVersion: 1;
  readonly featureId: string;
  readonly runId: string;
  readonly providerId: string;
  workspace: ExecutionWorkspace;
  status: OrchestrationStatus;
  readonly startedAt: string;
  updatedAt: string;
  completedAt?: string;
  executions: OrchestrationExecutionLink[];
  /** Honest record of orchestration-level events (workspace recreated, …). */
  notes: string[];
}

export interface OrchestrationTaskSummary {
  readonly taskId: string;
  readonly phase: string;
  readonly completed: boolean;
  readonly records: number;
}

export interface OrchestrationReport {
  readonly featureId: string;
  readonly runId: string;
  readonly providerId: string;
  readonly workspace: ExecutionWorkspace;
  readonly status: OrchestrationStatus;
  readonly message: string;
  readonly tasks: readonly OrchestrationTaskSummary[];
  readonly executions: readonly OrchestrationExecutionLink[];
  /** Final whole-profile verification, when the run reached finalize. */
  readonly verification?: VerificationReport;
  readonly worktreePath: string;
  readonly startedAt: string;
  readonly completedAt?: string;
}

export interface FeatureOrchestrationOptions {
  readonly projectRoot: string;
  readonly featureId: string;
  readonly gateway: AgentGateway;
  readonly providerId: string;
  /** Capability grant for agent executions (default: read/write repo + run tests). */
  readonly capabilities?: readonly AgentCapability[];
  /** Whether executions may touch the network (default: false). */
  readonly networkAllowed?: boolean;
  /** Per-execution duration budget in ms (default: 10 minutes). */
  readonly maxDurationMs?: number;
  /** Per-execution tool-call budget (default: 200). */
  readonly maxToolCalls?: number;
  /** Cancellation (the CLI wires SIGINT to this). */
  readonly signal?: AbortSignal;
  /** Progress lines for human output (not used in --json mode). */
  readonly onProgress?: (line: string) => void;
}

const DEFAULT_CAPABILITIES: readonly AgentCapability[] = [
  'repository.read',
  'repository.write',
  'process.test',
];
const DEFAULT_MAX_DURATION_MS = 600_000;
const DEFAULT_MAX_TOOL_CALLS = 200;

function orchestrationPath(projectRoot: string, featureId: string): string {
  return path.resolve(projectRoot, '.ai-kit', 'state', 'orchestrations', `${featureId}.json`);
}

/**
 * Derive the workflow run id from the feature id: FEATURE-014 -> RUN-014.
 * Fallback for non-uppercase feature ids keeps the Identifier kebab shape.
 */
export function deriveRunId(featureId: string): string {
  const m = /^([A-Z]+)-(\d{3,})$/.exec(featureId);
  if (m) return `RUN-${m[2]}`;
  return `run-${featureId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`.slice(0, 64);
}

async function loadOrchestrationState(
  projectRoot: string,
  featureId: string,
): Promise<OrchestrationState | undefined> {
  try {
    const raw = JSON.parse(
      await fs.readFile(orchestrationPath(projectRoot, featureId), 'utf8'),
    ) as OrchestrationState;
    if (raw.featureId !== featureId || typeof raw.workspace !== 'object') return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

async function saveOrchestrationState(
  projectRoot: string,
  state: OrchestrationState,
): Promise<void> {
  const target = orchestrationPath(projectRoot, state.featureId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, target);
}

/** Load spec + plan from the WORKTREE — the same files the gates verify against. */
interface WorktreeContext {
  readonly specTitle: string;
  readonly specPath: string;
  readonly planPath: string;
  readonly executionOrder: readonly string[];
  readonly taskDefs: ReadonlyMap<string, { description: string; acceptanceCriteria: readonly string[]; likelyFiles: readonly string[]; verificationCommand: readonly string[] }>;
}

async function loadWorktreeContext(
  worktreeRoot: string,
  featureId: string,
): Promise<Result<WorktreeContext>> {
  const specDir = path.join(worktreeRoot, 'docs', 'specifications', 'features', featureId);
  const specRes = await loadSpecification(specDir);
  if (!specRes.ok) return specRes;
  const spec = specRes.value;

  const planRes = await loadPlan(path.join(worktreeRoot, 'docs', 'plans', featureId));
  if (!planRes.ok) return planRes;
  const { plan, analysis } = planRes.value;

  const taskDefs = new Map(
    plan.tasks.map((t) => [
      t.id,
      {
        description: t.description,
        acceptanceCriteria: t.acceptanceCriteria,
        likelyFiles: t.likelyFiles,
        verificationCommand: t.verification.command,
      },
    ]),
  );
  return {
    ok: true,
    value: {
      specTitle: spec.title,
      specPath: path.relative(worktreeRoot, specDir),
      planPath: path.relative(worktreeRoot, path.join(worktreeRoot, 'docs', 'plans', featureId)),
      executionOrder: analysis.executionOrder,
      taskDefs,
    },
  };
}

function buildInstructions(
  featureId: string,
  specTitle: string,
  taskId: string,
  phase: TddPhase,
  task: NonNullable<ReturnType<WorktreeContext['taskDefs']['get']>>,
  ctx: WorktreeContext,
  workspace: ExecutionWorkspace,
): string {
  const command = task.verificationCommand.join(' ');
  const header =
    phase === 'red'
      ? `Phase: red (TDD) for task ${taskId} of feature ${featureId} ("${specTitle}").\nWrite the FAILING test that targets this task's new behavior. The test must fail for the RIGHT reason — an assertion about the missing behavior — not a compile error, missing dependency, missing test file, or timeout.`
      : phase === 'green'
        ? `Phase: green (TDD) for task ${taskId} of feature ${featureId} ("${specTitle}").\nImplement the MINIMUM production code that makes this task's test pass.`
        : `Phase: refactor (TDD) for task ${taskId} of feature ${featureId} ("${specTitle}").\nRefactor the implementation for clarity and structure while preserving behavior. If no refactor is warranted, make no changes.`;
  const expectation =
    phase === 'red'
      ? `The verification command MUST FAIL with an assertion failure.`
      : `The verification command MUST PASS.`;
  return [
    header,
    `Task: ${task.description}`,
    `Acceptance criteria:\n${task.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}`,
    task.likelyFiles.length > 0 ? `Likely files: ${task.likelyFiles.join(', ')}` : '',
    `Verification (${expectation}): ${command}`,
    `Workspace: ${workspace.rootPath} (git worktree, branch ${workspace.branch ?? 'n/a'}, base ${workspace.baseCommitSha ?? 'n/a'}). Write all files inside the workspace; never touch files outside it.`,
    `Specification: ${ctx.specPath}`,
    `Plan: ${ctx.planPath}`,
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

function taskKindForPhase(phase: TddPhase): AgentExecutionRequest['taskKind'] {
  return phase === 'red' ? 'test_authoring' : 'implementation';
}

export async function runFeatureOrchestration(
  opts: FeatureOrchestrationOptions,
): Promise<Result<OrchestrationReport>> {
  const idCheck = validateFeatureId(opts.featureId);
  if (!idCheck.ok) return idCheck;

  const progress = (line: string): void => opts.onProgress?.(line);

  // Provider must be configured before anything durable happens.
  if (!opts.gateway.hasProvider(opts.providerId)) {
    return {
      ok: false,
      error: Errors.agentProviderNotConfigured(
        `No agent provider '${opts.providerId}' is configured ` +
          `(registered: ${opts.gateway.listProviders().join(', ') || 'none'}). ` +
          `kit feature ${opts.featureId} run requires a provider; it will not fall back to ` +
          `pretending a manual workflow completed.`,
      ),
    };
  }

  // Load or initialize the orchestration state (resume-aware).
  const runId = deriveRunId(opts.featureId);
  const existing = await loadOrchestrationState(opts.projectRoot, opts.featureId);
  if (existing && existing.status === 'completed') {
    return {
      ok: false,
      error: Errors.contractInvalid(
        `Orchestration for ${opts.featureId} is already completed (run ${existing.runId}). ` +
          `The evidence lives in the worktree at ${existing.workspace.rootPath} — inspect it ` +
          `there or run the Mode 2 audit inside the worktree; re-running would discard nothing ` +
          `but is unnecessary.`,
      ),
    };
  }
  let state: OrchestrationState;
  if (!existing) {
    const wsRes = await createWorktreeWorkspace(opts.projectRoot, runId);
    if (!wsRes.ok) return wsRes;
    const now = new Date().toISOString();
    state = {
      schemaVersion: 1,
      featureId: opts.featureId,
      runId,
      providerId: opts.providerId,
      workspace: wsRes.value,
      status: 'running',
      startedAt: now,
      updatedAt: now,
      executions: [],
      notes: [],
    };
    await saveOrchestrationState(opts.projectRoot, state);
    progress(
      `Mode 1 run ${runId} for ${opts.featureId} — workspace ${wsRes.value.rootPath} (branch ${wsRes.value.branch})`,
    );
  } else {
    // Resume: the worktree must still exist; if it was removed, recreate
    // it from the current HEAD and note the replacement honestly (the
    // in-worktree run state is lost with it — phases restart).
    if (!(await workspaceExists(existing.workspace))) {
      const wsRes = await createWorktreeWorkspace(opts.projectRoot, runId);
      if (!wsRes.ok) return wsRes;
      const now = new Date().toISOString();
      state = {
        ...existing,
        workspace: wsRes.value,
        status: 'running',
        notes: [
          ...existing.notes,
          `workspace was missing on resume; recreated at ${wsRes.value.rootPath} (base ${wsRes.value.baseCommitSha}) — in-worktree run state restarted`,
        ],
        updatedAt: now,
      };
      await saveOrchestrationState(opts.projectRoot, state);
      progress(`Workspace missing — recreated ${wsRes.value.rootPath} (run state restarts)`);
    } else {
      state = existing;
      progress(`Resuming run ${existing.runId} for ${opts.featureId}`);
    }
  }
  const worktreeRoot = state.workspace.rootPath;

  // Ensure the feature run exists inside the worktree (same store Mode 2
  // uses). startFeatureRun validates the spec/plan/profile there.
  let runStateRes = await getFeatureRunState(worktreeRoot, opts.featureId);
  if (!runStateRes.ok) {
    const startRes = await startFeatureRun({
      featureId: opts.featureId,
      projectRoot: worktreeRoot,
    });
    if (!startRes.ok) return startRes;
    runStateRes = { ok: true, value: startRes.value };
  }

  const ctxRes = await loadWorktreeContext(worktreeRoot, opts.featureId);
  if (!ctxRes.ok) return ctxRes;
  const ctx = ctxRes.value;

  // The policy snapshot: one grant per run, frozen into each request.
  const capabilities = opts.capabilities ?? DEFAULT_CAPABILITIES;
  const buildPolicySnapshot = (): AgentPolicySnapshot => ({
    schemaVersion: AGENT_POLICY_SNAPSHOT_SCHEMA_VERSION,
    permissions: {
      capabilities: [...capabilities],
      writablePaths: [worktreeRoot],
      networkAllowed: opts.networkAllowed ?? false,
    },
    budget: {
      maxDurationMs: opts.maxDurationMs ?? DEFAULT_MAX_DURATION_MS,
      maxToolCalls: opts.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS,
    },
    approvalPolicy: {
      requireApprovalFor: ['external.approval'],
      allowAutonomousExecution: true,
    },
  });

  const persistState = async (
    status: OrchestrationStatus,
    completed = false,
  ): Promise<OrchestrationState> => {
    const now = new Date().toISOString();
    const next: OrchestrationState = completed
      ? { ...state, status, updatedAt: now, completedAt: now }
      : { ...state, status, updatedAt: now };
    state = next;
    await saveOrchestrationState(opts.projectRoot, next);
    return next;
  };

  // ---- the phase loop: derive pending from the run state (the authority)
  let gateErrorMessage: string | undefined;
  let aborted = false;

  loop: while (true) {
    if (opts.signal?.aborted) {
      aborted = true;
      break;
    }
    const current = await getFeatureRunState(worktreeRoot, opts.featureId);
    if (!current.ok) return current;
    const pendingId = ctx.executionOrder.find(
      (id) => (current.value.tasks[id]?.phase ?? 'red') !== 'completed',
    );
    if (!pendingId) break; // all tasks complete → finalize

    const task = current.value.tasks[pendingId];
    if (!task) {
      return {
        ok: false,
        error: Errors.planInvalid(
          `Task ${pendingId} is in the plan's execution order but not in the run state — ` +
            `the plan and run state have diverged; refusing to continue`,
        ),
      };
    }
    const phase = task.phase as TddPhase;
    const taskDef = ctx.taskDefs.get(pendingId);
    if (!taskDef) {
      return {
        ok: false,
        error: Errors.planInvalid(
          `Task ${pendingId} has no definition in the plan for ${opts.featureId}`,
        ),
      };
    }

    const attempt = state.executions.filter((e) => e.taskId === pendingId && e.phase === phase).length + 1;
    const executionId = `exec-${state.runId}-${pendingId}-${phase}-${attempt}`;
    const snapshot = buildPolicySnapshot();
    const request: AgentExecutionRequest = {
      schemaVersion: AGENT_EXECUTION_SCHEMA_VERSION,
      executionId,
      workflowRunId: state.runId,
      taskId: pendingId,
      providerId: opts.providerId,
      taskKind: taskKindForPhase(phase),
      policyHash: computePolicyHash(snapshot),
      workspace: state.workspace,
      instructions: buildInstructions(
        opts.featureId,
        ctx.specTitle,
        pendingId,
        phase,
        taskDef,
        ctx,
        state.workspace,
      ),
      context: {
        specificationRef: ctx.specPath,
        planRef: ctx.planPath,
        relevantFiles: [...taskDef.likelyFiles],
        constraints: [...taskDef.acceptanceCriteria],
      },
      permissions: snapshot.permissions,
      budget: snapshot.budget,
      approvalPolicy: snapshot.approvalPolicy,
    };

    progress(`${pendingId} ${phase}: agent execution ${executionId} (attempt ${attempt})`);
    state.executions = [
      ...state.executions,
      {
        executionId,
        taskId: pendingId,
        phase,
        attempt,
        startedAt: new Date().toISOString(),
        outcome: 'running',
      },
    ];
    await persistState('running');

    const execRes = await opts.gateway.start(request, {
      policySnapshot: snapshot,
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    const link = state.executions.find((e) => e.executionId === executionId);
    if (link) {
      link.endedAt = new Date().toISOString();
      link.outcome = execRes.ok ? execRes.value.status : 'not-started';
    }

    if (!execRes.ok) {
      await persistState('failed');
      return {
        ok: false,
        error: execRes.error,
      };
    }
    const execution: StoredAgentExecution = execRes.value;
    await persistState('running');

    if (execution.status !== 'completed') {
      // Agent claims are not evidence — and a non-completed execution is
      // a terminal outcome for this invocation. Record and report honestly.
      await persistState(execution.status as OrchestrationStatus);
      return buildReport(state, worktreeRoot, await getFeatureRunState(worktreeRoot, opts.featureId), undefined, summaryMessage(execution));
    }

    // The agent claims completion. Kit decides — the SAME gate Mode 2 uses.
    progress(`${pendingId} ${phase}: agent completed — verifying evidence`);
    const gateRes = await runTddPhase({
      featureId: opts.featureId,
      projectRoot: worktreeRoot,
      taskId: pendingId,
      phase,
    });
    if (!gateRes.ok) {
      gateErrorMessage = gateRes.error.message;
      await persistState('phase_gate_rejected');
      progress(`${pendingId} ${phase}: REJECTED by the evidence gate — ${gateErrorMessage}`);
      break loop;
    }
    progress(`${pendingId} ${phase}: evidence accepted — phase advanced`);
  }

  if (aborted) {
    await persistState('cancelled');
    return buildReport(
      state,
      worktreeRoot,
      await getFeatureRunState(worktreeRoot, opts.featureId),
      undefined,
      'Cancelled before the run completed — re-run to resume from the first incomplete phase.',
    );
  }

  if (gateErrorMessage) {
    return buildReport(
      state,
      worktreeRoot,
      await getFeatureRunState(worktreeRoot, opts.featureId),
      undefined,
      `Agent claimed completion but Kit's evidence gate rejected it: ${gateErrorMessage}`,
    );
  }

  // All tasks complete → final whole-profile verification (same as Mode 2).
  progress('All tasks complete — running final verification');
  const finalizeRes = await finalizeFeatureRun({
    featureId: opts.featureId,
    projectRoot: worktreeRoot,
  });
  if (!finalizeRes.ok) {
    await persistState('failed');
    return {
      ok: false,
      error: finalizeRes.error,
    };
  }
  const verification = finalizeRes.value.verification;
  const finalStatus: OrchestrationStatus =
    finalizeRes.value.status === 'passed' ? 'completed' : 'verification_failed';
  await persistState(finalStatus, finalStatus === 'completed');
  progress(
    finalStatus === 'completed'
      ? `Feature ${opts.featureId} completed — evidence and diff in ${worktreeRoot}`
      : `Feature ${opts.featureId} verification FAILED — see the report`,
  );
  return buildReport(
    state,
    worktreeRoot,
    await getFeatureRunState(worktreeRoot, opts.featureId),
    verification,
    finalStatus === 'completed'
      ? `Feature ${opts.featureId} completed via Mode 1 (provider: ${state.providerId}).`
      : `Feature ${opts.featureId} failed final verification.`,
  );
}

function summaryMessage(execution: StoredAgentExecution): string {
  const detail = execution.result?.errors.map((e) => `${e.code}: ${e.message}`).join('; ');
  return `Agent execution ${execution.executionId} ended as '${execution.status}'${detail ? ` (${detail})` : ''} — the task phase was not advanced.`;
}

async function buildReport(
  state: OrchestrationState,
  worktreeRoot: string,
  runState: Result<FeatureRunState>,
  verification: VerificationReport | undefined,
  message: string,
): Promise<Result<OrchestrationReport>> {
  if (!runState.ok) return runState;
  const tasks: OrchestrationTaskSummary[] = Object.values(runState.value.tasks).map((t) => ({
    taskId: t.taskId,
    phase: t.phase,
    completed: t.phase === 'completed',
    records: t.records.length,
  }));
  return {
    ok: true,
    value: {
      featureId: state.featureId,
      runId: state.runId,
      providerId: state.providerId,
      workspace: state.workspace,
      status: state.status,
      message,
      tasks,
      executions: state.executions.map((e) => ({ ...e })),
      ...(verification ? { verification } : {}),
      worktreePath: worktreeRoot,
      startedAt: state.startedAt,
      ...(state.completedAt ? { completedAt: state.completedAt } : {}),
    },
  };
}
