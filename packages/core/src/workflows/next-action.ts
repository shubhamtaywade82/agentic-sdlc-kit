// packages/core/src/workflows/next-action.ts
//
// Host-driven agent protocol (ADR-0021 §2): compute the bounded
// machine-readable answer to "what is the next action?" for a feature
// run. This is the surface behind `kit next --json` — the single entry
// point a Tier C host (Cursor, AGY, CI, any terminal-capable agent)
// needs to drive the whole workflow:
//
//     loop: kit next --json  ->  act (write test / implement / refactor)
//           ->  kit feature <id> <phase> <task>  ->  repeat
//
// Derivation rules (fail closed, like every kit gate):
//   - No run state        -> feature.start (status pending).
//   - Run state exists    -> the plan is loaded to resolve the task's
//                            own verification command (ADR-0018 P1). A
//                            plan we cannot load is an ERROR, not a
//                            guess: the run state and plan have
//                            diverged and phase verification would fail
//                            closed anyway.
//   - First incomplete
//     task in execution
//     order               -> task.<phase> for the task's current phase.
//   - Last attempt rejected -> recoveryHint (feedback) while the policy
//                            allows it and attempts remain; otherwise a
//                            blockingQuestion explains why not (item 1).
//   - All tasks completed -> feature.verify; or run.completed when the
//                            journal records a passed final verification.
//                            A missing/unreadable journal falls back to
//                            feature.verify — honest and safe, because
//                            verification is idempotent.
//
// `advisoryLessons` is empty in this revision: the LessonRef contract
// is in place and recall wiring ({stack, phase, failureClassification}
// -> top-N, promotion-gated) is the follow-up (ADR-0021 §4). An empty
// list is the honest state, not a placeholder promise.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  Errors,
  type NextAction,
  type Result,
  NEXT_ACTION_SCHEMA_VERSION,
} from '@agentic-sdlc-kit/contracts';
import { loadPlan } from '../planning/parser.js';
import { assessRecovery } from '../recovery/policy.js';
import { resolveCommandTimeoutMs } from '../verification/process-runner.js';
import { readJournal } from './journal.js';
import {
  featureRunPath,
  loadFeatureRunState,
  validateFeatureId,
  type FeatureRunState,
} from './tdd-run-store.js';

/** Output bound advertised to hosts; matches ProcessVerificationRunner's default. */
const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

export interface NextActionOptions {
  readonly projectRoot: string;
  readonly featureId: string;
}

/** True when the journal records a passed final verification for the run. */
async function journalRecordsPassedFinalize(
  projectRoot: string,
  featureId: string,
): Promise<boolean> {
  const journalRes = await readJournal(projectRoot, featureId);
  if (!journalRes.ok) return false;
  for (const event of journalRes.value) {
    if (event.kind === 'workflow.finalized' && event.payload['status'] === 'passed') {
      return true;
    }
  }
  return false;
}

/**
 * Compute the next action for a feature run. `feature.start` is
 * returned (not an error) when no run state exists — it is a valid,
 * actionable protocol state, and the start command will surface any
 * spec/plan problems when it actually runs.
 */
