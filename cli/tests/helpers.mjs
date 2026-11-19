/**
 * Shared test helpers. Not a test file (node --test only runs *.test.mjs).
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

/** Require the BUILT dist (test what you ship). */
export function loadDist(moduleName) {
  const require = createRequire(import.meta.url);
  return require(`../dist/${moduleName}.js`);
}

export function makeTempDir(prefix = "kit-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

/** Write a map of relative path -> content under root. */
export function writeProject(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const target = join(root, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, typeof content === "string" ? content : content, "utf8");
  }
}

export const silentIO = { out() {}, err() {} };

export function captureIO() {
  const outLines = [];
  const errLines = [];
  return {
    io: {
      out: (line) => outLines.push(line),
      err: (line) => errLines.push(line),
    },
    outLines,
    errLines,
  };
}

export function hasGit() {
  const res = spawnSync("git", ["--version"], { encoding: "utf8" });
  return res.status === 0;
}

/** Create a git repo with an initial commit on `main`. */
export function initGitRepo(root) {
  const run = (args) => {
    const res = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    if (res.status !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${res.stderr}`);
    }
  };
  let initOk = false;
  try {
    run(["init", "-q", "-b", "main"]);
    initOk = true;
  } catch {
    run(["init", "-q"]);
  }
  if (!initOk) run(["checkout", "-q", "-b", "main"]);
  run(["config", "user.email", "kit-test@example.invalid"]);
  run(["config", "user.name", "Kit Test"]);
  return run;
}

export function gitCommitAll(root, message = "commit") {
  const res = spawnSync("git", ["add", "-A"], { cwd: root, encoding: "utf8" });
  if (res.status !== 0) throw new Error(`git add failed: ${res.stderr}`);
  const res2 = spawnSync("git", ["commit", "-qm", message], { cwd: root, encoding: "utf8" });
  if (res2.status !== 0) throw new Error(`git commit failed: ${res2.stderr}`);
}

export const CLI_BIN = join(process.cwd(), "bin", "kit.js");

/** Spawn the real CLI the way a user would. */
export function runKit(args, options = {}) {
  return spawnSync(process.execPath, [CLI_BIN, ...args], {
    encoding: "utf8",
    cwd: options.cwd !== undefined ? options.cwd : process.cwd(),
    timeout: options.timeout !== undefined ? options.timeout : 60000,
  });
}
