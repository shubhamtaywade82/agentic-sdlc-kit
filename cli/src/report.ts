/**
 * Shared output and reporting primitives.
 *
 * Conventions used by every command:
 *   - human-readable output goes to stdout (`io.out`)
 *   - diagnostics go to stderr (`io.err`)
 *   - `--json` prints a machine-readable object to stdout
 *   - report files carry ISO timestamps and a runId
 */

import { randomBytes } from "crypto";
import * as fs from "fs";
import * as path from "path";

export interface IO {
  out(line: string): void;
  err(line: string): void;
}

export function defaultIO(): IO {
  return {
    out(line: string): void {
      process.stdout.write(line + "\n");
    },
    err(line: string): void {
      process.stderr.write(line + "\n");
    },
  };
}

/** A single validation finding, in the shared kit shape. */
export interface Issue {
  file: string;
  line?: number;
  code: string;
  message: string;
  /** set by plan validation when the issue belongs to a specific task */
  task?: string;
}

export function formatIssue(issue: Issue): string {
  const loc = issue.line !== undefined ? `${issue.file}:${issue.line}` : issue.file;
  const task = issue.task !== undefined ? ` [${issue.task}]` : "";
  return `${loc}${task} [${issue.code}] ${issue.message}`;
}

/** Compact UTC timestamp, e.g. `20250131T093012Z`. */
export function compactTimestamp(now: Date = new Date()): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Random 6-char lowercase hex string. */
export function randomHex6(): string {
  return randomBytes(3).toString("hex");
}

/** A run identifier `<compact-timestamp>-<6 hex chars>`. */
export function newRunId(): string {
  return `${compactTimestamp()}-${randomHex6()}`;
}

/** Write a JSON report file under `<root>/<relativeDir>/` and return its `/`-joined relative path. */
export function writeJsonReport(root: string, relativeDir: string, fileName: string, data: unknown): string {
  const dir = path.join(root, relativeDir);
  fs.mkdirSync(dir, { recursive: true });
  const relativePath = `${relativeDir}/${fileName}`.replace(/\\/g, "/");
  fs.writeFileSync(path.join(dir, fileName), JSON.stringify(data, null, 2) + "\n", "utf8");
  return relativePath;
}