export async function computeNextAction(opts: NextActionOptions): Promise<Result<NextAction>> {
  const idCheck = validateFeatureId(opts.featureId);
  if (!idCheck.ok) return idCheck;

  // Distinguish "no run yet" (actionable: feature.start) from "run state
  // exists but will not load" (corruption: fail closed with the real error,
  // never a misleading feature.start that `start` itself would reject).
  let stateExists: boolean;
  try {
    await fs.access(featureRunPath(opts.projectRoot, opts.featureId));
    stateExists = true;
  } catch {
    stateExists = false;
  }
  if (!stateExists) {
    return {
      ok: true,
      value: {
        schemaVersion: NEXT_ACTION_SCHEMA_VERSION,
        featureId: opts.featureId,
        status: 'pending',
        requiredAction: 'feature.start',
        verificationCommand: [],
        nextInvocation: `kit feature ${opts.featureId} start`,
        blockingQuestions: [],
        advisoryLessons: [],
        constraints: {
          timeoutMs: resolveCommandTimeoutMs(),
          maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
        },
      },
    };
  }

  const stateRes = await loadFeatureRunState(opts.projectRoot, opts.featureId);
  if (!stateRes.ok) return stateRes;
  const state = stateRes.value;

  // The plan is the authority for execution order and task-scoped
  // verification commands. A run state without a loadable plan is a
  // divergence — fail closed with the real error.
  const planRes = await loadPlan(path.join(opts.projectRoot, 'docs', 'plans', opts.featureId));
  if (!planRes.ok) return planRes;
  const { plan, analysis } = planRes.value;

  const nextTaskId = analysis.executionOrder.find((id) => {
    const task = state.tasks[id];
    return task === undefined || task.phase !== 'completed';
  });

  if (nextTaskId === undefined) {
    const completed = await journalRecordsPassedFinalize(opts.projectRoot, opts.featureId);
    if (completed) {
      return {
        ok: true,
        value: {
          schemaVersion: NEXT_ACTION_SCHEMA_VERSION,
          featureId: opts.featureId,
          status: 'completed',
          requiredAction: 'run.completed',
          verificationCommand: [],
          nextInvocation: `kit feature ${opts.featureId} status`,
          blockingQuestions: [],
          advisoryLessons: [],
          constraints: {
            timeoutMs: resolveCommandTimeoutMs(),
            maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
          },
        },
      };
    }
    return {
      ok: true,
      value: {
        schemaVersion: NEXT_ACTION_SCHEMA_VERSION,
        featureId: opts.featureId,
        status: 'in_progress',
        requiredAction: 'feature.verify',
        verificationCommand: [],
        nextInvocation: `kit feature ${opts.featureId} verify`,
        blockingQuestions: [],
        advisoryLessons: [],
        constraints: {
          timeoutMs: resolveCommandTimeoutMs(),
          maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
        },
      },
    };
  }

  const taskState = state.tasks[nextTaskId];
  // The find above only yields tasks that are not 'completed', so
  // 'completed' is impossible here by construction. Narrow explicitly
  // and fail closed anyway: a completed task at this point means the
  // run state is internally inconsistent, and misreporting its phase
  // would poison the protocol (ADR-0021 §2).
  if (taskState?.phase === 'completed' || taskState === undefined) {
    return {
      ok: false,
      error: Errors.contractInvalid(
        `Task '${nextTaskId}' was selected as incomplete but its state is ` +
          `'${taskState?.phase ?? 'missing'}' — the run state for ${opts.featureId} is ` +
          `inconsistent; refusing to guess`,
      ),
    };
  }
  const phase = taskState.phase;
  const taskDef = plan.tasks.find((t) => t.id === nextTaskId);
  if (!taskDef) {
    return {
      ok: false,
      error: Errors.planInvalid(
        `Task '${nextTaskId}' is in the plan's execution order but not in the plan for ` +
          `${opts.featureId} — the plan and run state have diverged; refusing to guess`,
      ),
    };
  }
  const recovery = assessRecovery(taskState);
  const command =
    taskDef.verification && taskDef.verification.command.length > 0
      ? [...taskDef.verification.command]
      : [];

  return {
    ok: true,
    value: {
      schemaVersion: NEXT_ACTION_SCHEMA_VERSION,
      featureId: opts.featureId,
      status: 'in_progress',
      taskId: nextTaskId,
      phase,
      requiredAction:
        phase === 'red' ? 'task.red' : phase === 'green' ? 'task.green' : 'task.refactor',
      verificationCommand: command,
      nextInvocation: `kit feature ${opts.featureId} ${phase} ${nextTaskId}`,
      blockingQuestions: recovery.stopReason === null ? [] : [recovery.stopReason],
      advisoryLessons: [],
      ...(recovery.hint !== null ? { recoveryHint: recovery.hint } : {}),
      constraints: {
        timeoutMs: resolveCommandTimeoutMs(),
        maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
      },
    },
  };
}

export interface ActiveFeatureRun {
  readonly featureId: string;
  readonly state: FeatureRunState;
}

/**
 * List every persisted feature run state under
 * .ai-kit/state/feature-runs/. Unreadable files are skipped honestly
 * (reported via console-free error results is not possible for a
 * directory scan; the run's own commands will surface the corruption
 * when it is addressed). Used by `kit next` with no feature id.
 */
export async function listFeatureRunStates(projectRoot: string): Promise<ActiveFeatureRun[]> {
  const dir = path.dirname(featureRunPath(projectRoot, 'PROBE'));
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const runs: ActiveFeatureRun[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const featureId = entry.slice(0, -'.json'.length);
    const stateRes = await loadFeatureRunState(projectRoot, featureId);
    if (stateRes.ok) runs.push({ featureId, state: stateRes.value });
  }
  return runs;
}
