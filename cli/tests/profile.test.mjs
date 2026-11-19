/**
 * Profile schema tests: defaults, strict rejections, error collection.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTempDir, cleanup, writeProject, loadDist } from "./helpers.mjs";

const { parseProfileText, loadProfile, profileFilePath, effectiveProtectedPaths } = loadDist("profile");

const MINIMAL = `version: 1
project:
  name: example-app
  mode: existing
`;

function parse(text) {
  return parseProfileText(text, ".ai/project.yml");
}

test("minimal profile gets all defaults", () => {
  const { profile, issues } = parse(MINIMAL);
  assert.deepEqual(issues, []);
  assert.ok(profile !== null);
  assert.equal(profile.version, 1);
  assert.equal(profile.project.name, "example-app");
  assert.equal(profile.quality.commands.length, 0);
  assert.equal(profile.quality.timeoutSeconds, 600);
  assert.equal(profile.quality.stopOnFailure, true);
  assert.equal(profile.policies.tdd, "optional");
  assert.deepEqual(profile.policies.approvals, { migrations: "required", deployment: "required", forcePush: "prohibited" });
  assert.deepEqual(profile.policies.protectedPaths, []);
  assert.deepEqual(profile.guard.protectedPaths, [
    ".github/workflows/**",
    ".git/**",
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
  ]);
  assert.equal(profile.router.enabled, false);
  assert.equal(profile.observer.enabled, true);
});

test("forcePush accepts only 'prohibited' and defaults to it", () => {
  const ok = parse(
    `${MINIMAL}policies:
  approvals:
    forcePush: prohibited
`
  );
  assert.equal(ok.profile.policies.approvals.forcePush, "prohibited");

  const bad = parse(
    `${MINIMAL}policies:
  approvals:
    forcePush: allowed
`
  );
  assert.equal(bad.profile, null);
  assert.ok(bad.issues.some((i) => i.code === "POLICY_FORCE_PUSH_INVALID"));
});

test("quality.commands string value is rejected with a helpful message", () => {
  const { profile, issues } = parse(
    `${MINIMAL}quality:
  commands:
    lint: npm run lint
`
  );
  assert.equal(profile, null);
  const issue = issues.find((i) => i.code === "QUALITY_COMMAND_INVALID");
  assert.ok(issue !== undefined, "expected QUALITY_COMMAND_INVALID");
  assert.match(issue.message, /must be an array of strings/);
  assert.match(issue.message, /- npm/);
  assert.equal(issue.line, 7); // the "lint: npm run lint" line
});

test("quality.commands entries must be non-empty string arrays", () => {
  const { issues } = parse(
    `${MINIMAL}quality:
  commands:
    empty-part:
      - npm
      - ""
`
  );
  assert.ok(issues.some((i) => i.code === "QUALITY_COMMAND_INVALID"));
});

test("unknown top-level key is an error with a line number", () => {
  const { issues } = parse(`${MINIMAL}unknown_thing: 1\n`);
  const issue = issues.find((i) => i.code === "UNKNOWN_KEY");
  assert.ok(issue !== undefined);
  assert.match(issue.message, /unknown_thing/);
  assert.equal(issue.line, 5); // the "unknown_thing: 1" line
});

test("unknown nested keys are errors", () => {
  const { issues } = parse(
    `${MINIMAL}policies:
  tddExtra: required
`
  );
  assert.ok(issues.some((i) => i.code === "UNKNOWN_KEY" && i.message.includes("policies.tddExtra")));
});

test("version must be exactly 1", () => {
  assert.ok(parse("version: 2\nproject:\n  name: x\n  mode: existing\n").issues.some((i) => i.code === "VERSION_INVALID"));
  assert.ok(parse("project:\n  name: x\n  mode: existing\n").issues.some((i) => i.code === "VERSION_REQUIRED"));
});

test("project.mode must be existing or greenfield", () => {
  const { issues } = parse("version: 1\nproject:\n  name: x\n  mode: sometimes\n");
  assert.ok(issues.some((i) => i.code === "PROJECT_MODE_INVALID"));
});

test("all schema errors are collected together", () => {
  const { issues } = parse(
    `version: 3
project:
  name: x
  mode: wrong
extra_key: true
`
  );
  const codes = issues.map((i) => i.code).sort();
  assert.deepEqual(codes, ["PROJECT_MODE_INVALID", "UNKNOWN_KEY", "VERSION_INVALID"]);
  assert.equal(issues.length, 3);
});

test("router agents validate model and effort", () => {
  const bad = parse(
    `${MINIMAL}router:
  enabled: true
  agents:
    coder:
      model: some-model
      effort: extreme
`
  );
  assert.ok(bad.issues.some((i) => i.code === "TYPE_ERROR" && i.message.includes("effort")));
});

test("effectiveProtectedPaths unions policies and guard (dedup, policies first)", () => {
  const { profile } = parse(
    `${MINIMAL}policies:
  protectedPaths:
    - .env
    - secrets/**
guard:
  protectedPaths:
    - .env
    - "*.pem"
`
  );
  assert.ok(profile !== null);
  assert.deepEqual(effectiveProtectedPaths(profile), [".env", "secrets/**", "*.pem"]);
});

test("loadProfile: missing file, valid file, invalid file", () => {
  const root = makeTempDir("kit-profile-");
  try {
    const missing = loadProfile(root);
    assert.equal(missing.missing, true);
    assert.equal(missing.profile, null);

    writeProject(root, { ".ai/project.yml": MINIMAL });
    const loaded = loadProfile(root);
    assert.equal(loaded.missing, false);
    assert.equal(loaded.profile.project.name, "example-app");
    assert.equal(profileFilePath(root).endsWith(joinSep(".ai", "project.yml")), true);

    writeProject(root, { ".ai/project.yml": "version: 1\nproject:\n  name: x\n  mode: bad\n" });
    const invalid = loadProfile(root);
    assert.equal(invalid.profile, null);
    assert.ok(invalid.issues.length >= 1);
  } finally {
    cleanup(root);
  }
});

function joinSep(a, b) {
  return `${a}/${b}`;
}
