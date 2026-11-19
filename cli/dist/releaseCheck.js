"use strict";
/**
 * `kit release-check` — validate release readiness. Exit 0 = ready.
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
exports.VERIFICATION_DIR = void 0;
exports.runReleaseCheck = runReleaseCheck;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const git_1 = require("./git");
const audit_1 = require("./audit");
exports.VERIFICATION_DIR = ".ai/reports/verification";
const MAX_REPORT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
function readPackageJsonVersion(root) {
    const file = path.join(root, "package.json");
    if (!fs.existsSync(file))
        return null;
    try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            const version = parsed.version;
            if (typeof version === "string" && SEMVER_RE.test(version))
                return version;
        }
    }
    catch {
        return null;
    }
    return null;
}
function readChangelogVersion(root) {
    const file = path.join(root, "CHANGELOG.md");
    if (!fs.existsSync(file))
        return null;
    const m = /^## \[?v?(\d+\.\d+\.\d+)/m.exec(fs.readFileSync(file, "utf8"));
    return m !== null ? m[1] : null;
}
function changelogMentions(root, version) {
    const file = path.join(root, "CHANGELOG.md");
    if (!fs.existsSync(file))
        return false;
    const content = fs.readFileSync(file, "utf8");
    const re = new RegExp(`(^|[^0-9])v?${version.replace(/\./g, "\\.")}([^0-9]|$)`, "m");
    return re.test(content);
}
function newestVerificationReport(root) {
    const dir = path.join(root, exports.VERIFICATION_DIR);
    if (!fs.existsSync(dir))
        return null;
    const files = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith("verify-") && f.endsWith(".json"))
        .map((f) => {
        const full = path.join(dir, f);
        return { file: f, full, mtime: fs.statSync(full).mtimeMs };
    })
        .sort((a, b) => b.mtime - a.mtime);
    if (files.length === 0)
        return null;
    const newest = files[0];
    if (newest === undefined)
        return null;
    try {
        const parsed = JSON.parse(fs.readFileSync(newest.full, "utf8"));
        const rec = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
        const status = typeof rec.status === "string" ? rec.status : null;
        const timestamp = typeof rec.timestamp === "string" ? rec.timestamp : null;
        let ageMs = null;
        if (timestamp !== null) {
            const t = Date.parse(timestamp);
            if (!Number.isNaN(t))
                ageMs = Date.now() - t;
        }
        return { status, timestamp, ageMs, file: `${exports.VERIFICATION_DIR}/${newest.file}` };
    }
    catch {
        return { status: null, timestamp: null, ageMs: null, file: `${exports.VERIFICATION_DIR}/${newest.file}` };
    }
}
function runReleaseCheck(root, opts) {
    const io = opts.io;
    if (!(0, git_1.isGitRepo)(root)) {
        io.err("kit release-check: not a git repository");
        if (opts.json) {
            io.out(JSON.stringify({ status: "error", code: "NOT_A_REPOSITORY" }, null, 2));
        }
        return { exitCode: 3, report: null };
    }
    // version resolution: --version | package.json | CHANGELOG.md
    let version = null;
    if (opts.version !== undefined) {
        if (!SEMVER_RE.test(opts.version)) {
            io.err(`kit release-check: --version must match x.y.z (found "${opts.version}")`);
            if (opts.json) {
                io.out(JSON.stringify({ status: "error", code: "BAD_VERSION", version: opts.version }, null, 2));
            }
            return { exitCode: 2, report: null };
        }
        version = opts.version;
    }
    else {
        version = readPackageJsonVersion(root) ?? readChangelogVersion(root);
    }
    if (version === null) {
        io.err("kit release-check: no version found — pass --version, set package.json version, or add a \"## [x.y.z]\" heading to CHANGELOG.md");
        if (opts.json) {
            io.out(JSON.stringify({ status: "error", code: "NO_VERSION" }, null, 2));
        }
        return { exitCode: 3, report: null };
    }
    const checks = [];
    // (a) changelog contains the version
    if (changelogMentions(root, version)) {
        checks.push({ id: "changelog", status: "passed", detail: `CHANGELOG.md mentions ${version}` });
    }
    else {
        checks.push({ id: "changelog", status: "failed", detail: fs.existsSync(path.join(root, "CHANGELOG.md")) ? `CHANGELOG.md does not mention ${version}` : "CHANGELOG.md not found" });
    }
    // (b) fresh passing verification report
    const newest = newestVerificationReport(root);
    if (newest === null) {
        checks.push({ id: "verification", status: "failed", detail: "no verification reports found — run `kit verify`" });
    }
    else if (newest.status !== "passed") {
        checks.push({ id: "verification", status: "failed", detail: `newest report ${newest.file} has status "${newest.status}"` });
    }
    else if (newest.ageMs === null || newest.ageMs < 0) {
        checks.push({ id: "verification", status: "failed", detail: `newest report ${newest.file} has an unusable timestamp` });
    }
    else if (newest.ageMs > MAX_REPORT_AGE_MS) {
        checks.push({ id: "verification", status: "failed", detail: `newest report ${newest.file} is ${Math.floor(newest.ageMs / 86400000)} day(s) old (max 7)` });
    }
    else {
        checks.push({ id: "verification", status: "passed", detail: `newest report ${newest.file} passed ${Math.floor(newest.ageMs / 3600000)}h ago` });
    }
    // (c) clean tree
    const dirty = (0, git_1.gitStatusPorcelain)(root).length;
    if (dirty === 0) {
        checks.push({ id: "clean-tree", status: "passed", detail: "working tree clean" });
    }
    else if (opts.allowDirty) {
        checks.push({ id: "clean-tree", status: "passed", detail: `${dirty} uncommitted change(s) allowed (--allow-dirty)` });
    }
    else {
        checks.push({ id: "clean-tree", status: "failed", detail: `${dirty} uncommitted change(s) — commit or use --allow-dirty` });
    }
    // (d) branch
    const branch = (0, git_1.gitBranch)(root);
    if (branch === null) {
        checks.push({ id: "branch", status: "failed", detail: "could not determine the current branch" });
    }
    else if (branch === "main" || branch === "master") {
        checks.push(opts.allowMain
            ? { id: "branch", status: "passed", detail: `on ${branch} (--allow-main)` }
            : { id: "branch", status: "failed", detail: `releases must not be cut from ${branch} (use --allow-main to override)` });
    }
    else {
        checks.push({ id: "branch", status: "passed", detail: `branch ${branch}` });
    }
    // (e) tag must not exist yet
    const tag = `v${version}`;
    if ((0, git_1.gitTagExists)(root, tag)) {
        checks.push({ id: "tag", status: "failed", detail: `tag ${tag} already exists` });
    }
    else {
        checks.push({ id: "tag", status: "passed", detail: `tag ${tag} does not exist yet` });
    }
    // (f) audit passes (secret scan + dependency audit)
    const { files } = (0, audit_1.collectFiles)(root);
    const allowlist = (0, audit_1.loadAllowlist)(root);
    const scan = (0, audit_1.scanPaths)(root, files, allowlist.entries);
    let auditDetail = `secret scan clean (${scan.filesScanned} files${scan.allowlisted > 0 ? `, ${scan.allowlisted} allowlisted` : ""})`;
    let auditFailed = scan.findings.length > 0;
    if (scan.findings.length > 0) {
        auditDetail = `${scan.findings.length} secret finding(s): ${scan.findings
            .slice(0, 3)
            .map((f) => `${f.file}:${f.line} ${f.preview}`)
            .join("; ")}`;
    }
    if (opts.dependencyAudit) {
        const dep = (0, audit_1.runDependencyAudit)(root);
        if (dep.ran && dep.status === "failed") {
            auditFailed = true;
            auditDetail += `; ${dep.detail}`;
        }
        else if (dep.ran) {
            auditDetail += `; ${dep.detail}`;
        }
        else {
            auditDetail += `; dependency audit: ${dep.detail}`;
        }
    }
    else {
        auditDetail += "; dependency audit disabled (--no-dependency-audit)";
    }
    checks.push({ id: "audit", status: auditFailed ? "failed" : "passed", detail: auditDetail });
    const failed = checks.some((c) => c.status === "failed");
    const report = { status: failed ? "failed" : "passed", version, checks };
    if (opts.json) {
        io.out(JSON.stringify(report, null, 2));
    }
    else {
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
