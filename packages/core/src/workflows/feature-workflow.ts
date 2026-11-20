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
import { TddSession, type TddStepRecord } from '../tdd/cycle.js';
import { DEFAULT_REDACTION_POLICY, redactSecrets } from '../secret-guard/redactor.js';
import { ProcessVerificationRunner } from '../verification/process-runner.js';
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
 * Human-auditable, bounded evidence line for a verification run:
 * per-check statuses plus a redacted excerpt of the first failing
 * check's output (the Red failure must be inspectable, not asserted).
 */
function evidenceFromReport(report: VerificationReport): string {
  const parts = report.checks.map((c) => `${c.id}:${c.status}`);
  const failed = report.checks.find((c) => c.status === 'failed');
  let excerpt = '';
  if (failed) {
    const raw = failed.errors?.[0] ?? failed.evidence?.[0] ?? '';
    const flat = raw.replace(/\s+/g, ' ').trim().slice(-300);
    if (flat) {
      excerpt = redactSecrets(flat, DEFAULT_REDACTION_POLICY, 'tool-output').redactedText;
    }
  }
  return `checks [${parts.join(', ')}]${excerpt ? ` — ${excerpt}` : ''}`;
}

/** A complete chain is Red(failed) then Green(passed) then Refactor(passed), in order. */
function hasCompleteChain(records: readonly TddStepRecord[]): boolean {
  const expected: Array<{ phase: string; status: 'failed' | 'passed' }> = [
    { phase: 'red', status: 'failed' },
    { phase: 'green', status: 'passed' },
    { phase: 'refactor', status: 'passed' },
  ];
  let cursor = 0;
  for (const r of records) {
    const want = expected[cursor];
    if (want && r.phase === want.phase && r.status === want.status) cursor++;
  }
  return cursor === expected.length;
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

  const profileRes = await loadProfile(opts.projectRoot);
  if (!profileRes.ok) return profileRes;

  // Real verification only: a dry run cannot produce Red/Green evidence.
  const runner = new ProcessVerificationRunner();
  const verifyRes = await runner.run(profileRes.value, {
    cwd: opts.projectRoot,
    dryRun: false,
  });
  if (!verifyRes.ok) return verifyRes;

  // Vacuous-evidence guard: a report with zero executed checks (empty
  // command set, or everything skipped/blocked) must NOT satisfy the Red
  // invariant — "nothing ran" is not "the test failed" (ADR-0018).
  const executedChecks = verifyRes.value.checks.filter(
    (c) => c.status === 'passed' || c.status === 'failed',
  );
  if (executedChecks.length === 0) {
    return {
      ok: false,
      error: Errors.verificationFailed(
        `Phase evidence requires at least one executed check, but verification ran none ` +
          `(${verifyRes.value.checks.length} check(s), all skipped or blocked) — ` +
          `no check actually executed for ${opts.phase} of ${opts.taskId}`,
      ),
    };
  }

  const status = verifyRes.value.status === 'passed' ? 'passed' : 'failed';
  const session = new TddSession(opts.taskId, { phase: task.phase, records: task.records });
  const advanceRes = session.advance({ status, evidence: evidenceFromReport(verifyRes.value) });

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
