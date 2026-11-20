// packages/core/src/workflows/feature-state.ts
//
// Persisted, evidence-carrying state for the incremental feature workflow.
//
// The kit is runtime-agnostic: the CLI never writes implementation code.
// The agent (human or AI) drives the Red -> Green -> Refactor loop, and the
// workflow gates each phase transition on RECORDED EVIDENCE:
//
//   awaiting-red             the task's failing test must be written
//     --red   runs task.verification.command; it MUST fail (Red evidence)
//   awaiting-implementation  the agent implements the minimum change
//     --green runs task.verification.command; it MUST pass (Green evidence)
//   awaiting-refactor        the agent may refactor
//     --refactor runs it again; it MUST stay green (behavior preserved)
//   completed
//
// A task that reaches `completed` without red/green/refactor evidence is
// impossible by construction: the state file only advances through gates,
// and completion is only reported when every task has all three evidence
// records plus a passing final verification.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export type FeatureTaskPhase =
  'awaiting-red' | 'awaiting-implementation' | 'awaiting-refactor' | 'completed';

/** Observed outcome of one phase-gate command run. */
export interface PhaseEvidence {
  readonly status: 'passed' | 'failed';
  readonly exitCode: number | null;
  readonly durationMs: number;
  /** Tail of the command output (bounded, for the run report). */
  readonly outputTail: string;
  readonly timestamp: string;
}

export interface TaskRunState {
  readonly taskId: string;
  phase: FeatureTaskPhase;
  red?: PhaseEvidence;
  green?: PhaseEvidence;
  refactor?: PhaseEvidence;
}

export interface FinalVerificationSummary {
  readonly status: 'passed' | 'failed';
  readonly runId: string;
  readonly checksTotal: number;
  readonly failedChecks: string[];
  readonly timestamp: string;
}

export interface FeatureRunState {
  readonly featureId: string;
  readonly specId: string;
  readonly startedAt: string;
  updatedAt: string;
  /** Tasks in execution order (from the validated plan DAG). */
  readonly taskOrder: readonly string[];
  tasks: Record<string, TaskRunState>;
  currentTaskId: string | null;
  finalVerification?: FinalVerificationSummary;
}

const STATE_DIR = path.join('.ai-kit', 'state', 'feature-runs');

export function featureStatePath(projectRoot: string, featureId: string): string {
  return path.join(projectRoot, STATE_DIR, `${featureId}.json`);
}

export async function loadFeatureState(
  projectRoot: string,
  featureId: string,
): Promise<FeatureRunState | null> {
  const p = featureStatePath(projectRoot, featureId);
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw) as FeatureRunState;
  } catch {
    return null;
  }
}

export async function saveFeatureState(projectRoot: string, state: FeatureRunState): Promise<void> {
  const p = featureStatePath(projectRoot, state.featureId);
  await fs.mkdir(path.dirname(p), { recursive: true });
  const withTimestamp = { ...state, updatedAt: new Date().toISOString() };
  await fs.writeFile(p, JSON.stringify(withTimestamp, null, 2) + '\n', 'utf8');
}

/**
 * Initialize a fresh run state for a plan whose tasks execute in
 * `taskOrder`. Every task starts `awaiting-red` — no evidence exists yet.
 */
export function createFeatureRunState(
  featureId: string,
  specId: string,
  taskOrder: readonly string[],
): FeatureRunState {
  const now = new Date().toISOString();
  const tasks: Record<string, TaskRunState> = {};
  for (const taskId of taskOrder) {
    tasks[taskId] = { taskId, phase: 'awaiting-red' };
  }
  return {
    featureId,
    specId,
    startedAt: now,
    updatedAt: now,
    taskOrder: [...taskOrder],
    tasks,
    currentTaskId: taskOrder[0] ?? null,
  };
}

/** Tasks that completed with full Red/Green/Refactor evidence. */
export function completedTaskIds(state: FeatureRunState): string[] {
  return state.taskOrder.filter((id) => state.tasks[id]?.phase === 'completed');
}

export function hasFullEvidence(state: FeatureRunState, taskId: string): boolean {
  const t = state.tasks[taskId];
  return !!t && !!t.red && !!t.green && !!t.refactor && t.phase === 'completed';
}

/**
 * Assert that `taskId` is the current task in the expected phase.
 * Returns an error message when the gate is being invoked out of order.
 */
export function requirePhase(
  state: FeatureRunState,
  taskId: string,
  expected: FeatureTaskPhase,
): string | null {
  const task = state.tasks[taskId];
  if (!task) {
    return `Unknown task '${taskId}'. Tasks in this plan: ${state.taskOrder.join(', ')}`;
  }
  if (state.currentTaskId !== taskId) {
    return (
      `Task '${taskId}' is not the current task (current: ${state.currentTaskId ?? 'none'}). ` +
      'Phases must be driven in execution order.'
    );
  }
  if (task.phase !== expected) {
    return (
      `Task '${taskId}' is in phase '${task.phase}' but this gate expects '${expected}'. ` +
      'Run `kit feature ' +
      state.featureId +
      ' --status` to see the current phase.'
    );
  }
  return null;
}

/** Record Red evidence and advance to awaiting-implementation. */
export function recordRedEvidence(
  state: FeatureRunState,
  taskId: string,
  evidence: PhaseEvidence,
): void {
  const task = state.tasks[taskId]!;
  task.red = evidence;
  task.phase = 'awaiting-implementation';
}

/** Record Green evidence and advance to awaiting-refactor. */
export function recordGreenEvidence(
  state: FeatureRunState,
  taskId: string,
  evidence: PhaseEvidence,
): void {
  const task = state.tasks[taskId]!;
  task.green = evidence;
  task.phase = 'awaiting-refactor';
}

/**
 * Record Refactor evidence, complete the task, and advance the run to the
 * next task (or null when the last task just completed).
 */
export function recordRefactorEvidenceAndComplete(
  state: FeatureRunState,
  taskId: string,
  evidence: PhaseEvidence,
): string | null {
  const task = state.tasks[taskId]!;
  task.refactor = evidence;
  task.phase = 'completed';
  const idx = state.taskOrder.indexOf(taskId);
  const next = idx >= 0 ? state.taskOrder[idx + 1] : undefined;
  state.currentTaskId = next ?? null;
  return next ?? null;
}
