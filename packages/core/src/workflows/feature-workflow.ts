// packages/core/src/workflows/feature-workflow.ts
//
// End-to-end M7 incremental feature workflow runner — phase-gated edition.
//
// The kit is runtime-agnostic: it never writes implementation code itself.
// Instead of simulating a TDD loop (running the same verification twice and
// hoping something happened in between), the workflow is a state machine
// driven by explicit gates, one CLI invocation at a time:
//
//   kit feature FEATURE-001                     start (or show status)
//   kit feature FEATURE-001 --red TASK-101      gate: the failing test must
//                                               make task.verification.command
//                                               FAIL (Red evidence)
//   kit feature FEATURE-001 --green TASK-101    gate: after implementing,
//                                               the same command must PASS
//   kit feature FEATURE-001 --refactor TASK-101 gate: behavior preserved
//   kit feature FEATURE-001 --verify            final regression run
//
// Invariants enforced here (and persisted as evidence in
// .ai-kit/state/feature-runs/<featureId>.json):
//   - Red gate: verification must FAIL. A passing Red run means the failing
//     test does not exist or does not exercise the new behavior -> the gate
//     refuses to advance.
//   - Green/Refactor gates: verification must PASS, or the gate refuses.
//   - The workflow may only report `completed` when EVERY task has
//     red+green+refactor evidence and the final profile verification passed.
//   - Missing evidence blocks completion. There is no other path.

import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  Errors,
  type FeatureSpecification,
  type ImplementationPlan,
  type ProjectProfile,
  type Result,
  type VerificationReport,
} from '@agentic-sdlc-kit/contracts';
import { loadSpecification } from '../specification/parser.js';
import { loadPlan } from '../planning/parser.js';
import {
  ProcessVerificationRunner,
  runSingleCommandCheck,
} from '../verification/process-runner.js';
import { parseProfileFromYaml } from '../project-profile/serializer.js';
import {
  createFeatureRunState,
  completedTaskIds,
  loadFeatureState,
  recordGreenEvidence,
  recordRedEvidence,
  recordRefactorEvidenceAndComplete,
  requirePhase,
  saveFeatureState,
  type FeatureRunState,
  type PhaseEvidence,
} from './feature-state.js';

export type FeatureAction = 'start' | 'status' | 'red' | 'green' | 'refactor' | 'verify';

export interface FeatureWorkflowOptions {
  readonly featureId: string;
  readonly projectRoot: string;
  /** Gate to drive; defaults to `status` when a run exists, else `start`. */
  readonly action?: FeatureAction;
  /** Required for the red/green/refactor gates. */
  readonly taskId?: string;
  readonly dryRun?: boolean;
}

export type FeatureRunStatus =
  | 'planned'
  | 'in-progress'
  | 'awaiting-red'
  | 'awaiting-implementation'
  | 'awaiting-refactor'
  | 'completed'
  | 'failed';

export interface TaskEvidenceSummary {
  readonly taskId: string;
  readonly phase: string;
  readonly red?: PhaseEvidence;
  readonly green?: PhaseEvidence;
  readonly refactor?: PhaseEvidence;
}

export interface FeatureRunReport {
  readonly featureId: string;
  readonly status: FeatureRunStatus;
  readonly spec: FeatureSpecification;
  readonly plan: ImplementationPlan;
  /** All task ids in execution order. */
  readonly tasksPlanned: string[];
  /** Tasks completed with full Red/Green/Refactor evidence. */
  readonly tasksExecuted: string[];
  readonly currentTaskId: string | null;
  readonly tdd: readonly TaskEvidenceSummary[];
  readonly verification?: VerificationReport;
  /** Human-readable instruction for what to do next. */
  readonly nextAction: string;
  readonly durationMs: number;
}

async function loadProfile(root: string): Promise<Result<ProjectProfile>> {
  const p = path.join(root, '.ai-kit', 'project.yml');
  try {
    const yaml = await fs.readFile(p, 'utf8');
    return parseProfileFromYaml(yaml);
  } catch {
    return { ok: false, error: Errors.profileInvalid(`Missing project profile at ${p}`) };
  }
}

