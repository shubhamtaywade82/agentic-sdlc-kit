"use strict";
/**
 * `kit audit` — secret scanning with allowlist suppression and best-effort
 * dependency audits. No network calls are made by the kit itself; the
 * optional `npm audit` / `bundle audit` integrations delegate to those
 * tools (spawned with shell:false and validated argument arrays).
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
exports.EMPTY_SEVERITY_COUNTS = exports.MAX_SCAN_BYTES = void 0;
exports.isSkippedPath = isSkippedPath;
exports.walkFiles = walkFiles;
exports.collectFiles = collectFiles;
exports.loadAllowlist = loadAllowlist;
exports.scanPaths = scanPaths;
exports.parseNpmAudit = parseNpmAudit;
exports.runDependencyAudit = runDependencyAudit;
exports.runAudit = runAudit;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const secrets_1 = require("./secrets");
const git_1 = require("./git");
/** Max bytes read from a single file (huge generated files are skipped). */
exports.MAX_SCAN_BYTES = 2 * 1024 * 1024;
/** Directory names skipped when walking; `.ai/reports` is skipped by prefix. */
const SKIP_DIRS = new Set(["node_modules", ".git", "vendor", "dist", "coverage"]);
const SKIP_PREFIXES = [".ai/reports/"];
function isSkippedPath(relPath) {
    const norm = relPath.replace(/\\/g, "/");
    if (SKIP_PREFIXES.some((p) => norm === p.slice(0, -1) || norm.startsWith(p)))
        return true;
    const parts = norm.split("/");
    return parts.some((part) => SKIP_DIRS.has(part));
}
/** Recursively collect files under root, honoring the kit skip list. */
function walkFiles(root) {
    const out = [];
    const visit = (dir, relDir) => {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
            if (isSkippedPath(rel))
                continue;
            const abs = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                visit(abs, rel);
            }
            else if (entry.isFile()) {
                out.push(rel);
            }
            // symlinks are deliberately not followed (symlink protection)
        }
    };
    visit(root, "");
    return out;
}
/**
 * Collect files for scanning: `git ls-files --cached --others --exclude-standard`
 * when inside a repository (tracked + untracked-but-not-ignored files),
 * otherwise a directory walk.
 */
