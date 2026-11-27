// packages/core/src/verification/process-runner.ts
//
// Safe process executor using shell: false, argument array, bounded timeouts,
// and one process group per command. Invariant (SECURITY.md §1): Commands must
// NEVER be passed through a shell interpreter.

import {
  Errors,
  rollupReportStatus,
  type Check,
  type CheckStatus,
  type ProjectProfile,
  type Result,
  type VerificationReport,
} from '@agentic-sdlc-kit/contracts';
import {
  classifyFailure,
  type FailureClassification,
} from './classification.js';
import { runToSettlement, type RunOutcome } from './process-run.js';
import type { VerificationRunOptions, VerificationRunner } from './runner.js';

export interface ProcessRunOptions extends VerificationRunOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Maximum bytes of stdout/stderr to accumulate before truncating. Default: 10 MB. */
  maxOutputBytes?: number;
}

interface CommandOutcome {
  readonly status: CheckStatus;
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly output: string;
  readonly truncated: boolean;
  readonly timedOut: boolean;
  readonly spawnError?: string;
}

/**
 * Structured result of a single task-targeted verification command
 * (ADR-0018 P1: task-scoped Red evidence). `classification` is `null`
 * when the command succeeded; on failure it carries the structured
 * failure mode that the TDD phase gate consumes.
 */
export interface ProcessResult {
  readonly exitCode: number | null;
  /** Bounded, combined stdout+stderr (same bound as profile checks). */
  readonly output: string;
  readonly durationMs: number;
  readonly truncated: boolean;
  readonly timedOut: boolean;
  /** `null` on success (exit 0); a failure classification otherwise. */
  readonly classification: FailureClassification | null;
  /** Short human-readable derivation, recorded with the evidence. */
  readonly reason: string;
}

function toProcessResult(outcome: CommandOutcome): ProcessResult {
  if (outcome.status === 'passed') {
    return {
      exitCode: outcome.exitCode,
      output: outcome.output,
      durationMs: outcome.durationMs,
      truncated: outcome.truncated,
      timedOut: outcome.timedOut,
      classification: null,
      reason: 'command exited 0',
    };
  }
  const { classification, reason } = classifyFailure({
    exitCode: outcome.exitCode,
    output: outcome.output,
    timedOut: outcome.timedOut,
    ...(outcome.spawnError ? { spawnError: outcome.spawnError } : {}),
  });
  return {
    exitCode: outcome.exitCode,
    output: outcome.output,
    durationMs: outcome.durationMs,
    truncated: outcome.truncated,
    timedOut: outcome.timedOut,
    classification,
    reason,
  };
}

const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10 MB

/** Per-command timeout when nothing overrides it. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 180_000;

/**
 * The timeout the runner enforces. The protocol advertises the same value
 * (NextAction.constraints), so both read this one function. A malformed
 * KIT_TIMEOUT_MS falls back to the default, never to NaN.
 */
export function resolveCommandTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.KIT_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_COMMAND_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_COMMAND_TIMEOUT_MS;
}

// Says whether the group was confirmed gone; a claim of a clean tree kill needs proof.
const TERMINATION_NOTE = {
  'group-terminated': 'process group terminated',
  'termination-unconfirmed': 'termination not confirmed',
} as const;

function spawnFailureOutcome(run: RunOutcome, spawnError: string): CommandOutcome {
  return {
    status: 'failed',
    exitCode: 1,
    durationMs: run.durationMs,
    output: spawnError,
    truncated: false,
    timedOut: false,
    spawnError,
  };
}

function timeoutOutcome(run: RunOutcome): CommandOutcome {
  const combined = `${run.stdout}\n${run.stderr}`.trim();
  const suffix = run.truncated ? '\n[output truncated: exceeded maxOutputBytes]' : '';
  const note = run.termination === null ? '' : `\n[${TERMINATION_NOTE[run.termination]}]`;
  return {
    status: 'failed',
    exitCode: 124,
    durationMs: run.durationMs,
    output: `Timed out: ${combined}${suffix}${note}`,
    truncated: run.truncated,
    timedOut: true,
  };
}