function evidenceFromCheck(check: {
  status: 'passed' | 'failed' | 'skipped' | 'blocked';
  durationMs?: number;
  evidence?: string[];
}): PhaseEvidence {
  return {
    status: check.status === 'passed' ? 'passed' : 'failed',
    exitCode: null,
    durationMs: check.durationMs ?? 0,
    outputTail: (check.evidence?.[0] ?? '').slice(-2000),
    timestamp: new Date().toISOString(),
  };
}

function summarizeState(state: FeatureRunState): TaskEvidenceSummary[] {
  return state.taskOrder.map((id) => {
    const t = state.tasks[id]!;
    return { taskId: id, phase: t.phase, red: t.red, green: t.green, refactor: t.refactor };
  });
}

function statusForState(state: FeatureRunState): FeatureRunStatus {
  if (state.finalVerification) {
    return state.finalVerification.status === 'passed' ? 'completed' : 'failed';
  }
  const current = state.currentTaskId ? state.tasks[state.currentTaskId] : undefined;
  if (!current) return 'in-progress';
  if (current.phase === 'completed') return 'in-progress';
  return current.phase;
}

function nextActionForState(state: FeatureRunState): string {
  const fid = state.featureId;
  if (state.finalVerification) {
    return state.finalVerification.status === 'passed'
      ? `Feature ${fid} is complete. All tasks have TDD evidence and final verification passed.`
      : `Final verification failed (${state.finalVerification.failedChecks.join(', ')}). Fix the failures, then re-run: kit feature ${fid} --verify`;
  }
  const taskId = state.currentTaskId;
  if (!taskId)
    return `All tasks completed for ${fid}. Run the final regression: kit feature ${fid} --verify`;
  const phase = state.tasks[taskId]?.phase ?? 'awaiting-red';
  switch (phase) {
    case 'awaiting-red':
      return `Write the failing test for ${taskId}, then run: kit feature ${fid} --red ${taskId}`;
    case 'awaiting-implementation':
      return `Implement the minimum change for ${taskId}, then run: kit feature ${fid} --green ${taskId}`;
    case 'awaiting-refactor':
      return `Refactor ${taskId} under test (behavior must stay green), then run: kit feature ${fid} --refactor ${taskId}`;
    default:
      return `Advance to the next task: kit feature ${fid} --status`;
  }
}

