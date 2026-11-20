// packages/core/src/workflows/feature-workflow.ts
//
// Phase-driven incremental feature workflow (ADR-0018).
//
// The agent — not the workflow — writes tests and implementations.
// The workflow is a phase driver: each `red` / `green` / `refactor`
// invocation runs real verification, records evidence into a persisted
// run state, and advances the TDD state machine only when the phase
// invariant holds:
//
//   red      verification MUST fail (the test targets missing behavior)
//   green    verification MUST pass (after real agent implementation)
//   refactor verification MUST pass again (behavior preserved)
//
// Completion is evidence-gated: the one-shot `runFeatureWorkflow`
// audits the persisted chain and fails with `TDD evidence missing`
// when any task lacks a complete Red -> Green -> Refactor chain.

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
import { FileSystemRepositoryScanner } from '../discovery/repository-scanner.js';
import { loadSpecification } from '../specification/parser.js';
import { loadPlan } from '../planning/parser.js';
import { TddSession, type TddStepRecord, type TddStepVerification } from '../tdd/cycle.js';
import { DEFAULT_REDACTION_POLICY, redactSecrets } from '../secret-guard/redactor.js';
import { ProcessVerificationRunner, type ProcessResult } from '../verification/process-runner.js';
import { parseProfileFromYaml } from '../project-profile/serializer.js';
import {
  FEATURE_RUN_SCHEMA_VERSION,
  loadFeatureRunState,
  saveFeatureRunState,
  validateFeatureId,
  type FeatureRunState,
  type TaskRunState,
} from './tdd-run-store.js';

export interface FeatureWorkflowOptions {
  readonly featureId: string;
  readonly projectRoot: string;
  readonly dryRun?: boolean;
}

export interface TddPhaseRequest {
  readonly featureId: string;
  readonly projectRoot: string;
  readonly taskId: string;
  readonly phase: 'red' | 'green' | 'refactor';
  /**
   * Bounded execution time for the task's verification command
   * (default 60s). Exceeding it classifies the attempt as `timeout`,
   * which never satisfies a phase invariant.
   */
  readonly timeoutMs?: number;
}

export interface FeatureRunReport {
  readonly featureId: string;
  readonly status: 'passed' | 'failed';
  readonly spec: FeatureSpecification;
  readonly plan: ImplementationPlan;
  readonly tasksExecuted: string[];
  /** Persisted Red -> Green -> Refactor evidence per executed task. */
  readonly tddEvidence: readonly TaskRunState[];
  readonly verification: VerificationReport;
  readonly durationMs: number;
}

