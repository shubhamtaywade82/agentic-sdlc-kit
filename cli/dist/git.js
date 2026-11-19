"use strict";
/**
 * Git helpers. Every call spawns `git` with `shell: false` and validated
 * argument arrays — the kit never executes shell strings.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorCode = errorCode;
exports.git = git;
exports.isGitRepo = isGitRepo;
exports.gitSha = gitSha;
exports.gitBranch = gitBranch;
exports.gitStatusPorcelain = gitStatusPorcelain;
exports.gitTagExists = gitTagExists;
exports.refExists = refExists;
exports.gitDiffNames = gitDiffNames;
exports.commandLookup = commandLookup;
exports.parseVersion = parseVersion;
exports.compareVersions = compareVersions;
const child_process_1 = require("child_process");
/** Extract `error.code` (e.g. ENOENT/ETIMEDOUT) from a spawn error. */
function errorCode(error) {
    return error?.code;
}
function git(root, args, timeoutMs = 15000) {
    const res = (0, child_process_1.spawnSync)("git", args, { cwd: root, encoding: "utf8", shell: false, timeout: timeoutMs });
    if (res.error) {
        return { ok: false, status: res.status ?? null, stdout: res.stdout ?? "", stderr: res.stderr || String(res.error.message) };
    }
    return {
        ok: res.status === 0,
        status: res.status ?? null,
        stdout: res.stdout ?? "",
        stderr: res.stderr ?? "",
    };
}
function isGitRepo(root) {
    const res = (0, child_process_1.spawnSync)("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd: root,
        encoding: "utf8",
        shell: false,
        timeout: 10000,
    });
    return res.status === 0 && String(res.stdout).trim() === "true";
}
function gitSha(root) {
    const res = git(root, ["rev-parse", "HEAD"]);
    if (!res.ok)
        return null;
    const sha = res.stdout.trim();
    return sha.length > 0 ? sha : null;
}
function gitBranch(root) {
    const res = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (!res.ok)
        return null;
    const branch = res.stdout.trim();
    return branch.length > 0 ? branch : null;
}
function gitStatusPorcelain(root) {
    const res = git(root, ["status", "--porcelain"]);
    if (!res.ok)
        return [];
    return res.stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
}
function gitTagExists(root, tag) {
    const res = git(root, ["tag", "-l", tag]);
    return res.ok && res.stdout.trim().length > 0;
}
function refExists(root, ref) {
    const res = git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return res.status === 0;
}
function gitDiffNames(root, base) {
    const res = git(root, ["diff", "--name-only", `${base}...HEAD`]);
    if (!res.ok) {
        return { ok: false, files: [], stderr: res.stderr.trim() };
    }
    return { ok: true, files: res.stdout.split(/\r?\n/).filter((l) => l.trim().length > 0), stderr: "" };
}
/**
 * Check whether a command is runnable on PATH (never via a shell).
 * `exists` is false only when spawning fails with ENOENT (not installed).
 */
function commandLookup(cmd) {
    const res = (0, child_process_1.spawnSync)(cmd, ["--version"], { encoding: "utf8", shell: false, timeout: 15000 });
    if (res.error && errorCode(res.error) === "ENOENT") {
        return { exists: false, version: null, firstLine: null };
    }
    if (res.error) {
        return { exists: false, version: null, firstLine: null };
    }
    const firstLine = (res.stdout || res.stderr || "").split(/\r?\n/).find((l) => l.trim().length > 0) ?? null;
    const version = firstLine !== null ? parseVersion(firstLine) : null;
    return { exists: true, version, firstLine };
}
function parseVersion(text) {
    const m = /(\d+)\.(\d+)\.(\d+)(?:[-.][0-9A-Za-z.-]+)?/.exec(text);
    return m !== null ? m[0] : null;
}
/** Compare dotted numeric versions; returns negative/zero/positive. */
function compareVersions(a, b) {
    const pa = a.split(".").map((n) => Number.parseInt(n, 10));
    const pb = b.split(".").map((n) => Number.parseInt(n, 10));
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] ?? 0;
        const y = pb[i] ?? 0;
        if (x !== y)
            return x < y ? -1 : 1;
    }
    return 0;
}
