// tooling/bench/lib/engine.ts
//
// The self-hosted regression benchmark engine (ADR-0023): measures the
// harness itself — prompts, workflows, docs, and engine changes — by
// driving the REAL host protocol (the same core functions behind
// `kit next` / `kit feature <phase>`) end-to-end per task, headlessly,
// deterministically (scripted driver), with no human in the loop.
//
// Scoring is deliberately boring: a task passes only if
//   1. every task in the run state completed a full Red -> Green ->
//      Refactor evidence chain,
//   2. `finalizeFeatureRun` (whole-profile verification) passed, and
//   3. the hash-chained journal verifies.
// Anything else the harness itself did wrong is an `error`, NEVER a
// task `failed` — bench infra bugs must not masquerade as regressions.
//
// Architecture: this lives in tooling/bench (not packages/core) on
// purpose — the engine under measurement must not depend on the
// measuring harness (ADR-0023; check-architecture does not scan
// tooling/, and the engine imports core straight from source so a bench
// run always measures the current tree, not a stale build).

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  computeNextAction,
  finalizeFeatureRun,
  loadFeatureRunState,
  runTddPhase,
  startFeatureRun,
  verifyJournal,
} from '../../../packages/core/src/index.js';
import type { BenchSuite as Suite, BenchTaskDef as TaskDef } from './suite.js';

export const BENCH_REPORT_SCHEMA_VERSION = 1 as const;

/** Per-task outcome. `error` is infra — never mixed into success rates. */
export type TaskStatus = 'passed' | 'failed' | 'error';

export interface TaskResult {
  readonly id: string;
  readonly workflow: string;
  readonly stack: string;
  readonly holdout: boolean;
  readonly status: TaskStatus;
  /** Human-readable derivation (bounded). */
  readonly summary: string;
  readonly turns: number;
  readonly phaseRetries: number;
  readonly verifyDurationMs: number;
  readonly wallClockMs: number;
  readonly evidenceChainComplete: boolean;
  readonly journalVerified: boolean;
  /** Token usage: null for the scripted driver (never a fake zero). */
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
}

export interface AggregateMetrics {
  readonly taskCount: number;
  readonly passed: number;
  readonly failed: number;
  readonly errored: number;
  /** passed / (passed + failed) — errors excluded, honestly. */
  readonly successRate: number;
  readonly evidenceChainCompletionRate: number;
  readonly meanWallClockMs: number;
  readonly medianWallClockMs: number;
  readonly meanVerifyDurationMs: number;
  readonly totalPhaseRetries: number;
  readonly byWorkflow: Readonly<Record<string, { total: number; passed: number }>>;
  readonly byStack: Readonly<Record<string, { total: number; passed: number }>>;
}

export interface BenchRunReport {
  readonly schemaVersion: typeof BENCH_REPORT_SCHEMA_VERSION;
  readonly runId: string;
  readonly suite: string;
  readonly suiteVersion: number;
  readonly driver: string;
  readonly modelConfig: Suite['modelConfig'];
  readonly startedAt: string;
  readonly durationMs: number;
  readonly tasks: readonly TaskResult[];
  readonly aggregate: AggregateMetrics;
}

export interface RunOptions {
  /** Repo root (templates + suites live under tooling/bench). */
  readonly root: string;
  /** Filter to specific task ids (used by tests and --task). */
  readonly onlyTaskIds?: ReadonlySet<string>;
  /** Override the protocol turn cap (tests use small values). */
  readonly maxTurns?: number;
  /** Keep workspaces for debugging (default: cleaned). */
  readonly keepWorkspaces?: boolean;
  /** Progress callback per completed task. */
  readonly onTask?: (result: TaskResult) => void;
}

class InfraError extends Error {}

/** The run id convention per workflow kind (all match /^[A-Z]+-[0-9]{3,}$/). */
function runIdFor(workflow: TaskDef['workflow']): string {
  switch (workflow) {
    case 'feature':
      return 'FEATURE-001';
    case 'fix':
      return 'BUG-001';
    case 'refactor':
      return 'REFACTOR-001';
  }
}

/** Verification command per stack (declared in the plan; the template
 * workspace ships the matching script). */
function verificationCommandFor(stack: TaskDef['stack']): string[] {
  switch (stack) {
    case 'node-typescript':
      return ['node', 'verify.js'];
    case 'python':
      return ['python3', 'verify.py'];
  }
}

function templateDir(root: string, stack: TaskDef['stack']): string {
  return path.join(root, 'tooling', 'bench', 'templates', stack);
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(from, to);
    else await fs.copyFile(from, to);
  }
}