interface FeatureContext {
  readonly profile: ProjectProfile;
  readonly spec: FeatureSpecification;
  readonly plan: ImplementationPlan;
  readonly executionOrder: readonly string[];
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

async function loadFeatureContext(opts: FeatureWorkflowOptions): Promise<Result<FeatureContext>> {
  const scanner = new FileSystemRepositoryScanner();
  const scanRes = await scanner.scan(opts.projectRoot);
  if (!scanRes.ok) return scanRes;

  const profileRes = await loadProfile(opts.projectRoot);
  if (!profileRes.ok) return profileRes;

  const specDir = path.join(opts.projectRoot, 'docs', 'specifications', 'features', opts.featureId);
  const specRes = await loadSpecification(specDir);
  if (!specRes.ok) return specRes;

  // The spec's id must match the requested feature — a mismatch means the
  // directory contents belong to a different feature. Silent substitution
  // hides the problem (the 0.7.3 verification finding).
  if (specRes.value.id !== opts.featureId) {
    return {
      ok: false,
      error: Errors.specInvalid(
        `Specification id '${specRes.value.id}' does not match requested feature '${opts.featureId}' ` +
          `(loaded from ${specDir}).`,
      ),
    };
  }

  const planDir = path.join(opts.projectRoot, 'docs', 'plans', opts.featureId);
  const planRes = await loadPlan(planDir);
  if (!planRes.ok) return planRes;

  const { plan, analysis } = planRes.value;
  if (plan.featureId !== opts.featureId) {
    return {
      ok: false,
      error: Errors.planInvalid(
        `Plan featureId '${plan.featureId}' does not match requested feature '${opts.featureId}' ` +
          `(loaded from ${planDir}).`,
      ),
    };
  }

  const dangling = analysis.executionOrder.filter((id) => !plan.tasks.some((t) => t.id === id));
  if (dangling.length > 0) {
    return {
      ok: false,
      error: Errors.planInvalid(`Execution order references unknown tasks: ${dangling.join(', ')}`),
    };
  }

  return {
    ok: true,
    value: {
      profile: profileRes.value,
      spec: specRes.value,
      plan,
      executionOrder: analysis.executionOrder,
    },
  };
}

/**
 * Human-auditable, bounded evidence line for a task-targeted phase
 * verification: exit code, failure classification, and a redacted
 * excerpt of the output tail. Same redaction and excerpt bound as
 * profile-level evidence.
 */
function evidenceFromProcessResult(result: ProcessResult): string {
  const flat = result.output.replace(/\s+/g, ' ').trim().slice(-300);
  const excerpt = flat
    ? redactSecrets(flat, DEFAULT_REDACTION_POLICY, 'tool-output').redactedText
    : 'no output';
  const classification = result.classification === null ? 'none' : result.classification;
  return `exit=${result.exitCode ?? 'none'} classification=${classification} — ${excerpt}`;
}

/**
 * A complete chain is Red(failed, classified `assertion`) then
 * Green(passed) then Refactor(passed), in order, each step verified by
 * the task's own verification command (ADR-0018 P1). Records written
 * by the pre-v2 engine (no `verification` metadata) do not count —
 * their evidence is unclassified and therefore cannot establish Red.
 */
function hasCompleteChain(records: readonly TddStepRecord[]): boolean {
  const isQualifyingRed = (r: TddStepRecord): boolean =>
    r.phase === 'red' &&
    r.status === 'failed' &&
    r.verification?.classification === 'assertion';
  const isQualifyingPass = (r: TddStepRecord): boolean =>
    r.status === 'passed' && r.verification !== undefined && r.verification.classification === null;

  let expectRed = true;
  let stage: 'green' | 'refactor' = 'green';
  for (const r of records) {
    if (expectRed) {
      if (isQualifyingRed(r)) expectRed = false;
      continue;
    }
    if (r.phase === stage && isQualifyingPass(r)) {
      if (stage === 'green') stage = 'refactor';
      else return true;
    }
  }
  return false;
}

function tddEvidenceMissing(featureId: string, taskIds: readonly string[]): Result<never> {
  return {
    ok: false,
    error: Errors.verificationFailed(
      `TDD evidence missing for ${featureId}: tasks [${taskIds.join(', ')}] ` +
        `lack a complete Red -> Green -> Refactor evidence chain. ` +
        `Drive the phases: kit feature ${featureId} start, then red/green/refactor per task.`,
    ),
  };
}

export async function startFeatureRun(
  opts: FeatureWorkflowOptions,
): Promise<Result<FeatureRunState>> {
  const idCheck = validateFeatureId(opts.featureId);
  if (!idCheck.ok) return idCheck;

  const ctxRes = await loadFeatureContext(opts);
  if (!ctxRes.ok) return ctxRes;

  const existing = await loadFeatureRunState(opts.projectRoot, opts.featureId);
  if (existing.ok) {
    return {
      ok: false,
      error: Errors.contractInvalid(
        `Feature run for ${opts.featureId} already exists — continue with ` +
          `\`kit feature ${opts.featureId} status\` (starting over would discard evidence)`,
      ),
    };
  }

  const now = new Date().toISOString();
  const state: FeatureRunState = {
    schemaVersion: FEATURE_RUN_SCHEMA_VERSION,
    featureId: opts.featureId,
    createdAt: now,
    updatedAt: now,
    tasks: {},
  };
  for (const taskId of ctxRes.value.executionOrder) {
    state.tasks[taskId] = { taskId, phase: 'red', records: [] };
  }
  await saveFeatureRunState(opts.projectRoot, state);
  return { ok: true, value: state };
}

export async function getFeatureRunState(
  projectRoot: string,
  featureId: string,
): Promise<Result<FeatureRunState>> {
  return loadFeatureRunState(projectRoot, featureId);
}

export async function runTddPhase(opts: TddPhaseRequest): Promise<Result<FeatureRunState>> {
  const stateRes = await loadFeatureRunState(opts.projectRoot, opts.featureId);
  if (!stateRes.ok) return stateRes;
  const state = stateRes.value;

  const task = state.tasks[opts.taskId];
  if (!task) {
    return {
      ok: false,
      error: Errors.contractInvalid(
        `Unknown task '${opts.taskId}' in feature run ${opts.featureId}`,
      ),
    };
  }
  if (task.phase !== opts.phase) {
    return {
      ok: false,
      error: Errors.contractInvalid(
        `Phase mismatch for ${opts.taskId}: run is in phase '${task.phase}' ` +
          `but '${opts.phase}' was requested`,
      ),
    };
  }

  // The phase gate verifies the TASK'S OWN verification command, not the
  // whole project profile (ADR-0018 P1: task-scoped Red evidence). The
  // plan is the authority for what that command is; a plan we cannot
  // load, or a task missing from it, fails closed.
  const planRes = await loadPlan(path.join(opts.projectRoot, 'docs', 'plans', opts.featureId));
  if (!planRes.ok) return planRes;

  const taskDef = planRes.value.plan.tasks.find((t) => t.id === opts.taskId);
  if (!taskDef) {
    return {
      ok: false,
      error: Errors.contractInvalid(
        `Task '${opts.taskId}' exists in the run state but not in the plan for ` +
          `${opts.featureId} — the plan and run state have diverged; refusing to verify`,
      ),
    };
  }
  if (!taskDef.verification || taskDef.verification.command.length === 0) {
    return {
      ok: false,
      error: Errors.contractInvalid(
        `Task '${opts.taskId}' has no verification command in the plan — ` +
          `phase evidence requires a targeted verification (fail closed)`,
      ),
    };
  }

  // Real verification only: a dry run cannot produce Red/Green evidence.
  const runner = new ProcessVerificationRunner();
  const runRes = await runner.runCommand(taskDef.verification.command, {
    cwd: opts.projectRoot,
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  });
  if (!runRes.ok) return runRes;
  const result = runRes.value;

  const status: 'passed' | 'failed' = result.exitCode === 0 ? 'passed' : 'failed';
  const verification: TddStepVerification = {
    taskId: opts.taskId,
    command: taskDef.verification.command,
    classification: result.classification,
    reason: result.reason,
  };
  const evidence = evidenceFromProcessResult(result);

  const session = new TddSession(opts.taskId, { phase: task.phase, records: task.records });

  // Red classification gate (ADR-0018 P1): a failed command establishes
  // Red ONLY when the failure is a real assertion failure of the
  // targeted test. Compilation, dependency, discovery, environment,
  // timeout, and unclassified failures are recorded as rejected attempts
  // (real, auditable evidence) but do NOT advance the phase. Prefer a
  // false-negative Red over a false-positive Red.
  if (opts.phase === 'red' && status === 'failed' && result.classification !== 'assertion') {
    session.recordRejected({ status, evidence, verification });
    task.phase = session.getCurrentPhase();
    task.records = [...session.getHistory()];
    state.updatedAt = new Date().toISOString();
    await saveFeatureRunState(opts.projectRoot, state);
    return {
      ok: false,
      error: Errors.verificationFailed(
        `Red phase evidence rejected for ${opts.taskId}: the targeted verification ` +
          `failed with classification '${result.classification}' (${result.reason}). ` +
          `Only an assertion failure establishes Red — fix the underlying problem ` +
          `(compile error, missing dependency, missing test, environment, or timeout) ` +
          `and run red again.`,
      ),
    };
  }

  const advanceRes = session.advance({ status, evidence, verification });

  // Persist the attempt either way: a failed phase attempt (e.g. Green
  // before the implementation actually works) is real, auditable evidence.
  task.phase = session.getCurrentPhase();
  task.records = [...session.getHistory()];
  state.updatedAt = new Date().toISOString();
  await saveFeatureRunState(opts.projectRoot, state);

  if (!advanceRes.ok) return { ok: false, error: advanceRes.error };
  return { ok: true, value: state };
}

export async function finalizeFeatureRun(
  opts: FeatureWorkflowOptions,
): Promise<Result<FeatureRunReport>> {
  const start = Date.now();
  const idCheck = validateFeatureId(opts.featureId);
  if (!idCheck.ok) return idCheck;

  const ctxRes = await loadFeatureContext(opts);
  if (!ctxRes.ok) return ctxRes;
  const { profile, spec, plan, executionOrder } = ctxRes.value;

  const stateRes = await loadFeatureRunState(opts.projectRoot, opts.featureId);
  if (!stateRes.ok) return tddEvidenceMissing(opts.featureId, executionOrder);

  const incomplete = executionOrder.filter((id) => {
    const task = stateRes.value.tasks[id];
    return !task || task.phase !== 'completed' || !hasCompleteChain(task.records);
  });
  if (incomplete.length > 0) return tddEvidenceMissing(opts.featureId, incomplete);

  const runner = new ProcessVerificationRunner();
  const verifyRes = await runner.run(profile, {
    cwd: opts.projectRoot,
    dryRun: opts.dryRun ?? false,
  });
  if (!verifyRes.ok) return verifyRes;

  const tddEvidence = executionOrder.map((id) => stateRes.value.tasks[id]) as TaskRunState[];

  return {
    ok: true,
    value: {
      featureId: opts.featureId,
      status: verifyRes.value.status === 'passed' ? 'passed' : 'failed',
      spec,
      plan,
      tasksExecuted: [...executionOrder],
      tddEvidence,
      verification: verifyRes.value,
      durationMs: Date.now() - start,
    },
  };
}

/**
 * One-shot entry point. This is now an AUDIT, not a simulation: it
 * refuses to report success without a persisted, complete TDD evidence
 * chain for every task in the plan's execution order.
 */
export async function runFeatureWorkflow(
  opts: FeatureWorkflowOptions,
): Promise<Result<FeatureRunReport>> {
  return finalizeFeatureRun(opts);
}
