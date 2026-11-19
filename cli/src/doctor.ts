/**
 * `kit doctor` — environment detection with a human checklist or JSON.
 *
 * Statuses: OK (fine), FAIL (blocks — exit 1), INFO (best-effort note).
 */

import * as fs from "fs";
import * as path from "path";
import { compareVersions, commandLookup } from "./git";
import { IO } from "./report";

export type CheckStatus = "OK" | "FAIL" | "INFO";

export interface DoctorCheck {
  id: string;
  status: CheckStatus;
  detail: string;
}

export interface DoctorReport {
  status: "passed" | "failed";
  checks: DoctorCheck[];
}

export const REQUIRED_NODE_MAJOR = 18;
export const REQUIRED_CLAUDE_VERSION = "2.1.287";

export function runDoctor(root: string, opts: { json: boolean; io: IO }): { exitCode: number; report: DoctorReport } {
  const io = opts.io;
  const checks: DoctorCheck[] = [];

  // node version
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  checks.push(
    major >= REQUIRED_NODE_MAJOR
      ? { id: "node-version", status: "OK", detail: `node ${process.version} (>= ${REQUIRED_NODE_MAJOR} required)` }
      : { id: "node-version", status: "FAIL", detail: `node ${process.version} is below the required ${REQUIRED_NODE_MAJOR}.x` }
  );

  // git present
  const gitLookup = commandLookup("git");
  checks.push(
    gitLookup.exists
      ? { id: "git-present", status: "OK", detail: gitLookup.firstLine !== null ? gitLookup.firstLine : "git found on PATH" }
      : { id: "git-present", status: "FAIL", detail: "git not found on PATH — most kit gates require git" }
  );

  // package managers (informational)
  const managers: string[] = [];
  for (const cmd of ["npm", "yarn", "pnpm", "bundler"]) {
    const lookup = commandLookup(cmd);
    if (lookup.exists) {
      const version = lookup.version !== null ? ` ${lookup.version}` : "";
      managers.push(`${cmd}${version}`);
    }
  }
  checks.push(
    managers.length > 0
      ? { id: "package-managers", status: "OK", detail: managers.join(", ") }
      : { id: "package-managers", status: "INFO", detail: "no package manager found on PATH (npm/yarn/pnpm/bundler)" }
  );

  // project detection
  const pkgPath = path.join(root, "package.json");
  const gemfilePath = path.join(root, "Gemfile");
  let detected = "none";
  if (fs.existsSync(pkgPath) && fs.existsSync(gemfilePath)) {
    detected = "package.json + Gemfile (node + ruby)";
  } else if (fs.existsSync(pkgPath)) {
    detected = "package.json (node)";
  } else if (fs.existsSync(gemfilePath)) {
    detected = "Gemfile (ruby)";
  }
  checks.push(
    detected === "none"
      ? { id: "project-detection", status: "INFO", detail: "no package.json or Gemfile found — run kit init inside a project" }
      : { id: "project-detection", status: "OK", detail: detected }
  );

  // kit integrity (.ai/manifest non-empty)
  const manifestPath = path.join(root, ".ai", "manifest");
  if (fs.existsSync(manifestPath)) {
    const size = fs.statSync(manifestPath).size;
    checks.push(
      size > 0
        ? { id: "kit-integrity", status: "OK", detail: `.ai/manifest present (${size} bytes)` }
        : { id: "kit-integrity", status: "FAIL", detail: ".ai/manifest exists but is empty — kit installation is broken" }
    );
  } else {
    checks.push({ id: "kit-integrity", status: "INFO", detail: ".ai/manifest not found (kit not installed in this project?)" });
  }

  // claude on PATH + version
  const claude = commandLookup("claude");
  if (!claude.exists) {
    checks.push({ id: "claude-version", status: "INFO", detail: "claude not found on PATH (optional)" });
  } else if (claude.version === null) {
    checks.push({ id: "claude-version", status: "INFO", detail: `claude found but version could not be parsed: ${claude.firstLine ?? "(no output)"}` });
  } else if (compareVersions(claude.version, REQUIRED_CLAUDE_VERSION) >= 0) {
    checks.push({ id: "claude-version", status: "OK", detail: `claude ${claude.version} (>= ${REQUIRED_CLAUDE_VERSION})` });
  } else {
    checks.push({
      id: "claude-version",
      status: "FAIL",
      detail: `claude ${claude.version} is older than the required ${REQUIRED_CLAUDE_VERSION}`,
    });
  }

  // MCP build state
  const mcpModules = path.join(root, ".ai", "mcp", "server", "node_modules");
  checks.push(
    fs.existsSync(mcpModules)
      ? { id: "mcp-build-state", status: "OK", detail: "MCP server dependencies installed (.ai/mcp/server/node_modules)" }
      : { id: "mcp-build-state", status: "INFO", detail: "MCP server not built — run npm install in .ai/mcp/server (optional)" }
  );

  const failed = checks.some((c) => c.status === "FAIL");
  const report: DoctorReport = { status: failed ? "failed" : "passed", checks };

  if (opts.json) {
    io.out(JSON.stringify(report, null, 2));
  } else {
    io.out("kit doctor — environment check");
    io.out("");
    for (const c of checks) {
      io.out(`  [${c.status.padEnd(4)}] ${c.id}: ${c.detail}`);
    }
    io.out("");
    if (failed) {
      io.err("kit doctor: one or more checks FAILED");
    } else {
      io.out("All required checks passed.");
    }
  }
  return { exitCode: failed ? 1 : 0, report };
}