function specMarkdown(task: TaskDef, runId: string): string {
  return `# ${runId}: ${task.title}

## Overview
${task.ticket}

## Problem
${task.ticket}

## Scope
### In Scope
- ${task.title}
- Deterministic verification of the change

### Out of Scope
- Anything not named by the acceptance criteria

## Actors
- Engineer: drives the kit through the phase protocol
- Kit: verifies, records evidence, and gates completion

## Functional Requirements
${task.acceptanceCriteria.map((c, i) => `- REQ-${String(i + 1).padStart(3, '0')}: ${c}`).join('\n')}

## Non-Functional Requirements
- NFR-001: The targeted verification must complete deterministically

## Acceptance Criteria
${task.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}

## Edge Cases
- The agent attempts a wrong solution before the correct one

## Dependencies
- None

## Risks
- RISK-001 (low): Bench fixture drift

## Open Questions
- Q-001: Pinned by the suite lockfile? (resolved: true)
`;
}

function planJson(task: TaskDef, runId: string): string {
  const plan = {
    featureId: runId,
    tasks: [
      {
        id: 'TASK-001',
        description: task.title,
        acceptanceCriteria: [...task.acceptanceCriteria],
        verification: { command: verificationCommandFor(task.stack), expectedStatus: 'passed' },
        dependencies: [],
        likelyFiles: ['.bench/solution.txt'],
        estimatedScope: 's',
        risk: 'low',
      },
    ],
    edges: [],
    verticalSlices: [['TASK-001']],
  };
  return JSON.stringify(plan, null, 2);
}

/**
 * Materialize an isolated workspace for one bench task: template copy +
 * generated spec/plan (the ticket the agent works from) + the pinned
 * expected solution the verification judges against.
 */
export async function materializeWorkspace(
  root: string,
  task: TaskDef,
  dest: string,
): Promise<void> {
  await copyDir(templateDir(root, task.stack), dest);
  const runId = runIdFor(task.workflow);
  const specDir = path.join(dest, 'docs', 'specifications', 'features', runId);
  const planDir = path.join(dest, 'docs', 'plans', runId);
  await fs.mkdir(specDir, { recursive: true });
  await fs.mkdir(planDir, { recursive: true });
  await fs.writeFile(path.join(specDir, 'SPEC.md'), specMarkdown(task, runId), 'utf8');
  await fs.writeFile(path.join(planDir, 'plan.json'), planJson(task, runId), 'utf8');
  const benchDir = path.join(dest, '.bench');
  await fs.mkdir(benchDir, { recursive: true });
  await fs.writeFile(path.join(benchDir, 'expected.txt'), `${task.expected}\n`, 'utf8');
}

/**
 * The scripted agent's solution attempt sequence for the green phase:
 * every failed attempt first, then the real solution — unless the task
 * pins a lying agent (neverSolves), in which case there is no correct
 * attempt and the task must fail.
 */
function greenAttempts(task: TaskDef): string[] {
  const attempts = [...(task.failedAttempts ?? [])];
  if (task.neverSolves !== true) attempts.push(task.expected);
  if (attempts.length === 0) attempts.push(task.expected); // defensive: never empty
  return attempts;
}

async function writeSolution(workspace: string, content: string): Promise<void> {
  const file = path.join(workspace, '.bench', 'solution.txt');
  await fs.writeFile(file, `${content}\n`, 'utf8');
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const lo = sorted[mid - 1] ?? sorted[mid]!;
  const hi = sorted[mid]!;
  return sorted.length % 2 === 0 ? Math.round((lo + hi) / 2) : hi;
}