function collectFiles(root) {
    if ((0, git_1.isGitRepo)(root)) {
        const res = (0, child_process_1.spawnSync)("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
            cwd: root,
            encoding: "utf8",
            shell: false,
            timeout: 30000,
        });
        if (res.status === 0 && typeof res.stdout === "string") {
            const files = res.stdout
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter((l) => l.length > 0)
                .filter((l) => !isSkippedPath(l));
            return { files, mode: "git" };
        }
    }
    return { files: walkFiles(root), mode: "walk" };
}
/** Parse `.ai/audit-allowlist.txt` (literal substrings, `#` comments). */
function loadAllowlist(root) {
    const file = path.join(root, ".ai", "audit-allowlist.txt");
    if (!fs.existsSync(file))
        return { entries: [], missing: true };
    const entries = [];
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const line = raw.trim();
        if (line === "" || line.startsWith("#"))
            continue;
        entries.push(line);
    }
    return { entries, missing: false };
}
/** True when the first 8KB contain a NUL byte (binary file). */
function isBinary(fd) {
    const buf = Buffer.alloc(8192);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).includes(0);
}
function readScanCandidate(file) {
    let fd;
    try {
        const stat = fs.statSync(file);
        if (!stat.isFile())
            return null;
        fd = fs.openSync(file, "r");
        if (isBinary(fd))
            return null;
        const length = Math.min(stat.size, exports.MAX_SCAN_BYTES);
        if (length === 0)
            return "";
        const buf = Buffer.alloc(length);
        fs.readSync(fd, buf, 0, length, 0);
        return buf.toString("utf8");
    }
    catch {
        return null;
    }
    finally {
        if (fd !== undefined)
            fs.closeSync(fd);
    }
}
/** Scan the given relative files under root with allowlist suppression. */
function scanPaths(root, files, allowEntries) {
    const findings = [];
    let allowlisted = 0;
    let filesScanned = 0;
    for (const rel of files) {
        const content = readScanCandidate(path.join(root, rel));
        if (content === null)
            continue; // binary, unreadable or directory
        filesScanned++;
        for (const f of (0, secrets_1.scanContent)(content)) {
            if (allowEntries.some((entry) => f.matchedText.includes(entry))) {
                allowlisted++;
                continue;
            }
            findings.push({ file: rel, line: f.line, patternId: f.patternId, preview: f.preview });
        }
    }
    return { filesScanned, findings, allowlisted };
}
exports.EMPTY_SEVERITY_COUNTS = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };
function asRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v) ? v : null;
}
/** Count severities from an `npm audit --json` payload. */
function parseNpmAudit(stdout) {
    let parsed;
    try {
        parsed = JSON.parse(stdout);
    }
    catch {
        return null;
    }
    const root = asRecord(parsed);
    if (root === null)
        return null;
    const metadata = asRecord(root.metadata);
    const vulns = metadata !== null ? asRecord(metadata.vulnerabilities) : null;
    if (vulns === null)
        return null;
    const counts = { ...exports.EMPTY_SEVERITY_COUNTS };
    for (const key of Object.keys(counts)) {
        const n = vulns[key];
        if (typeof n === "number")
            counts[key] = n;
    }
    return counts;
}
function spawnJson(cmd, args, cwd) {
    const res = (0, child_process_1.spawnSync)(cmd, args, { cwd, encoding: "utf8", shell: false, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
    if (res.error) {
        return { ran: false, stdout: "", error: (0, git_1.errorCode)(res.error) === "ENOENT" ? `${cmd} not found` : String(res.error.message) };
    }
    return { ran: true, stdout: res.stdout ?? "" };
}
function commandAvailable(cmd) {
    const res = (0, child_process_1.spawnSync)(cmd, ["--version"], { encoding: "utf8", shell: false, timeout: 15000 });
    return !(res.error && (0, git_1.errorCode)(res.error) === "ENOENT");
}
/**
 * Run the dependency audit when possible.
 * - node: requires package.json + package-lock.json + npm on PATH
 * - ruby: runs `bundle audit` only when `bundle` is on PATH
 * Everything else is reported as INFO (never blocks unless vulnerabilities
 * are found).
 */
function runDependencyAudit(root) {
    const hasPackageJson = fs.existsSync(path.join(root, "package.json"));
    const hasLock = fs.existsSync(path.join(root, "package-lock.json"));
    const hasGemfile = fs.existsSync(path.join(root, "Gemfile"));
    if (hasPackageJson && hasLock) {
        if (!commandAvailable("npm")) {
            return { ran: false, status: "info", counts: null, total: 0, tool: "npm", detail: "npm not found on PATH — dependency audit skipped" };
        }
        const res = spawnJson("npm", ["audit", "--json"], root);
        if (!res.ran) {
            return { ran: false, status: "info", counts: null, total: 0, tool: "npm", detail: `npm audit could not run: ${res.error}` };
        }
        const counts = parseNpmAudit(res.stdout);
        if (counts === null) {
            return { ran: false, status: "info", counts: null, total: 0, tool: "npm", detail: "npm audit did not produce a parsable JSON report" };
        }
        const total = counts.critical + counts.high + counts.moderate + counts.low + counts.info;
        const criticalHigh = counts.critical + counts.high;
        const summary = `${counts.critical} critical, ${counts.high} high, ${counts.moderate} moderate, ${counts.low} low, ${counts.info} info`;
        return {
            ran: true,
            status: criticalHigh > 0 ? "failed" : "passed",
            counts,
            total,
            tool: "npm",
            detail: `npm audit: ${summary}`,
        };
    }
    if (hasGemfile) {
        if (!commandAvailable("bundle")) {
            return { ran: false, status: "info", counts: null, total: 0, tool: "bundle", detail: "bundle not found on PATH — dependency audit skipped" };
        }
        const res = spawnJson("bundle", ["audit", "check", "--format", "json"], root);
        if (!res.ran) {
            return { ran: false, status: "info", counts: null, total: 0, tool: "bundle", detail: `bundle audit could not run: ${res.error}` };
        }
        // bundler-audit: exit 0 = clean; non-zero with JSON body when vulnerable
        let parsed;
        try {
            parsed = JSON.parse(res.stdout);
        }
        catch {
            return { ran: false, status: "info", counts: null, total: 0, tool: "bundle", detail: "bundle audit did not produce a parsable JSON report" };
        }
        const list = Array.isArray(parsed)
            ? parsed
            : asRecord(parsed) !== null && Array.isArray(asRecord(parsed).vulnerabilities)
                ? asRecord(parsed).vulnerabilities
                : [];
        const counts = { ...exports.EMPTY_SEVERITY_COUNTS };
        for (const item of list) {
            const rec = asRecord(item);
            const severity = rec !== null && typeof rec.severity === "string" ? rec.severity.toLowerCase() : "";
            if (severity.includes("critical"))
                counts.critical++;
            else if (severity.includes("high"))
                counts.high++;
            else if (severity.includes("moderate") || severity.includes("medium"))
                counts.moderate++;
            else if (severity.includes("low"))
                counts.low++;
            else
                counts.info++; // advisories without machine-readable severity
        }
        const criticalHigh = counts.critical + counts.high;
        const total = list.length;
        return {
            ran: true,
            status: criticalHigh > 0 ? "failed" : "passed",
            counts,
            total,
            tool: "bundle",
            detail: `bundle audit: ${total} vulnerabilit${total === 1 ? "y" : "ies"} (${counts.critical} critical, ${counts.high} high)`,
        };
    }
    return {
        ran: false,
        status: "info",
        counts: null,
        total: 0,
        tool: null,
        detail: "no dependency manifest + lockfile pair found — dependency audit skipped",
    };
}
function runAudit(root, opts) {
    const io = opts.io;
    const { files, mode } = collectFiles(root);
    const allowlist = loadAllowlist(root);
    const scan = scanPaths(root, files, allowlist.entries);
    const dep = opts.dependencyAudit ? runDependencyAudit(root) : {
        ran: false,
        status: "info",
        counts: null,
        total: 0,
        tool: null,
        detail: "dependency audit disabled (--no-dependency-audit)",
    };
    const secretFailed = scan.findings.length > 0;
    const depFailed = dep.ran && dep.status === "failed";
    const failed = secretFailed || depFailed;
    const report = {
        status: failed ? "failed" : "passed",
        summary: {
            filesScanned: scan.filesScanned,
            findings: scan.findings.length,
            allowlisted: scan.allowlisted,
            // the spec shape always carries the five severity counters; zeros when
            // the dependency audit did not run (see `dependencyAudit` for why)
            vulnerabilities: dep.counts !== null ? dep.counts : { ...exports.EMPTY_SEVERITY_COUNTS },
        },
        findings: scan.findings,
        dependencyAudit: dep,
    };
    if (opts.json) {
        io.out(JSON.stringify(report, null, 2));
    }
    else {
        io.out(`kit audit — scanned ${scan.filesScanned} file(s) (${mode === "git" ? "git ls-files" : "directory walk"})`);
        if (scan.findings.length > 0) {
            io.out("");
            for (const f of scan.findings) {
                io.out(`  ${f.file}:${f.line} [${f.patternId}] ${f.preview}`);
            }
            io.out("");
            io.err(`${scan.findings.length} potential secret(s) found — previews are truncated; NEVER commit the full value`);
        }
        if (scan.allowlisted > 0) {
            io.out(`${scan.allowlisted} finding(s) suppressed by .ai/audit-allowlist.txt`);
        }
        if (dep.ran) {
            io.out(`Dependency audit (${dep.tool}): ${dep.detail}`);
        }
        else {
            io.out(`Dependency audit: ${dep.detail}`);
        }
        io.out("");
        io.out(failed ? "Status: FAILED" : "Status: passed");
    }
    return { exitCode: failed ? 1 : 0, report };
}
