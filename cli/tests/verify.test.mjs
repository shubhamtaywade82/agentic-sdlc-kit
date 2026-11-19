/**
 * verify tests: report contract, statuses (passed/failed/skipped/blocked),
 * exit codes, timeouts and --check subsetting against a temp project.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir, cleanup, writeProject, silentIO, loadDist } from "./helpers.mjs";

const { runVerify, runSelectedChecks, REPORT_SCHEMA, REPORT_DIR } = loadDist("verify");
const { parseProfileText } = loadDist("profile");

function profileYaml(commands, extra = "") {
  const cmds = Object.entries(commands)
    .map(([id, args]) => `    ${id}:\n${args.map((a) => `      - ${JSON.stringify(a)}`).join("\n")}`)
    .join("\n");
  return `version: 1
project:
  name: verify-app
  mode: existing
quality:
  commands:
${cmds}
${extra}`;
}

const NODE = process.execPath;

function setup(commands, extra = "") {
  const root = makeTempDir("kit-verify-");
  writeProject(root, { ".ai/project.yml": profileYaml(commands, extra) });
  return root;
}

function loadProfileOf(root) {
  const text = readFileSync(join(root, ".ai", "project.yml"), "utf8");
  const { profile } = parseProfileText(text, ".ai/project.yml");
  if (profile === null) throw new Error("test profile failed to parse");
  return profile;
}

test("pass + fail: statuses, blocked semantics, report contract, exit codes", () => {
  const root = setup({
    "pass-check": [NODE, "-e", "process.exit(0)"],
    "fail-check": [NODE, "-e", "process.exit(7)"],
    "blocked-check": [NODE, "-e", "process.exit(0)"],
  });
  try {
    const { exitCode, report } = runVerify({ root, keepGoing: false, json: false, argv: [], io: silentIO });
    assert.equal(exitCode, 1);
    assert.equal(report.status, "failed");
    assert.equal(report.schema, REPORT_SCHEMA);

    assert.equal(report.checks[0].status, "passed");
    assert.equal(report.checks[0].exitCode, 0);
    assert.equal(report.checks[1].status, "failed");
    assert.equal(report.checks[1].exitCode, 7);
    assert.equal(report.checks[2].status, "blocked");
    assert.equal(report.checks[2].reason !== undefined, true);
    assert.match(report.checks[2].reason, /fail-check/);

    assert.deepEqual(report.summary, { passed: 1, failed: 1, skipped: 0, blocked: 1 });

    // report file contract
    assert.equal(report.commitSha, null, "temp dir is not a git repo");
    assert.match(report.runId, /^\d{8}T\d{6}Z-[0-9a-f]{6}$/);
    assert.equal(typeof Date.parse(report.timestamp), "number");
    assert.deepEqual(report.command, ["kit", "verify"]);

    const expectedFile = join(root, REPORT_DIR, `verify-${report.runId}.json`);
    assert.equal(existsSync(expectedFile), true, "report file written");
    const written = JSON.parse(readFileSync(expectedFile, "utf8"));
    assert.equal(written.schema, "agentic-sdlc/verification-report/1");
    assert.equal(written.status, "failed");
    assert.equal(written.checks.length, 3);
    for (const c of written.checks) {
      assert.ok(["passed", "failed", "skipped", "blocked"].includes(c.status));
      assert.ok(Array.isArray(c.command));
      assert.equal(typeof c.durationMs, "number");
      assert.ok(Array.isArray(c.evidence));
      assert.ok(Array.isArray(c.errors));
    }
    assert.equal(written.checks[2].status, "blocked");
  } finally {
    cleanup(root);
  }
});

test("failed check records evidence (last 30 lines of output)", () => {
  const script = "for (let i = 1; i <= 40; i++) console.log('line ' + i); process.exit(3)";
  const root = setup({ "noisy-check": [NODE, "-e", script] });
  try {
    const { report } = runVerify({ root, keepGoing: false, json: false, argv: [], io: silentIO });
    const check = report.checks[0];
    assert.equal(check.status, "failed");
    assert.equal(check.exitCode, 3);
    assert.equal(check.evidence.length, 30);
    assert.equal(check.evidence[check.evidence.length - 1], "line 40");
    assert.equal(check.evidence[0], "line 11");
  } finally {
    cleanup(root);
  }
});

test("ENOENT executable is skipped with a reason; all-skipped run is blocked (never passed)", () => {
  const root = setup({ "gone-check": ["definitely-not-a-real-cmd-xyz", "--version"] });
  try {
    const { exitCode, report } = runVerify({ root, keepGoing: false, json: false, argv: [], io: silentIO });
    assert.equal(exitCode, 1);
    assert.equal(report.status, "blocked");
    const check = report.checks[0];
    assert.equal(check.status, "skipped");
    assert.match(check.reason, /executable not found: definitely-not-a-real-cmd-xyz/);
    assert.deepEqual(report.summary, { passed: 0, failed: 0, skipped: 1, blocked: 0 });
  } finally {
    cleanup(root);
  }
});

test("timeout fails the check and records the timeout", () => {
  const root = setup({ "slow-check": [NODE, "-e", "setTimeout(() => {}, 5000)"] }, "  timeoutSeconds: 1\n");
  try {
    const { exitCode, report } = runVerify({ root, keepGoing: false, json: false, argv: [], io: silentIO });
    assert.equal(exitCode, 1);
    const check = report.checks[0];
    assert.equal(check.status, "failed");
    assert.equal(check.exitCode, null);
    assert.ok(check.errors.some((e) => /timed out after 1s/.test(e)), JSON.stringify(check.errors));
    assert.ok(check.durationMs >= 900, `durationMs ${check.durationMs} should reflect the 1s timeout`);
  } finally {
    cleanup(root);
  }
});

test("stopOnFailure=false runs subsequent checks; --keep-going overrides stopOnFailure", () => {
  const commands = {
    "fail-check": [NODE, "-e", "process.exit(1)"],
    "next-check": [NODE, "-e", "process.exit(0)"],
  };
  const relaxed = setup(commands, "  stopOnFailure: false\n");
  try {
    const relaxedResult = runVerify({ root: relaxed, keepGoing: false, json: false, argv: [], io: silentIO });
    assert.equal(relaxedResult.report.checks[1].status, "passed");
    assert.equal(relaxedResult.exitCode, 1);
  } finally {
    cleanup(relaxed);
  }
  const strict = setup(commands);
  try {
    const keepGoing = runVerify({ root: strict, keepGoing: true, json: false, argv: [], io: silentIO });
    assert.equal(keepGoing.report.checks[1].status, "passed");
    assert.deepEqual(keepGoing.report.summary, { passed: 1, failed: 1, skipped: 0, blocked: 0 });
    assert.equal(keepGoing.exitCode, 1);
  } finally {
    cleanup(strict);
  }
});

test("--check subset runs only the selected ids; unknown ids exit 2", () => {
  const root = setup({
    "pass-check": [NODE, "-e", "process.exit(0)"],
    "fail-check": [NODE, "-e", "process.exit(9)"],
  });
  try {
    const subset = runVerify({ root, check: ["pass-check"], keepGoing: false, json: false, argv: ["--check", "pass-check"], io: silentIO });
    assert.equal(subset.exitCode, 0);
    assert.equal(subset.report.status, "passed");
    assert.equal(subset.report.checks.length, 1);
    assert.deepEqual(subset.report.command, ["kit", "verify", "--check", "pass-check"]);

    const unknown = runVerify({ root, check: ["nope"], keepGoing: false, json: false, argv: [], io: silentIO });
    assert.equal(unknown.exitCode, 2);
  } finally {
    cleanup(root);
  }
});

test("missing profile exits 3 (blocked: run kit init)", () => {
  const root = makeTempDir("kit-verify-");
  try {
    const { exitCode } = runVerify({ root, keepGoing: false, json: false, argv: [], io: silentIO });
    assert.equal(exitCode, 3);
  } finally {
    cleanup(root);
  }
});

test("invalid profile exits 2 with the collected issues", () => {
  const root = makeTempDir("kit-verify-");
  try {
    writeProject(root, {
      ".ai/project.yml": "version: 1\nproject:\n  name: x\n  mode: bad\nquality:\n  commands:\n    lint: npm run lint\n",
    });
    const { exitCode } = runVerify({ root, keepGoing: false, json: false, argv: [], io: silentIO });
    assert.equal(exitCode, 2);
  } finally {
    cleanup(root);
  }
});

test("empty commands list yields a blocked run (skipped is never passed)", () => {
  const root = makeTempDir("kit-verify-");
  try {
    writeProject(root, {
      ".ai/project.yml": "version: 1\nproject:\n  name: x\n  mode: existing\nquality:\n  timeoutSeconds: 60\n",
    });
    const { exitCode, report } = runVerify({ root, keepGoing: false, json: false, argv: [], io: silentIO });
    assert.equal(exitCode, 1);
    assert.equal(report.status, "blocked");
  } finally {
    cleanup(root);
  }
});

test("runSelectedChecks: absent ids are skipped with a reason", () => {
  const root = setup({ "pass-check": [NODE, "-e", "process.exit(0)"] });
  try {
    const profile = loadProfileOf(root);
    const { checks, summary } = runSelectedChecks(root, profile, ["pass-check", "absent-check"], false);
    assert.equal(checks[0].status, "passed");
    assert.equal(checks[1].status, "skipped");
    assert.match(checks[1].reason, /not configured/);
    assert.equal(summary.skipped, 1);
  } finally {
    cleanup(root);
  }
});

test("report files are written under .ai/reports/verification and do not collide", () => {
  const root = setup({ "pass-check": [NODE, "-e", "process.exit(0)"] });
  try {
    runVerify({ root, keepGoing: false, json: false, argv: [], io: silentIO });
    runVerify({ root, keepGoing: false, json: false, argv: [], io: silentIO });
    const files = readdirSync(join(root, REPORT_DIR)).filter((f) => f.startsWith("verify-"));
    assert.equal(files.length, 2);
    assert.notEqual(files[0], files[1]);
  } finally {
    cleanup(root);
  }
});