function aggregate(results: readonly TaskResult[]): AggregateMetrics {
  const evaluated = results.filter((r) => r.status !== 'error');
  const passed = results.filter((r) => r.status === 'passed');
  const failed = results.filter((r) => r.status === 'failed');
  const errored = results.filter((r) => r.status === 'error');
  const chain = results.filter((r) => r.evidenceChainComplete);
  const wall = evaluated.map((r) => r.wallClockMs);
  const byWorkflow: Record<string, { total: number; passed: number }> = {};
  const byStack: Record<string, { total: number; passed: number }> = {};
  for (const r of results) {
    if (r.status === 'error') continue; // errors never count in rates
    byWorkflow[r.workflow] ??= { total: 0, passed: 0 };
    byWorkflow[r.workflow]!.total++;
    if (r.status === 'passed') byWorkflow[r.workflow]!.passed++;
    byStack[r.stack] ??= { total: 0, passed: 0 };
    byStack[r.stack]!.total++;
    if (r.status === 'passed') byStack[r.stack]!.passed++;
  }
  const mean = (xs: readonly number[]): number =>
    xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  return {
    taskCount: results.length,
    passed: passed.length,
    failed: failed.length,
    errored: errored.length,
    successRate: evaluated.length === 0 ? 0 : passed.length / evaluated.length,
    evidenceChainCompletionRate: results.length === 0 ? 0 : chain.length / results.length,
    meanWallClockMs: mean(wall),
    medianWallClockMs: median(wall),
    meanVerifyDurationMs: mean(evaluated.map((r) => r.verifyDurationMs)),
    totalPhaseRetries: results.reduce((a, r) => a + r.phaseRetries, 0),
    byWorkflow,
    byStack,
  };
}

/**
 * Drive ONE bench task through the real protocol. Every harness fault
 * (fixture generation, protocol crash, workspace IO) raises or returns
 * `error` — never `failed`, which is reserved for the agent/protocol
 * outcome (max turns exhausted, verify failure, lying agent).
 */
