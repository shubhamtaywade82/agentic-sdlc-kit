/**
 * `kit release-check` — validate release readiness. Exit 0 = ready.
 */

import * as fs from "fs";
import * as path from "path";
import { IO } from "./report";
import { gitBranch, gitStatusPorcelain, gitTagExists, isGitRepo } from "./git";
import { collectFiles, loadAllowlist, scanPaths, runDependencyAudit } from "./audit";

export const VERIFICATION_DIR = ".ai/reports/verification";
const MAX_REPORT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type ReleaseCheckStatus = "passed" | "failed";

export interface ReleaseCheck {
  id: string;
  status: ReleaseCheckStatus;
  detail: string;
}

export interface ReleaseCheckReport {
  status: ReleaseCheckStatus;
  version: string;
  checks: ReleaseCheck[];
}

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function readPackageJsonVersion(root: string): string | null {
  const file = path.join(root, "package.json");
  if (!fs.existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const version = (parsed as Record<string, unknown>).version;
      if (typeof version === "string" && SEMVER_RE.test(version)) return version;
    }
  } catch {
    return null;
  }
  return null;
}

function readChangelogVersion(root: string): string | null {
  const file = path.join(root, "CHANGELOG.md");
  if (!fs.existsSync(file)) return null;
  const m = /^## \[?v?(\d+\.\d+\.\d+)/m.exec(fs.readFileSync(file, "utf8"));
  return m !== null ? m[1] : null;
}

function changelogMentions(root: string, version: string): boolean {
  const file = path.join(root, "CHANGELOG.md");
  if (!fs.existsSync(file)) return false;
  const content = fs.readFileSync(file, "utf8");
  const re = new RegExp(`(^|[^0-9])v?${version.replace(/\./g, "\\.")}([^0-9]|$)`, "m");
  return re.test(content);
}

interface NewestReport {
  status: string | null;
  timestamp: string | null;
  ageMs: number | null;
  file: string;
}

function newestVerificationReport(root: string): NewestReport | null {
  const dir = path.join(root, VERIFICATION_DIR);
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("verify-") && f.endsWith(".json"))
    .map((f) => {
      const full = path.join(dir, f);
      return { file: f, full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) return null;
  const newest = files[0];
  if (newest === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(newest.full, "utf8"));
    const rec = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    const status = typeof rec.status === "string" ? rec.status : null;
    const timestamp = typeof rec.timestamp === "string" ? rec.timestamp : null;
    let ageMs: number | null = null;
    if (timestamp !== null) {
      const t = Date.parse(timestamp);
      if (!Number.isNaN(t)) ageMs = Date.now() - t;
    }
    return { status, timestamp, ageMs, file: `${VERIFICATION_DIR}/${newest.file}` };
  } catch {
    return { status: null, timestamp: null, ageMs: null, file: `${VERIFICATION_DIR}/${newest.file}` };
  }
}

