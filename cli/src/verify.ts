/**
 * `kit verify` — run the project's quality gates and produce a
 * machine-readable verification report.
 *
 * SECURITY: quality commands are validated argument arrays from the project
 * profile. They are executed with child_process.spawn(file, args,
 * { shell: false, cwd: projectRoot, timeout }) — never through a shell and
 * never from a raw shell string.
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { IO, newRunId } from "./report";
import { loadProfile, ProfileIssue, profileFilePath, ProjectProfile, QualityCommand } from "./profile";
import { errorCode, gitSha } from "./git";

export const REPORT_SCHEMA = "agentic-sdlc/verification-report/1";
export const REPORT_DIR = ".ai/reports/verification";
const EVIDENCE_LINES = 30;
const MAX_EVIDENCE_LINE_LENGTH = 2000;

export type CheckStatus = "passed" | "failed" | "skipped" | "blocked";

export interface CheckResult {
  id: string;
  status: CheckStatus;
  command: string[];
  exitCode: number | null;
  durationMs: number;
  evidence: string[];
  errors: string[];
  /** why the check was skipped or blocked */
  reason?: string;
}

export interface VerificationReport {
  schema: string;
  runId: string;
  timestamp: string;
  command: string[];
  commitSha: string | null;
  status: "passed" | "failed" | "blocked";
  summary: { passed: number; failed: number; skipped: number; blocked: number };
  checks: CheckResult[];
  /** relative report path (set when the report was written) */
  reportPath?: string;
}

export interface VerifyOptions {
  root: string;
  /** subset of quality command ids (validated by runVerify) */
  check?: string[];
  keepGoing: boolean;
  json: boolean;
  /** raw argv after `verify`, recorded in the report */
  argv: string[];
  io: IO;
}

function isQualityCommand(value: QualityCommand): value is QualityCommand {
  return (
    Array.isArray(value.command) &&
    value.command.length > 0 &&
    value.command.every((p) => typeof p === "string" && p.trim().length > 0)
  );
}

function lastLines(text: string, count: number): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => (l.length > MAX_EVIDENCE_LINE_LENGTH ? l.slice(0, MAX_EVIDENCE_LINE_LENGTH) + "… [truncated]" : l));
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.slice(-count);
}

export function runVerify(opts: VerifyOptions): { exitCode: number; report: VerificationReport } {
  const io = opts.io;
  const root = opts.root;
  const loaded = loadProfile(root);

  if (loaded.missing) {
    io.err(`kit verify: no project profile found at ${profileFilePath(root).replace(root + path.sep, "")} — run \`kit init\` first`);
    if (opts.json) {
      io.out(JSON.stringify({ status: "error", code: "PROFILE_NOT_FOUND", message: "run kit init first" }, null, 2));
    }
    return { exitCode: 3, report: emptyReport(opts.argv, null) };
  }
  if (loaded.profile === null) {
    printProfileIssues(io, loaded.issues);
    if (opts.json) {
      io.out(JSON.stringify({ status: "error", code: "PROFILE_INVALID", issues: loaded.issues }, null, 2));
    }
    return { exitCode: 2, report: emptyReport(opts.argv, null) };
  }
  const profile = loaded.profile;

  // --check subset validation
  let selected: string[];
  if (opts.check !== undefined && opts.check.length > 0) {
    const available = new Set(profile.quality.commands.map((c) => c.id));
    const unknown = opts.check.filter((id) => !available.has(id));
    if (unknown.length > 0) {
      io.err(`kit verify: unknown check id(s): ${unknown.join(", ")} (available: ${Array.from(available).join(", ") || "none"})`);
      if (opts.json) {
        io.out(JSON.stringify({ status: "error", code: "UNKNOWN_CHECK", unknown, available: Array.from(available) }, null, 2));
      }
      return { exitCode: 2, report: emptyReport(opts.argv, null) };
    }
    selected = opts.check;
  } else {
    selected = profile.quality.commands.map((c) => c.id);
  }

  const { checks, summary } = runSelectedChecks(root, profile, selected, opts.keepGoing);
  const status: VerificationReport["status"] =
    summary.failed > 0 ? "failed" : summary.blocked > 0 ? "blocked" : summary.passed > 0 ? "passed" : "blocked";

  const report: VerificationReport = {
    schema: REPORT_SCHEMA,
    runId: newRunId(),
    timestamp: new Date().toISOString(),
    command: ["kit", "verify", ...opts.argv],
    commitSha: gitSha(root),
    status,
    summary,
    checks,
  };

  const relativePath = writeReport(root, report);
  report.reportPath = relativePath;

  if (opts.json) {
    io.out(JSON.stringify(report, null, 2));
  } else {
    io.out("kit verify — quality gates");
    io.out("");
    for (const c of checks) {
      const dur = `${(c.durationMs / 1000).toFixed(1)}s`;
      let extra = "";
      if (c.status === "failed" && c.exitCode !== null) extra = `exit ${c.exitCode}`;
      if (c.status === "failed" && c.exitCode === null) extra = c.errors[0] ?? "failed";
      if (c.reason !== undefined) extra = c.reason;
      io.out(`  ${c.id.padEnd(14)} ${c.status.padEnd(8)} ${dur.padStart(6)}  ${extra}`.trimEnd());
      if (c.status === "failed" && c.evidence.length > 0) {
        for (const line of c.evidence.slice(-5)) {
          io.out(`      | ${line}`);
        }
      }
    }
    io.out("");
    io.out(
      `Summary: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped, ${summary.blocked} blocked → ${status}`
    );
    io.out(`Report: ${relativePath}`);
  }

  // A skipped check is never passed; blocked runs also exit 1.
  return { exitCode: status === "passed" ? 0 : 1, report };
}

