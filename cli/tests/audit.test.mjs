/**
 * audit tests: planted tokens produce truncated findings, allowlist
 * suppression, skip rules, dependency-audit parsing.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTempDir, cleanup, writeProject, silentIO, loadDist } from "./helpers.mjs";

const { runAudit, collectFiles, scanPaths, loadAllowlist, parseNpmAudit } = loadDist("audit");

const AWS_KEY = "AKIA" + "ABCDEFGHIJKLMNOP"; // real-shaped, no placeholder words

function audit(root, dependencyAudit = false) {
  return runAudit(root, { json: false, dependencyAudit, io: silentIO });
}

test("planted token is a finding with a truncated preview (exit 1)", () => {
  const root = makeTempDir("kit-audit-");
  try {
    writeProject(root, { "notes.txt": `const key = "${AWS_KEY}";\n` });
    const { exitCode, report } = audit(root);
    assert.equal(exitCode, 1);
    assert.equal(report.status, "failed");
    assert.equal(report.summary.findings, 1);
    const f = report.findings[0];
    assert.equal(f.file, "notes.txt");
    assert.equal(f.line, 1);
    assert.equal(f.patternId, "aws-access-key-id");
    assert.equal(f.preview, "AKIAABCD…");
    assert.equal(f.preview.includes("EFGHIJKLMNOP"), false);
  } finally {
    cleanup(root);
  }
});

test("allowlist suppresses findings whose match contains the substring", () => {
  const root = makeTempDir("kit-audit-");
  try {
    writeProject(root, {
      "notes.txt": `const key = "${AWS_KEY}";\n`,
      ".ai/audit-allowlist.txt": "# known documentation example\n" + AWS_KEY + "\n",
    });
    const { exitCode, report } = audit(root);
    assert.equal(exitCode, 0);
    assert.equal(report.summary.findings, 0);
    assert.ok(report.summary.allowlisted >= 1);
  } finally {
    cleanup(root);
  }
});

test("node_modules and other kit-skip directories are not scanned", () => {
  const root = makeTempDir("kit-audit-");
  try {
    writeProject(root, {
      "node_modules/evil/index.js": `const key = "${AWS_KEY}";\n`,
      "vendor/evil.rb": `key = "${AWS_KEY}"\n`,
      "dist/bundle.js": `const key = "${AWS_KEY}";\n`,
      "coverage/lcov.info": `${AWS_KEY}\n`,
      ".ai/reports/verification/verify-x.json": JSON.stringify({ evidence: [AWS_KEY] }),
    });
    const { files } = collectFiles(root);
    assert.deepEqual(files.filter((f) => !f.startsWith(".ai/audit-allowlist")), []);
    const { exitCode, report } = audit(root);
    assert.equal(exitCode, 0);
    assert.equal(report.summary.findings, 0);
  } finally {
    cleanup(root);
  }
});

test("binary files (NUL byte) are skipped", () => {
  const root = makeTempDir("kit-audit-");
  try {
    writeProject(root, { "blob.bin": Buffer.from(`const key = "${AWS_KEY}";\n\0more\0`) });
    const { exitCode, report } = audit(root);
    assert.equal(exitCode, 0);
    assert.equal(report.summary.filesScanned, 0);
    assert.equal(report.summary.findings, 0);
  } finally {
    cleanup(root);
  }
});

test("scanPaths reports file:line with pattern id", () => {
  const root = makeTempDir("kit-audit-");
  try {
    writeProject(root, { "a.txt": "clean\n" + AWS_KEY + "\n" });
    const { findings, filesScanned } = scanPaths(root, ["a.txt"], []);
    assert.equal(filesScanned, 1);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, "a.txt");
    assert.equal(findings[0].line, 2);
  } finally {
    cleanup(root);
  }
});

test("loadAllowlist parses entries, comments and blanks", () => {
  const root = makeTempDir("kit-audit-");
  try {
    writeProject(root, {
      ".ai/audit-allowlist.txt": "# comment\n\n  spaced-entry  \nAKIA1234\n",
    });
    const allow = loadAllowlist(root);
    assert.equal(allow.missing, false);
    assert.deepEqual(allow.entries, ["spaced-entry", "AKIA1234"]);
  } finally {
    cleanup(root);
  }
});

test("missing allowlist is not an error", () => {
  const root = makeTempDir("kit-audit-");
  try {
    const allow = loadAllowlist(root);
    assert.equal(allow.missing, true);
    assert.deepEqual(allow.entries, []);
  } finally {
    cleanup(root);
  }
});

test("parseNpmAudit counts severities from npm audit --json output", () => {
  const payload = JSON.stringify({
    auditReportVersion: 2,
    metadata: {
      vulnerabilities: { info: 1, low: 2, moderate: 3, high: 4, critical: 5 },
    },
  });
  const counts = parseNpmAudit(payload);
  assert.deepEqual(counts, { critical: 5, high: 4, moderate: 3, low: 2, info: 1 });
  assert.equal(parseNpmAudit("not json"), null);
  assert.equal(parseNpmAudit(JSON.stringify({ no: "metadata" })), null);
});

test("dependency audit is skipped (info) without a lockfile pair", () => {
  const root = makeTempDir("kit-audit-");
  try {
    writeProject(root, {
      "package.json": JSON.stringify({ name: "x", version: "1.0.0" }),
      "src/ok.txt": "nothing to see\n",
    });
    const { exitCode, report } = audit(root, true);
    assert.equal(exitCode, 0);
    assert.equal(report.dependencyAudit.ran, false);
    assert.equal(report.dependencyAudit.status, "info");
  } finally {
    cleanup(root);
  }
});

test("--json output shape", () => {
  const root = makeTempDir("kit-audit-");
  try {
    writeProject(root, { "notes.txt": `const key = "${AWS_KEY}";\n` });
    const lines = [];
    const io = { out: (l) => lines.push(l), err: () => {} };
    const { exitCode } = runAudit(root, { json: true, dependencyAudit: false, io });
    assert.equal(exitCode, 1);
    const parsed = JSON.parse(lines.join("\n"));
    assert.equal(parsed.status, "failed");
    assert.deepEqual(Object.keys(parsed.summary).sort(), ["allowlisted", "filesScanned", "findings", "vulnerabilities"]);
    assert.equal(parsed.findings[0].patternId, "aws-access-key-id");
    assert.equal(parsed.findings[0].preview, "AKIAABCD…");
  } finally {
    cleanup(root);
  }
});
