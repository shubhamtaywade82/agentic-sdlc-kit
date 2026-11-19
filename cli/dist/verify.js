"use strict";
/**
 * `kit verify` — run the project's quality gates and produce a
 * machine-readable verification report.
 *
 * SECURITY: quality commands are validated argument arrays from the project
 * profile. They are executed with child_process.spawn(file, args,
 * { shell: false, cwd: projectRoot, timeout }) — never through a shell and
 * never from a raw shell string.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPORT_DIR = exports.REPORT_SCHEMA = void 0;
exports.runVerify = runVerify;
exports.runSelectedChecks = runSelectedChecks;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const report_1 = require("./report");
const profile_1 = require("./profile");
const git_1 = require("./git");
exports.REPORT_SCHEMA = "agentic-sdlc/verification-report/1";
exports.REPORT_DIR = ".ai/reports/verification";
const EVIDENCE_LINES = 30;
const MAX_EVIDENCE_LINE_LENGTH = 2000;
function isQualityCommand(value) {
    return (Array.isArray(value.command) &&
        value.command.length > 0 &&
        value.command.every((p) => typeof p === "string" && p.trim().length > 0));
}
function lastLines(text, count) {
    const lines = text
        .split(/\r?\n/)
        .map((l) => (l.length > MAX_EVIDENCE_LINE_LENGTH ? l.slice(0, MAX_EVIDENCE_LINE_LENGTH) + "… [truncated]" : l));
    while (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
    }
    return lines.slice(-count);
}
function runVerify(opts) {
    const io = opts.io;
    const root = opts.root;
    const loaded = (0, profile_1.loadProfile)(root);
    if (loaded.missing) {
        io.err(`kit verify: no project profile found at ${(0, profile_1.profileFilePath)(root).replace(root + path.sep, "")} — run \`kit init\` first`);
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
    let selected;
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
    }
    else {
        selected = profile.quality.commands.map((c) => c.id);
    }
    const { checks, summary } = runSelectedChecks(root, profile, selected, opts.keepGoing);
    const status = summary.failed > 0 ? "failed" : summary.blocked > 0 ? "blocked" : summary.passed > 0 ? "passed" : "blocked";
    const report = {
        schema: exports.REPORT_SCHEMA,
        runId: (0, report_1.newRunId)(),
        timestamp: new Date().toISOString(),
        command: ["kit", "verify", ...opts.argv],
        commitSha: (0, git_1.gitSha)(root),
        status,
        summary,
        checks,
    };
    const relativePath = writeReport(root, report);
    report.reportPath = relativePath;
    if (opts.json) {
        io.out(JSON.stringify(report, null, 2));
    }
    else {
        io.out("kit verify — quality gates");
        io.out("");
        for (const c of checks) {
            const dur = `${(c.durationMs / 1000).toFixed(1)}s`;
            let extra = "";
            if (c.status === "failed" && c.exitCode !== null)
                extra = `exit ${c.exitCode}`;
            if (c.status === "failed" && c.exitCode === null)
                extra = c.errors[0] ?? "failed";
            if (c.reason !== undefined)
                extra = c.reason;
            io.out(`  ${c.id.padEnd(14)} ${c.status.padEnd(8)} ${dur.padStart(6)}  ${extra}`.trimEnd());
            if (c.status === "failed" && c.evidence.length > 0) {
                for (const line of c.evidence.slice(-5)) {
                    io.out(`      | ${line}`);
                }
            }
        }
        io.out("");
        io.out(`Summary: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped, ${summary.blocked} blocked → ${status}`);
        io.out(`Report: ${relativePath}`);
    }
    // A skipped check is never passed; blocked runs also exit 1.
    return { exitCode: status === "passed" ? 0 : 1, report };
}
function writeReport(root, report) {
    const dir = path.join(root, exports.REPORT_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const fileName = `verify-${report.runId}.json`;
    fs.writeFileSync(path.join(dir, fileName), JSON.stringify(report, null, 2) + "\n", "utf8");
    return `${exports.REPORT_DIR}/${fileName}`;
}
function emptyReport(argv, commitSha) {
    return {
        schema: exports.REPORT_SCHEMA,
        runId: (0, report_1.newRunId)(),
        timestamp: new Date().toISOString(),
        command: ["kit", "verify", ...argv],
        commitSha,
        status: "blocked",
        summary: { passed: 0, failed: 0, skipped: 0, blocked: 0 },
        checks: [],
    };
}
function printProfileIssues(io, issues) {
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
function runSelectedChecks(root, profile, selected, keepGoing) {
    const byId = new Map(profile.quality.commands.map((c) => [c.id, c]));
    const checks = [];
    let failedSeen = false;
    let failedId = null;
    const summary = { passed: 0, failed: 0, skipped: 0, blocked: 0 };
    for (const id of selected) {
        const entry = byId.get(id);
        if (entry === undefined) {
            const skipped = {
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
            const blocked = {
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
            const blocked = {
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
        if (last !== undefined && last.status === "passed")
            summary.passed++;
        else if (last !== undefined && last.status === "failed") {
            summary.failed++;
            failedSeen = true;
            failedId = id;
        }
        else if (last !== undefined && last.status === "skipped") {
            // e.g. the executable is not on PATH (ENOENT) — count it as skipped
            summary.skipped++;
        }
    }
    return { checks, summary };
}
function executeCheck(root, entry, timeoutSeconds) {
    const started = Date.now();
    const res = (0, child_process_1.spawnSync)(entry.command[0], entry.command.slice(1), {
        cwd: root,
        shell: false,
        timeout: timeoutSeconds * 1000,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
    });
    const durationMs = Date.now() - started;
    const output = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
    const evidence = lastLines(output, EVIDENCE_LINES);
    if (res.error && (0, git_1.errorCode)(res.error) === "ENOENT") {
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
    if (res.error && (0, git_1.errorCode)(res.error) === "ETIMEDOUT") {
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