function toCommandOutcome(run: RunOutcome): CommandOutcome {
  if (run.spawnError !== undefined) return spawnFailureOutcome(run, run.spawnError);
  if (run.timedOut) return timeoutOutcome(run);
  const combined = `${run.stdout}\n${run.stderr}`.trim();
  const suffix = run.truncated ? '\n[output truncated: exceeded maxOutputBytes]' : '';
  return {
    status: run.exitCode === 0 ? 'passed' : 'failed',
    exitCode: run.exitCode,
    durationMs: run.durationMs,
    output: `${combined}${suffix}`,
    truncated: run.truncated,
    timedOut: false,
  };
}

function executeProcess(
  cmd: string[],
  cwd: string,
  timeoutMs: number,
  maxOutputBytes: number,
): Promise<CommandOutcome> {
  const [file, ...args] = cmd;
  if (!file) {
    return Promise.resolve({
      status: 'failed',
      exitCode: 1,
      durationMs: 0,
      output: 'Empty command array',
      truncated: false,
      timedOut: false,
      spawnError: 'empty command array',
    });
  }
  return runToSettlement(file, args, cwd, timeoutMs, maxOutputBytes).then(toCommandOutcome);
}

export class ProcessVerificationRunner implements VerificationRunner {
  /**
   * Execute ONE task-targeted verification command (argv array, shell: false,
   * scoped cwd, bounded timeout and output) and return a structured,
   * classified result. Used by the TDD phase gate (ADR-0018 P1) so that
   * Red evidence is bound to the task's own verification, not the whole
   * project profile. NEVER throws; failures are carried in the result.
   */
  async runCommand(
    cmd: readonly string[],
    opts: ProcessRunOptions = {},
  ): Promise<Result<ProcessResult>> {
    // Phase evidence requires REAL execution: a dry run cannot produce
    // Red/Green evidence (ADR-0018). Fail closed rather than pretend.
    if (opts.dryRun) {
      return {
        ok: false,
        error: Errors.verificationFailed(
          'task-targeted verification cannot be a dry run: phase evidence requires real execution',
        ),
      };
    }
    const cwd = opts.cwd ?? process.cwd();
    const timeoutMs = opts.timeoutMs ?? resolveCommandTimeoutMs();
    const maxOutputBytes = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const outcome = await executeProcess([...cmd], cwd, timeoutMs, maxOutputBytes);
    return { ok: true, value: toProcessResult(outcome) };
  }

  async run(
    profile: ProjectProfile,
    opts: ProcessRunOptions = {},
  ): Promise<Result<VerificationReport>> {
    const cwd = opts.cwd ?? process.cwd();
    const timeoutMs = opts.timeoutMs ?? resolveCommandTimeoutMs();
    const maxOutputBytes = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const checks: Check[] = [];

    const categories: ReadonlyArray<keyof ProjectProfile['commands']> = [
      'test',
      'lint',
      'typecheck',
      'build',
    ];

    for (const cat of categories) {
      const cmds = profile.commands[cat] ?? [];
      for (const cmd of cmds) {
        if (opts.dryRun) {
          checks.push({ id: cat, status: 'skipped', command: cmd });
          continue;
        }
        const outcome = await executeProcess(cmd, cwd, timeoutMs, maxOutputBytes);
        checks.push({
          id: cat,
          status: outcome.status,
          command: cmd,
          durationMs: outcome.durationMs,
          evidence: outcome.output ? [outcome.output.slice(-2000)] : [],
        });
      }
    }

    const report: VerificationReport = {
      schemaVersion: 1,
      runId: `run-${Date.now()}`,
      status: rollupReportStatus(checks),
      checks,
      ...(opts.commitSha ? { commitSha: opts.commitSha } : {}),
    };
    return { ok: true, value: report };
  }
}
