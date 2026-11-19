// packages/core/src/verification/process-runner.ts
//
// Safe process executor using shell: false, argument array, and bounded timeouts.
// Invariant (SECURITY.md §1): Commands must NEVER be passed through a shell interpreter.

import { spawn } from "node:child_process";
import {
  rollupReportStatus,
  type Check,
  type CheckStatus,
  type ProjectProfile,
  type Result,
  type VerificationReport,
} from "@agentic-sdlc-kit/contracts";
import type { VerificationRunOptions, VerificationRunner } from "./runner.js";

export interface ProcessRunOptions extends VerificationRunOptions {
  cwd?: string;
  timeoutMs?: number;
}

interface CommandOutcome {
  readonly status: CheckStatus;
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly output: string;
}

function executeProcess(cmd: string[], cwd: string, timeoutMs: number): Promise<CommandOutcome> {
  return new Promise<CommandOutcome>((resolve) => {
    const start = Date.now();
    const [file, ...args] = cmd;
    if (!file) {
      resolve({ status: "failed", exitCode: 1, durationMs: 0, output: "Empty command array" });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(file, args, { cwd, shell: false });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref();
    }, timeoutMs);

    child.stdout?.on("data", (d) => { stdout += d.toString(); });
    child.stderr?.on("data", (d) => { stderr += d.toString(); });

    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      const combined = `${stdout}\n${stderr}`.trim();
      if (timedOut) {
        resolve({ status: "failed", exitCode: 124, durationMs, output: `Timed out: ${combined}` });
      } else {
        const status = code === 0 ? "passed" : "failed";
        resolve({ status, exitCode: code, durationMs, output: combined });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ status: "failed", exitCode: 1, durationMs: Date.now() - start, output: err.message });
    });
  });
}

export class ProcessVerificationRunner implements VerificationRunner {
  async run(
    profile: ProjectProfile,
    opts: ProcessRunOptions = {},
  ): Promise<Result<VerificationReport>> {
    const cwd = opts.cwd ?? process.cwd();
    const timeoutMs = opts.timeoutMs ?? 60_000;
    const checks: Check[] = [];

    const categories: ReadonlyArray<keyof ProjectProfile["commands"]> = [
      "test",
      "lint",
      "typecheck",
      "build",
    ];

    for (const cat of categories) {
      const cmds = profile.commands[cat] ?? [];
      for (const cmd of cmds) {
        if (opts.dryRun) {
          checks.push({ id: cat, status: "skipped", command: cmd });
          continue;
        }
        const outcome = await executeProcess(cmd, cwd, timeoutMs);
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