export async function runBenchTask(
  task: TaskDef,
  suite: Suite,
  opts: RunOptions,
): Promise<TaskResult> {
  const runId = runIdFor(task.workflow);
  const started = Date.now();
  let workspace: string | undefined;
  let turns = 0;
  let phaseRetries = 0;
  let greenAttemptIndex = 0;
  let verifyDurationMs = 0;
  let summary = '';
  let status: TaskStatus = 'failed';

  try {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), `bench-${task.id}-`));
    await materializeWorkspace(opts.root, task, workspace);
    const attempts = greenAttempts(task);
    const maxTurns = opts.maxTurns ?? suite.modelConfig.maxTurns;
    const maxPhaseAttempts = suite.defaults.maxPhaseAttempts;

    for (let turn = 0; turn < maxTurns; turn++) {
      const nextRes = await computeNextAction({ projectRoot: workspace, featureId: runId });
      if (!nextRes.ok) {
        throw new InfraError(`kit next failed: ${nextRes.error.message}`);
      }
      const next = nextRes.value;
      turns++;

      if (next.requiredAction === 'feature.start') {
        const startRes = await startFeatureRun({
          featureId: runId,
          projectRoot: workspace,
          actor: { kind: 'agent', host: 'bench' },
        });
        if (!startRes.ok) {
          throw new InfraError(`feature start failed: ${startRes.error.message}`);
        }
        continue;
      }

      if (next.requiredAction === 'task.red') {
        // The scripted agent writes the failing test — in this fixture
        // family the failing condition is pre-wired (solution absent), so
        // the agent's red work is finishing the test file; the phase gate
        // still observes the real assertion failure.
        const res = await runTddPhase({
          featureId: runId,
          projectRoot: workspace,
          taskId: next.taskId!,
          phase: 'red',
          actor: { kind: 'agent', host: 'bench' },
        });
        if (!res.ok) {
          throw new InfraError(
            `red phase rejected (fixture miswired or protocol regression): ${res.error.message}`,
          );
        }
        continue;
      }

      if (next.requiredAction === 'task.green') {
        const attempt = attempts[Math.min(greenAttemptIndex, attempts.length - 1)]!;
        await writeSolution(workspace, attempt);
        const res = await runTddPhase({
          featureId: runId,
          projectRoot: workspace,
          taskId: next.taskId!,
          phase: 'green',
          actor: { kind: 'agent', host: 'bench' },
        });
        greenAttemptIndex++;
        if (!res.ok) {
          phaseRetries++;
          if (greenAttemptIndex >= Math.max(attempts.length, maxPhaseAttempts)) {
            status = 'failed';
            summary = `green exhausted ${greenAttemptIndex} attempt(s) without a passing solution`;
            break;
          }
          continue; // computeNextAction will offer task.green again
        }
        continue;
      }

      if (next.requiredAction === 'task.refactor') {
        const res = await runTddPhase({
          featureId: runId,
          projectRoot: workspace,
          taskId: next.taskId!,
          phase: 'refactor',
          actor: { kind: 'agent', host: 'bench' },
        });
        if (!res.ok) {
          phaseRetries++;
          if (phaseRetries >= maxPhaseAttempts) {
            status = 'failed';
            summary = `refactor failed after ${phaseRetries} attempt(s)`;
            break;
          }
          continue;
        }
        continue;
      }

      if (next.requiredAction === 'feature.verify') {
        const finRes = await finalizeFeatureRun({
          featureId: runId,
          projectRoot: workspace,
          dryRun: false,
          actor: { kind: 'agent', host: 'bench' },
        });
        if (!finRes.ok) {
          status = 'failed';
          summary = `final verification refused: ${finRes.error.message.slice(0, 160)}`;
          break;
        }
        verifyDurationMs = finRes.value.verification.checks.reduce(
          (a, c) => a + (c.durationMs ?? 0),
          0,
        );
        status = finRes.value.status === 'passed' ? 'passed' : 'failed';
        summary =
          status === 'passed'
            ? `verified in ${verifyDurationMs}ms after ${turns} protocol steps`
            : `final verification status: ${finRes.value.status}`;
        break;
      }

      if (next.requiredAction === 'run.completed') {
        status = 'passed';
        summary = `run completed after ${turns} protocol steps`;
        break;
      }

      throw new InfraError(`unhandled protocol action '${next.requiredAction}'`);
    }

    if (turns >= maxTurns && status !== 'passed' && summary === '') {
      status = 'failed';
      summary = `exceeded maxTurns (${maxTurns}) without completing`;
    }

    // Evidence chain + journal audit (scoring, not just the report):
    // a pass without a complete persisted chain or a verifying journal
    // is a failed task, never a passed one.
    let evidenceChainComplete = false;
    const stateRes = await loadFeatureRunState(workspace, runId);
    if (stateRes.ok) {
      evidenceChainComplete = Object.values(stateRes.value.tasks).every(
        (t) => t.phase === 'completed',
      );
    }
    if (status === 'passed' && !evidenceChainComplete) {
      status = 'failed';
      summary = 'passed verification but the persisted chain is incomplete';
    }
    const journalRes = await verifyJournal(workspace, runId);
    const journalVerified = journalRes.ok;
    if (status === 'passed' && !journalVerified) {
      status = 'failed';
      summary = `passed verification but the journal audit failed: ${journalRes.error.message.slice(0, 120)}`;
    }

    return {
      id: task.id,
      workflow: task.workflow,
      stack: task.stack,
      holdout: task.holdout === true,
      status,
      summary,
      turns,
      phaseRetries,
      verifyDurationMs,
      wallClockMs: Date.now() - started,
      evidenceChainComplete,
      journalVerified,
      tokensIn: null, // scripted driver: no model tokens, honestly absent
      tokensOut: null,
    };
  } catch (err) {
    return {
      id: task.id,
      workflow: task.workflow,
      stack: task.stack,
      holdout: task.holdout === true,
      status: 'error',
      summary: `harness error (never a task failure): ${err instanceof Error ? err.message : String(err)}`,
      turns,
      phaseRetries,
      verifyDurationMs,
      wallClockMs: Date.now() - started,
      evidenceChainComplete: false,
      journalVerified: false,
      tokensIn: null,
      tokensOut: null,
    };
  } finally {
    if (workspace !== undefined && opts.keepWorkspaces !== true) {
      await fs.rm(workspace, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

/** Run a whole suite (optionally filtered) and produce the report. */
export async function runSuite(suite: Suite, opts: RunOptions): Promise<BenchRunReport> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const tasks = suite.tasks.filter(
    (t) => opts.onlyTaskIds === undefined || opts.onlyTaskIds.has(t.id),
  );
  const results: TaskResult[] = [];
  for (const task of tasks) {
    const result = await runBenchTask(task, suite, opts);
    results.push(result);
    opts.onTask?.(result);
  }
  return {
    schemaVersion: BENCH_REPORT_SCHEMA_VERSION,
    runId: `bench-${startedAt.replace(/[^0-9]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`,
    suite: suite.suite,
    suiteVersion: suite.version,
    driver: suite.driver,
    modelConfig: suite.modelConfig,
    startedAt,
    durationMs: Date.now() - startMs,
    tasks: results,
    aggregate: aggregate(results),
  };
}

/** One observer-shaped JSONL line per task outcome (run-observer audit
 * surface: single telemetry shape, honest fields, no fake zeros). */
export function observerEventLine(
  report: Pick<BenchRunReport, 'runId'>,
  result: TaskResult,
): string {
  return JSON.stringify({
    schemaVersion: 1,
    id: randomUUID(),
    runId: report.runId,
    at: new Date().toISOString(),
    kind: 'verification',
    summary: `bench ${result.id}: ${result.status} (${result.summary})`,
    partial: result.tokensIn === null,
  });
}
