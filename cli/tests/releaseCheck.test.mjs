/**
 * release-check tests in temporary git repositories.
 * All tests are skipped when git is not available.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { makeTempDir, cleanup, writeProject, silentIO, loadDist, hasGit, initGitRepo, gitCommitAll } from "./helpers.mjs";

const { runReleaseCheck } = loadDist("releaseCheck");

const hasGitAvailable = hasGit();

function makeRepo({ version = "1.2.3", changelog = "## [1.2.3] - 2026-01-01\n\n- Fix thing\n", reportStatus = "passed", reportAgeMs = 60_000, commit = true, extra = {} } = {}) {
  const root = makeTempDir("kit-rel-");
  const files = { ...extra };
  if (version !== null) files["package.json"] = JSON.stringify({ name: "rel-app", version });
  if (changelog !== null) files["CHANGELOG.md"] = changelog;
  files[".ai/reports/verification/verify-fixture.json"] = JSON.stringify({
    schema: "agentic-sdlc/verification-report/1",
    runId: "fixture",
    timestamp: new Date(Date.now() - reportAgeMs).toISOString(),
    status: reportStatus,
    summary: { passed: 1, failed: 0, skipped: 0, blocked: 0 },
    checks: [],
  });
  writeProject(root, files);
  if (hasGitAvailable) {
    initGitRepo(root);
    if (commit) gitCommitAll(root, "init");
  }
  return root;
}

function release(root, opts = {}) {
  return runReleaseCheck(root, {
    allowDirty: false,
    allowMain: false,
    dependencyAudit: false,
    ...opts,
    json: false,
    io: silentIO,
  });
}

test("clean repo with fresh passing report is ready (exit 0)", { skip: !hasGitAvailable }, () => {
  const root = makeRepo();
  try {
    // on main: allow-main for this base case
    const { exitCode, report } = release(root, { allowMain: true });
    assert.equal(exitCode, 0);
    assert.equal(report.status, "passed");
    assert.equal(report.version, "1.2.3");
    const ids = report.checks.map((c) => c.id);
    assert.deepEqual(ids, ["changelog", "verification", "clean-tree", "branch", "tag", "audit"]);
    assert.ok(report.checks.every((c) => c.status === "passed"));
  } finally {
    cleanup(root);
  }
});

test("existing tag v<version> fails the tag check (exit 1)", { skip: !hasGitAvailable }, () => {
  const root = makeRepo();
  try {
    spawnSync("git", ["tag", "v1.2.3"], { cwd: root });
    const { exitCode, report } = release(root, { allowMain: true });
    assert.equal(exitCode, 1);
    const tag = report.checks.find((c) => c.id === "tag");
    assert.equal(tag.status, "failed");
    assert.match(tag.detail, /already exists/);
  } finally {
    cleanup(root);
  }
});

test("dirty tree fails unless --allow-dirty", { skip: !hasGitAvailable }, () => {
  const root = makeRepo();
  try {
    writeProject(root, { "dirty.txt": "changes\n" });
    const strict = release(root, { allowMain: true });
    assert.equal(strict.exitCode, 1);
    assert.equal(strict.report.checks.find((c) => c.id === "clean-tree").status, "failed");

    const lenient = release(root, { allowMain: true, allowDirty: true });
    assert.equal(lenient.exitCode, 0);
    const clean = lenient.report.checks.find((c) => c.id === "clean-tree");
    assert.equal(clean.status, "passed");
    assert.match(clean.detail, /--allow-dirty/);
  } finally {
    cleanup(root);
  }
});

test("stale verification report (>7 days) fails the verification check", { skip: !hasGitAvailable }, () => {
  const root = makeRepo({ reportAgeMs: 8 * 24 * 60 * 60 * 1000 });
  try {
    const { exitCode, report } = release(root, { allowMain: true });
    assert.equal(exitCode, 1);
    const verification = report.checks.find((c) => c.id === "verification");
    assert.equal(verification.status, "failed");
    assert.match(verification.detail, /day/);
  } finally {
    cleanup(root);
  }
});

test("failed verification report fails the check", { skip: !hasGitAvailable }, () => {
  const root = makeRepo({ reportStatus: "failed" });
  try {
    const { exitCode, report } = release(root, { allowMain: true });
    assert.equal(exitCode, 1);
    const verification = report.checks.find((c) => c.id === "verification");
    assert.equal(verification.status, "failed");
    assert.match(verification.detail, /failed/);
  } finally {
    cleanup(root);
  }
});

test("no version anywhere exits 3", { skip: !hasGitAvailable }, () => {
  const root = makeRepo({ version: null, changelog: null });
  try {
    const { exitCode } = release(root, { allowMain: true });
    assert.equal(exitCode, 3);
  } finally {
    cleanup(root);
  }
});

test("version falls back to the CHANGELOG heading when package.json has none", { skip: !hasGitAvailable }, () => {
  const root = makeRepo({ version: null, changelog: "# Changelog\n\n## [3.4.5] - 2026-02-02\n\n- Things\n" });
  try {
    const { exitCode, report } = release(root, { allowMain: true });
    assert.equal(exitCode, 0);
    assert.equal(report.version, "3.4.5");
  } finally {
    cleanup(root);
  }
});

test("--version overrides discovery and the changelog must mention it", { skip: !hasGitAvailable }, () => {
  const root = makeRepo({ version: "1.2.3", changelog: "## [1.2.3]\n" });
  try {
    const mismatch = release(root, { allowMain: true, version: "9.9.9" });
    assert.equal(mismatch.exitCode, 1);
    const changelog = mismatch.report.checks.find((c) => c.id === "changelog");
    assert.equal(changelog.status, "failed");

    const good = release(root, { allowMain: true, version: "1.2.3" });
    assert.equal(good.exitCode, 0);
  } finally {
    cleanup(root);
  }
});

test("main branch fails without --allow-main", { skip: !hasGitAvailable }, () => {
  const root = makeRepo();
  try {
    const { exitCode, report } = release(root); // no allowMain
    assert.equal(exitCode, 1);
    const branch = report.checks.find((c) => c.id === "branch");
    assert.equal(branch.status, "failed");
  } finally {
    cleanup(root);
  }
});

test("secret finding fails the audit check", { skip: !hasGitAvailable }, () => {
  const root = makeRepo({ extra: { "src/config.ts": 'const key = "' + "AKIA" + 'ABCDEFGHIJKLMNOP";\n' } });
  try {
    const { exitCode, report } = release(root, { allowMain: true });
    assert.equal(exitCode, 1);
    const auditCheck = report.checks.find((c) => c.id === "audit");
    assert.equal(auditCheck.status, "failed");
    assert.match(auditCheck.detail, /AKIAABCD…/);
  } finally {
    cleanup(root);
  }
});

test("not a git repository exits 3", { skip: !hasGitAvailable }, () => {
  const root = makeTempDir("kit-rel-");
  try {
    const { exitCode } = release(root, { allowMain: true });
    assert.equal(exitCode, 3);
  } finally {
    cleanup(root);
  }
});

test("--json output shape", { skip: !hasGitAvailable }, () => {
  const root = makeRepo();
  try {
    const lines = [];
    const io = { out: (l) => lines.push(l), err: () => {} };
    const { exitCode } = runReleaseCheck(root, {
      allowMain: true,
      allowDirty: false,
      dependencyAudit: false,
      json: true,
      io,
    });
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(lines.join("\n"));
    assert.equal(parsed.status, "passed");
    assert.equal(parsed.version, "1.2.3");
    assert.ok(Array.isArray(parsed.checks));
    assert.ok(parsed.checks.every((c) => typeof c.id === "string" && typeof c.detail === "string"));
  } finally {
    cleanup(root);
  }
});