function writeReport(root: string, report: VerificationReport): string {
  const dir = path.join(root, REPORT_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `verify-${report.runId}.json`;
  fs.writeFileSync(path.join(dir, fileName), JSON.stringify(report, null, 2) + "\n", "utf8");
  return `${REPORT_DIR}/${fileName}`;
}

function emptyReport(argv: string[], commitSha: string | null): VerificationReport {
  return {
    schema: REPORT_SCHEMA,
    runId: newRunId(),
    timestamp: new Date().toISOString(),
    command: ["kit", "verify", ...argv],
    commitSha,
    status: "blocked",
    summary: { passed: 0, failed: 0, skipped: 0, blocked: 0 },
    checks: [],
  };
}

function printProfileIssues(io: IO, issues: ProfileIssue[]): void {
  io.err(`kit verify: ${".ai/project.yml"} is invalid (${issues.length} problem(s)):`);
  for (const issue of issues) {
    const loc = issue.line !== undefined ? `:${issue.line}` : "";
    io.err(`  .ai/project.yml${loc} [${issue.code}] ${issue.message}`);
  }
}

/**
 * Execute the selected quality checks in profile order.
 * `selected` may contain ids that are absent from the profile — those are
 * reported as `skipped` with a reason (defensive; the CLI validates --check
 * ids first).
 */
export function runSelectedChecks(
  root: string,
  profile: ProjectProfile,
  selected: string[],
  keepGoing: boolean
): { checks: CheckResult[]; summary: { passed: number; failed: number; skipped: number; blocked: number } } {
  const byId = new Map(profile.quality.commands.map((c) => [c.id, c]));
  const checks: CheckResult[] = [];
  let failedSeen = false;
  let failedId: string | null = null;
  const summary = { passed: 0, failed: 0, skipped: 0, blocked: 0 };

  for (const id of selected) {
    const entry = byId.get(id);
    if (entry === undefined) {
      const skipped: CheckResult = {
        id,
        status: "skipped",
        command: [],
        exitCode: null,
        durationMs: 0,
        evidence: [],
        errors: [],
        reason: "not configured in .ai/project.yml quality.commands",
      };
      checks.push(skipped);
      summary.skipped++;
      continue;
    }
    if (!isQualityCommand(entry)) {
      // unreachable: profile validation rejects such entries; keep as blocked
      const blocked: CheckResult = {
        id,
        status: "blocked",
        command: [],
        exitCode: null,
        durationMs: 0,
        evidence: [],
        errors: ["invalid command definition in profile"],
        reason: "invalid command definition in profile",
      };
      checks.push(blocked);
      summary.blocked++;
      continue;
    }
    if (failedSeen && profile.quality.stopOnFailure && !keepGoing) {
      const blocked: CheckResult = {
        id,
        status: "blocked",
        command: entry.command,
        exitCode: null,
        durationMs: 0,
        evidence: [],
        errors: [],
        reason: `not run: ${failedId} failed and quality.stopOnFailure is enabled (use --keep-going to run anyway)`,
      };
      checks.push(blocked);
      summary.blocked++;
      continue;
    }
    checks.push(executeCheck(root, entry, profile.quality.timeoutSeconds));
    const last = checks[checks.length - 1];
    if (last !== undefined && last.status === "passed") summary.passed++;
    else if (last !== undefined && last.status === "failed") {
      summary.failed++;
      failedSeen = true;
      failedId = id;
    } else if (last !== undefined && last.status === "skipped") {
      // e.g. the executable is not on PATH (ENOENT) — count it as skipped
      summary.skipped++;
    }
  }
  return { checks, summary };
}

function executeCheck(root: string, entry: QualityCommand, timeoutSeconds: number): CheckResult {
  const started = Date.now();
  const res = spawnSync(entry.command[0], entry.command.slice(1), {
    cwd: root,
    shell: false,
    timeout: timeoutSeconds * 1000,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const durationMs = Date.now() - started;
  const output = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
  const evidence = lastLines(output, EVIDENCE_LINES);

  if (res.error && errorCode(res.error) === "ENOENT") {
    return {
      id: entry.id,
      status: "skipped",
      command: entry.command,
      exitCode: null,
      durationMs,
      evidence: [],
      errors: [],
      reason: `executable not found: ${entry.command[0]}`,
    };
  }
  if (res.error && errorCode(res.error) === "ETIMEDOUT") {
    return {
      id: entry.id,
      status: "failed",
      command: entry.command,
      exitCode: null,
      durationMs,
      evidence,
      errors: [`timed out after ${timeoutSeconds}s`],
    };
  }
  if (res.status === 0) {
    return {
      id: entry.id,
      status: "passed",
      command: entry.command,
      exitCode: 0,
      durationMs,
      evidence,
      errors: [],
    };
  }
  // killed by a signal (e.g. SIGTERM after timeout) without an ETIMEDOUT error
  const timedOut = res.error === null && res.status === null && res.signal !== null;
  return {
    id: entry.id,
    status: "failed",
    command: entry.command,
    exitCode: res.status,
    durationMs,
    evidence,
    errors: timedOut ? [`terminated by signal ${res.signal} (timeout ${timeoutSeconds}s)`] : [],
  };
}