export async function runFeatureWorkflow(
  opts: FeatureWorkflowOptions,
): Promise<Result<FeatureRunReport>> {
  const start = Date.now();
  const fid = opts.featureId;

  // ---- Load and cross-check spec + plan + profile -------------------------
  const profileRes = await loadProfile(opts.projectRoot);
  if (!profileRes.ok) return profileRes;

  const specDir = path.join(opts.projectRoot, 'docs', 'specifications', 'features', fid);
  const specRes = await loadSpecification(specDir);
  if (!specRes.ok) return specRes;

  // The spec's id must match the requested feature — a mismatch means the
  // directory contents belong to a different feature.
  if (specRes.value.id !== fid) {
    return {
      ok: false,
      error: Errors.specInvalid(
        `Specification id '${specRes.value.id}' does not match requested feature '${fid}' ` +
          `(loaded from ${specDir}).`,
      ),
    };
  }

  const planDir = path.join(opts.projectRoot, 'docs', 'plans', fid);
  const planRes = await loadPlan(planDir);
  if (!planRes.ok) return planRes;
  if (planRes.value.plan.featureId !== fid) {
    return {
      ok: false,
      error: Errors.planInvalid(
        `Plan featureId '${planRes.value.plan.featureId}' does not match requested feature '${fid}' ` +
          `(loaded from ${planDir}).`,
      ),
    };
  }

  const plan = planRes.value.plan;
  const taskOrder = planRes.value.analysis.executionOrder;
  const tasksById = new Map(plan.tasks.map((t) => [t.id, t]));

  // ---- Resolve the action -------------------------------------------------
  const existing = await loadFeatureState(opts.projectRoot, fid);
  const action: FeatureAction = opts.action ?? (existing ? 'status' : 'start');

  // ---- Dry run: plan only, never execute, never mutate --------------------
  if (opts.dryRun) {
    const report: FeatureRunReport = {
      featureId: fid,
      status: 'planned',
      spec: specRes.value,
      plan,
      tasksPlanned: [...taskOrder],
      tasksExecuted: [],
      currentTaskId: existing?.currentTaskId ?? taskOrder[0] ?? null,
      tdd: summarizeState(existing ?? createFeatureRunState(fid, specRes.value.id, taskOrder)),
      nextAction:
        `Dry run — nothing was executed. Drive the loop with: ` +
        `kit feature ${fid} --red ${taskOrder[0] ?? '<task>'} (after writing its failing test).`,
      durationMs: Date.now() - start,
    };
    return { ok: true, value: report };
  }

  // ---- start: create state (idempotent) ------------------------------------
  if (action === 'start') {
    const state = existing ?? createFeatureRunState(fid, specRes.value.id, taskOrder);
    if (!existing) await saveFeatureState(opts.projectRoot, state);
    return {
      ok: true,
      value: {
        featureId: fid,
        status: statusForState(state),
        spec: specRes.value,
        plan,
        tasksPlanned: [...taskOrder],
        tasksExecuted: completedTaskIds(state),
        currentTaskId: state.currentTaskId,
        tdd: summarizeState(state),
        nextAction: nextActionForState(state),
        durationMs: Date.now() - start,
      },
    };
  }

  // ---- All other actions require an existing run ---------------------------
  if (!existing) {
    return {
      ok: false,
      error: Errors.verificationFailed(
        `No feature run in progress for '${fid}'. Start it first: kit feature ${fid}`,
      ),
    };
  }
  const state = existing;

  // ---- status: pure read ----------------------------------------------------
  if (action === 'status') {
    return {
      ok: true,
      value: {
        featureId: fid,
        status: statusForState(state),
        spec: specRes.value,
        plan,
        tasksPlanned: [...state.taskOrder],
        tasksExecuted: completedTaskIds(state),
        currentTaskId: state.currentTaskId,
        tdd: summarizeState(state),
        nextAction: nextActionForState(state),
        durationMs: Date.now() - start,
      },
    };
  }

  // ---- red / green / refactor gates ----------------------------------------
  if (action === 'red' || action === 'green' || action === 'refactor') {
    const taskId = opts.taskId;
    if (!taskId) {
      return {
        ok: false,
        error: Errors.verificationFailed(
          `--${action} requires a task id (e.g. --${action} TASK-101)`,
        ),
      };
    }
    const expectedPhase =
      action === 'red'
        ? 'awaiting-red'
        : action === 'green'
          ? 'awaiting-implementation'
          : 'awaiting-refactor';
    const phaseError = requirePhase(state, taskId, expectedPhase);
    if (phaseError) {
      return { ok: false, error: Errors.verificationFailed(phaseError) };
    }

    const task = tasksById.get(taskId);
    if (!task) {
      return { ok: false, error: Errors.planInvalid(`Task '${taskId}' not found in plan`) };
    }

    const check = await runSingleCommandCheck(`${taskId}:${action}`, task.verification.command, {
      cwd: opts.projectRoot,
    });
    const evidence = evidenceFromCheck(check);
    const cmdStr = task.verification.command.join(' ');

    if (action === 'red') {
      if (evidence.status !== 'failed') {
        // THE core anti-fake invariant: a passing Red run means no failing
        // test exists. Refuse to advance.
        return {
          ok: false,
          error: Errors.verificationFailed(
            `TDD Red phase invariant violated for ${taskId}: '${cmdStr}' PASSED before ` +
              'implementation. The failing test is missing or does not exercise the new behavior. ' +
              'Write the failing test first, then re-run --red.',
          ),
        };
      }
      recordRedEvidence(state, taskId, evidence);
      await saveFeatureState(opts.projectRoot, state);
      return {
        ok: true,
        value: {
          featureId: fid,
          status: statusForState(state),
          spec: specRes.value,
          plan,
          tasksPlanned: [...state.taskOrder],
          tasksExecuted: completedTaskIds(state),
          currentTaskId: state.currentTaskId,
          tdd: summarizeState(state),
          nextAction: nextActionForState(state),
          durationMs: Date.now() - start,
        },
      };
    }

    if (action === 'green') {
      if (evidence.status !== 'passed') {
        return {
          ok: false,
          error: Errors.verificationFailed(
            `TDD Green phase failed for ${taskId}: '${cmdStr}' still fails.\n` +
              `${evidence.outputTail}\nContinue implementing, then re-run --green ${taskId}.`,
          ),
        };
      }
      recordGreenEvidence(state, taskId, evidence);
      await saveFeatureState(opts.projectRoot, state);
      return {
        ok: true,
        value: {
          featureId: fid,
          status: statusForState(state),
          spec: specRes.value,
          plan,
          tasksPlanned: [...state.taskOrder],
          tasksExecuted: completedTaskIds(state),
          currentTaskId: state.currentTaskId,
          tdd: summarizeState(state),
          nextAction: nextActionForState(state),
          durationMs: Date.now() - start,
        },
      };
    }

    // refactor
    if (evidence.status !== 'passed') {
      return {
        ok: false,
        error: Errors.verificationFailed(
          `TDD Refactor phase failed for ${taskId}: '${cmdStr}' regressed during refactoring.\n` +
            `${evidence.outputTail}\nFix the regression (behavior must stay green), then re-run --refactor ${taskId}.`,
        ),
      };
    }
    const nextTaskId = recordRefactorEvidenceAndComplete(state, taskId, evidence);
    await saveFeatureState(opts.projectRoot, state);

    let verification: VerificationReport | undefined;
    let nextAction: string;
    if (!nextTaskId && !state.finalVerification) {
      // Last task completed: run the final regression immediately.
      const runner = new ProcessVerificationRunner();
      const verifyRes = await runner.run(profileRes.value, {
        cwd: opts.projectRoot,
        dryRun: false,
      });
      if (!verifyRes.ok) return verifyRes;
      verification = verifyRes.value;
      state.finalVerification = {
        status: verifyRes.value.status === 'passed' ? 'passed' : 'failed',
        runId: verifyRes.value.runId,
        checksTotal: verifyRes.value.checks.length,
        failedChecks: verifyRes.value.checks
          .filter((c) => c.status === 'failed')
          .map((c) => `${c.id}:${c.status}`),
        timestamp: new Date().toISOString(),
      };
      await saveFeatureState(opts.projectRoot, state);
      nextAction = nextActionForState(state);
    } else {
      nextAction = nextActionForState(state);
    }

    return {
      ok: true,
      value: {
        featureId: fid,
        status: statusForState(state),
        spec: specRes.value,
        plan,
        tasksPlanned: [...state.taskOrder],
        tasksExecuted: completedTaskIds(state),
        currentTaskId: state.currentTaskId,
        tdd: summarizeState(state),
        ...(verification ? { verification } : {}),
        nextAction,
        durationMs: Date.now() - start,
      },
    };
  }

  // ---- verify: (re-)run the final regression --------------------------------
  if (action === 'verify') {
    const incomplete = state.taskOrder.filter((id) => state.tasks[id]?.phase !== 'completed');
    if (incomplete.length > 0) {
      return {
        ok: false,
        error: Errors.verificationFailed(
          `Cannot verify: ${incomplete.length} task(s) lack full TDD evidence ` +
            `(${incomplete.join(', ')}). Complete their red/green/refactor gates first.`,
        ),
      };
    }
    const runner = new ProcessVerificationRunner();
    const verifyRes = await runner.run(profileRes.value, {
      cwd: opts.projectRoot,
      dryRun: false,
    });
    if (!verifyRes.ok) return verifyRes;
    state.finalVerification = {
      status: verifyRes.value.status === 'passed' ? 'passed' : 'failed',
      runId: verifyRes.value.runId,
      checksTotal: verifyRes.value.checks.length,
      failedChecks: verifyRes.value.checks
        .filter((c) => c.status === 'failed')
        .map((c) => `${c.id}:${c.status}`),
      timestamp: new Date().toISOString(),
    };
    await saveFeatureState(opts.projectRoot, state);
    return {
      ok: true,
      value: {
        featureId: fid,
        status: statusForState(state),
        spec: specRes.value,
        plan,
        tasksPlanned: [...state.taskOrder],
        tasksExecuted: completedTaskIds(state),
        currentTaskId: state.currentTaskId,
        tdd: summarizeState(state),
        verification: verifyRes.value,
        nextAction: nextActionForState(state),
        durationMs: Date.now() - start,
      },
    };
  }

  return { ok: false, error: Errors.internal(`Unknown action '${String(action)}'`) };
}
