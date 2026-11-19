/**
 * Git helpers. Every call spawns `git` with `shell: false` and validated
 * argument arrays — the kit never executes shell strings.
 */

import { spawnSync } from "child_process";

export interface GitResult {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Extract `error.code` (e.g. ENOENT/ETIMEDOUT) from a spawn error. */
export function errorCode(error: Error | undefined): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

export function git(root: string, args: string[], timeoutMs: number = 15000): GitResult {
  const res = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, timeout: timeoutMs });
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

export function isGitRepo(root: string): boolean {
  const res = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 10000,
  });
  return res.status === 0 && String(res.stdout).trim() === "true";
}

export function gitSha(root: string): string | null {
  const res = git(root, ["rev-parse", "HEAD"]);
  if (!res.ok) return null;
  const sha = res.stdout.trim();
  return sha.length > 0 ? sha : null;
}

export function gitBranch(root: string): string | null {
  const res = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!res.ok) return null;
  const branch = res.stdout.trim();
  return branch.length > 0 ? branch : null;
}

export function gitStatusPorcelain(root: string): string[] {
  const res = git(root, ["status", "--porcelain"]);
  if (!res.ok) return [];
  return res.stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
}

export function gitTagExists(root: string, tag: string): boolean {
  const res = git(root, ["tag", "-l", tag]);
  return res.ok && res.stdout.trim().length > 0;
}

export function refExists(root: string, ref: string): boolean {
  const res = git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  return res.status === 0;
}

export function gitDiffNames(root: string, base: string): { ok: boolean; files: string[]; stderr: string } {
  const res = git(root, ["diff", "--name-only", `${base}...HEAD`]);
  if (!res.ok) {
    return { ok: false, files: [], stderr: res.stderr.trim() };
  }
  return { ok: true, files: res.stdout.split(/\r?\n/).filter((l) => l.trim().length > 0), stderr: "" };
}

export interface CommandLookup {
  exists: boolean;
  version: string | null;
  firstLine: string | null;
}

/**
 * Check whether a command is runnable on PATH (never via a shell).
 * `exists` is false only when spawning fails with ENOENT (not installed).
 */
export function commandLookup(cmd: string): CommandLookup {
  const res = spawnSync(cmd, ["--version"], { encoding: "utf8", shell: false, timeout: 15000 });
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

export function parseVersion(text: string): string | null {
  const m = /(\d+)\.(\d+)\.(\d+)(?:[-.][0-9A-Za-z.-]+)?/.exec(text);
  return m !== null ? m[0] : null;
}

/** Compare dotted numeric versions; returns negative/zero/positive. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10));
  const pb = b.split(".").map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
