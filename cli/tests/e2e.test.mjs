/**
 * End-to-end tests: spawn the real bin/kit.js the way a user would.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runKit, hasGit, makeTempDir, cleanup, writeProject } from "./helpers.mjs";

const ROOT = process.cwd();
const SPEC_FIXTURE = join(ROOT, "tests", "fixtures", "spec-good.md");

test("kit --help exits 0 and lists all ten commands", () => {
  const res = runKit(["--help"]);
  assert.equal(res.status, 0);
  for (const cmd of ["doctor", "inspect", "init", "validate-spec", "validate-plan", "verify", "audit", "changed", "release-check", "scaffold"]) {
    assert.match(res.stdout, new RegExp(`\\b${cmd}\\b`), `help should mention ${cmd}`);
  }
  assert.match(res.stdout, /Exit codes:/);
});

test("each command's --help includes the exit code contract", () => {
  for (const cmd of ["doctor", "inspect", "init", "validate-spec", "validate-plan", "verify", "audit", "changed", "release-check", "scaffold"]) {
    const res = runKit([cmd, "--help"]);
    assert.equal(res.status, 0, `${cmd} --help should exit 0`);
    assert.match(res.stdout, /Usage: kit/);
    assert.match(res.stdout, /Exit codes:/);
    assert.match(res.stdout, /--json/);
  }
});

test("kit --version prints the version", () => {
  const res = runKit(["--version"]);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /^kit 5\.0\.0/);
});

test("kit with no command is a usage error (exit 2)", () => {
  const res = runKit([]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /missing command/);
});

test("kit with an unknown command exits 2", () => {
  const res = runKit(["frobnicate"]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /unknown command/);
});

test("kit with an unknown option exits 2", () => {
  const res = runKit(["verify", "--nonsense"]);
  assert.equal(res.status, 2);
});

test("kit validate-spec <good fixture> exits 0", () => {
  const res = runKit(["validate-spec", SPEC_FIXTURE]);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /PASSED/);
});

test("kit validate-spec --json emits valid JSON", () => {
  const res = runKit(["validate-spec", SPEC_FIXTURE, "--json"]);
  assert.equal(res.status, 0);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.status, "passed");
});

test("kit validate-spec on a missing file exits 2", () => {
  const res = runKit(["validate-spec", "does-not-exist.md"]);
  assert.equal(res.status, 2);
});

test("kit verify without a profile exits 3", () => {
  const dir = makeTempDir("kit-e2e-verify-");
  try {
    const res = runKit(["verify"], { cwd: dir });
    assert.equal(res.status, 3);
    assert.match(res.stderr, /kit init/);
  } finally {
    cleanup(dir);
  }
});

test("kit verify via the CLI writes a report with the exact command contract", () => {
  const dir = makeTempDir("kit-e2e-verify-");
  try {
    writeProject(dir, {
      ".ai/project.yml": `version: 1\nproject:\n  name: e2e-app\n  mode: existing\nquality:\n  commands:\n    ok:\n      - ${JSON.stringify(process.execPath)}\n      - -e\n      - "process.exit(0)"\n`,
    });
    const res = runKit(["verify", "--check", "ok"], { cwd: dir });
    assert.equal(res.status, 0, res.stderr);
    const reportsDir = join(dir, ".ai", "reports", "verification");
    const written = readdirSync(reportsDir).filter((f) => f.startsWith("verify-"));
    assert.equal(written.length, 1);
    const report = JSON.parse(readFileSync(join(reportsDir, written[0]), "utf8"));
    assert.equal(report.schema, "agentic-sdlc/verification-report/1");
    assert.deepEqual(report.command, ["kit", "verify", "--check", "ok"]);
    assert.equal(report.status, "passed");
    assert.equal(report.checks[0].id, "ok");
    assert.equal(report.checks[0].status, "passed");
  } finally {
    cleanup(dir);
  }
});

test("kit changed outside a repository exits 3", { skip: !hasGit() }, () => {
  const dir = makeTempDir("kit-e2e-changed-");
  try {
    const res = runKit(["changed"], { cwd: dir });
    assert.equal(res.status, 3);
  } finally {
    cleanup(dir);
  }
});

test("kit doctor runs and reports node-version OK", () => {
  const res = runKit(["doctor", "--json"]);
  assert.ok(res.status === 0 || res.status === 1, "doctor exits 0 or 1 depending on the environment");
  const parsed = JSON.parse(res.stdout);
  assert.ok(parsed.status === "passed" || parsed.status === "failed");
  const node = parsed.checks.find((c) => c.id === "node-version");
  assert.equal(node.status, "OK");
});