export function runReleaseCheck(
  root: string,
  opts: { version?: string; allowDirty: boolean; allowMain: boolean; dependencyAudit: boolean; json: boolean; io: IO }
): { exitCode: number; report: ReleaseCheckReport | null } {
  const io = opts.io;

  if (!isGitRepo(root)) {
    io.err("kit release-check: not a git repository");
    if (opts.json) {
      io.out(JSON.stringify({ status: "error", code: "NOT_A_REPOSITORY" }, null, 2));
    }
    return { exitCode: 3, report: null };
  }

  // version resolution: --version | package.json | CHANGELOG.md
  let version: string | null = null;
  if (opts.version !== undefined) {
    if (!SEMVER_RE.test(opts.version)) {
      io.err(`kit release-check: --version must match x.y.z (found "${opts.version}")`);
      if (opts.json) {
        io.out(JSON.stringify({ status: "error", code: "BAD_VERSION", version: opts.version }, null, 2));
      }
      return { exitCode: 2, report: null };
    }
    version = opts.version;
  } else {
    version = readPackageJsonVersion(root) ?? readChangelogVersion(root);
  }
  if (version === null) {
    io.err("kit release-check: no version found — pass --version, set package.json version, or add a \"## [x.y.z]\" heading to CHANGELOG.md");
    if (opts.json) {
      io.out(JSON.stringify({ status: "error", code: "NO_VERSION" }, null, 2));
    }
    return { exitCode: 3, report: null };
  }

  const checks: ReleaseCheck[] = [];

  // (a) changelog contains the version
  if (changelogMentions(root, version)) {
    checks.push({ id: "changelog", status: "passed", detail: `CHANGELOG.md mentions ${version}` });
  } else {
    checks.push({ id: "changelog", status: "failed", detail: fs.existsSync(path.join(root, "CHANGELOG.md")) ? `CHANGELOG.md does not mention ${version}` : "CHANGELOG.md not found" });
  }

  // (b) fresh passing verification report
  const newest = newestVerificationReport(root);
  if (newest === null) {
    checks.push({ id: "verification", status: "failed", detail: "no verification reports found — run `kit verify`" });
  } else if (newest.status !== "passed") {
    checks.push({ id: "verification", status: "failed", detail: `newest report ${newest.file} has status "${newest.status}"` });
  } else if (newest.ageMs === null || newest.ageMs < 0) {
    checks.push({ id: "verification", status: "failed", detail: `newest report ${newest.file} has an unusable timestamp` });
  } else if (newest.ageMs > MAX_REPORT_AGE_MS) {
    checks.push({ id: "verification", status: "failed", detail: `newest report ${newest.file} is ${Math.floor(newest.ageMs / 86400000)} day(s) old (max 7)` });
  } else {
    checks.push({ id: "verification", status: "passed", detail: `newest report ${newest.file} passed ${Math.floor(newest.ageMs / 3600000)}h ago` });
  }

  // (c) clean tree
  const dirty = gitStatusPorcelain(root).length;
  if (dirty === 0) {
    checks.push({ id: "clean-tree", status: "passed", detail: "working tree clean" });
  } else if (opts.allowDirty) {
    checks.push({ id: "clean-tree", status: "passed", detail: `${dirty} uncommitted change(s) allowed (--allow-dirty)` });
  } else {
    checks.push({ id: "clean-tree", status: "failed", detail: `${dirty} uncommitted change(s) — commit or use --allow-dirty` });
  }

  // (d) branch
  const branch = gitBranch(root);
  if (branch === null) {
    checks.push({ id: "branch", status: "failed", detail: "could not determine the current branch" });
  } else if (branch === "main" || branch === "master") {
    checks.push(
      opts.allowMain
        ? { id: "branch", status: "passed", detail: `on ${branch} (--allow-main)` }
        : { id: "branch", status: "failed", detail: `releases must not be cut from ${branch} (use --allow-main to override)` }
    );
  } else {
    checks.push({ id: "branch", status: "passed", detail: `branch ${branch}` });
  }

  // (e) tag must not exist yet
  const tag = `v${version}`;
  if (gitTagExists(root, tag)) {
    checks.push({ id: "tag", status: "failed", detail: `tag ${tag} already exists` });
  } else {
    checks.push({ id: "tag", status: "passed", detail: `tag ${tag} does not exist yet` });
  }

  // (f) audit passes (secret scan + dependency audit)
  const { files } = collectFiles(root);
  const allowlist = loadAllowlist(root);
  const scan = scanPaths(root, files, allowlist.entries);
  let auditDetail = `secret scan clean (${scan.filesScanned} files${scan.allowlisted > 0 ? `, ${scan.allowlisted} allowlisted` : ""})`;
  let auditFailed = scan.findings.length > 0;
  if (scan.findings.length > 0) {
    auditDetail = `${scan.findings.length} secret finding(s): ${scan.findings
      .slice(0, 3)
      .map((f) => `${f.file}:${f.line} ${f.preview}`)
      .join("; ")}`;
  }
  if (opts.dependencyAudit) {
    const dep = runDependencyAudit(root);
    if (dep.ran && dep.status === "failed") {
      auditFailed = true;
      auditDetail += `; ${dep.detail}`;
    } else if (dep.ran) {
      auditDetail += `; ${dep.detail}`;
    } else {
      auditDetail += `; dependency audit: ${dep.detail}`;
    }
  } else {
    auditDetail += "; dependency audit disabled (--no-dependency-audit)";
  }
  checks.push({ id: "audit", status: auditFailed ? "failed" : "passed", detail: auditDetail });

  const failed = checks.some((c) => c.status === "failed");
  const report: ReleaseCheckReport = { status: failed ? "failed" : "passed", version, checks };

  if (opts.json) {
    io.out(JSON.stringify(report, null, 2));
  } else {
    io.out(`kit release-check — ${version}`);
    io.out("");
    for (const c of checks) {
      io.out(`  [${c.status === "passed" ? " OK " : "FAIL"}] ${c.id}: ${c.detail}`);
    }
    io.out("");
    io.out(failed ? "NOT READY — fix the failing checks above" : `READY — v${version} can be tagged ${tag}`);
  }
  return { exitCode: failed ? 1 : 0, report };
}
