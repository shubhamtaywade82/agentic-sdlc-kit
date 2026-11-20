// packages/core/src/verification/process-runner.ts
//
// Safe process executor using shell: false, argument array, and bounded timeouts.
// Invariant (SECURITY.md §1): Commands must NEVER be passed through a shell interpreter.

import { spawn } from 'node:child_process';
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

function executeProcess(
  cmd: string[],
  cwd: string,
  timeoutMs: number,
  maxOutputBytes: number,
): Promise<CommandOutcome> {
  return new Promise<CommandOutcome>((resolve) => {
    const start = Date.now();
    const [file, ...args] = cmd;

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let truncated = false;

    if (!file) {
      resolve({
        status: 'failed',
        exitCode: 1,
        durationMs: 0,
        output: 'Empty command array',
        truncated: false,
        timedOut: false,
        spawnError: 'empty command array',
      });
      return;
    }

    let spawnError: string | undefined;
    const child = spawn(file, args, { cwd, shell: false });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000).unref();
    }, timeoutMs);

    child.stdout?.on('data', (d: Buffer) => {
      if (Buffer.byteLength(stdout, 'utf8') >= maxOutputBytes) {
        truncated = true;
        return;
      }
      stdout += d.toString('utf8');
    });
    child.stderr?.on('data', (d: Buffer) => {
      if (Buffer.byteLength(stderr, 'utf8') >= maxOutputBytes) {
        truncated = true;
        return;
      }
      stderr += d.toString('utf8');
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      const combined = `${stdout}\n${stderr}`.trim();
      const suffix = truncated ? '\n[output truncated: exceeded maxOutputBytes]' : '';
      if (timedOut) {
        resolve({
          status: 'failed',
          exitCode: 124,
          durationMs,
          output: `Timed out: ${combined}${suffix}`,
          truncated,
          timedOut,
        });
      } else {
        const status = code === 0 ? 'passed' : 'failed';
        resolve({ status, exitCode: code, durationMs, output: `${combined}${suffix}`, truncated, timedOut });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      spawnError = err.message;
      resolve({
        status: 'failed',
        exitCode: 1,
        durationMs: Date.now() - start,
        output: err.message,
        truncated: false,
        timedOut: false,
        spawnError,
      });
    });
  });
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
    const timeoutMs = opts.timeoutMs ?? 60_000;
    const maxOutputBytes = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const outcome = await executeProcess([...cmd], cwd, timeoutMs, maxOutputBytes);
    return { ok: true, value: toProcessResult(outcome) };
  }

  async run(
    profile: ProjectProfile,
    opts: ProcessRunOptions = {},
  ): Promise<Result<VerificationReport>> {
    const cwd = opts.cwd ?? process.cwd();
    const timeoutMs = opts.timeoutMs ?? 60_000;
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
