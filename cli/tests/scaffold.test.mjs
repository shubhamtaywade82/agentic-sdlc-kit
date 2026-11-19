/**
 * scaffold tests: spec/plan/adr/profile generation, auto-increment,
 * overwrite refusal, and "scaffolded spec passes validate-spec".
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir, cleanup, writeProject, silentIO, loadDist } from "./helpers.mjs";

const { runScaffold, nextAdrNumber } = loadDist("scaffold");
const { runValidateSpec } = loadDist("validateSpec");
const { runValidatePlan } = loadDist("validatePlan");

function scaffold(root, kind, slug, opts = {}) {
  return runScaffold(root, { kind, slug, force: opts.force === true, json: false, io: silentIO });
}

test("scaffold spec creates a file that passes validate-spec unchanged", () => {
  const root = makeTempDir("kit-scaffold-");
  try {
    const { exitCode, report } = scaffold(root, "spec", "user-auth");
    assert.equal(exitCode, 0);
    assert.equal(report.path, "docs/specifications/features/user-auth.md");
    assert.equal(existsSync(join(root, report.path)), true);

    const validation = runValidateSpec(root, report.path, { json: false, io: silentIO });
    assert.equal(validation.exitCode, 0, `scaffolded spec must ship valid: ${JSON.stringify(validation.report)}`);
    assert.equal(validation.report.status, "passed");
    assert.ok(validation.report.summary.acceptanceCriteria >= 1);
  } finally {
    cleanup(root);
  }
});

test("scaffold spec refuses to overwrite without --force (exit 1), --force wins", () => {
  const root = makeTempDir("kit-scaffold-");
  try {
    assert.equal(scaffold(root, "spec", "x-feature").exitCode, 0);
    const refused = scaffold(root, "spec", "x-feature");
    assert.equal(refused.exitCode, 1);
    assert.equal(refused.report.status, "exists");

    const forced = scaffold(root, "spec", "x-feature", { force: true });
    assert.equal(forced.exitCode, 0);
  } finally {
    cleanup(root);
  }
});

test("scaffold plan references ./missing-spec.md and validates with SPEC_NOT_FOUND", () => {
  const root = makeTempDir("kit-scaffold-");
  try {
    const { exitCode, report } = scaffold(root, "plan", "my-feature");
    assert.equal(exitCode, 0);
    assert.equal(report.path, "docs/plans/my-feature.md");

    const content = readFileSync(join(root, report.path), "utf8");
    assert.match(content, /spec: \.\/missing-spec\.md/);
    assert.match(content, /### TASK-001:/);
    assert.match(content, /- Depends: none/);
    assert.match(content, /Acceptance:/);
    assert.match(content, /Verification:/);
    assert.match(content, /Design review/);
    assert.match(content, /Test review/);

    // the plan template intentionally fails validation until a real spec is linked
    const validation = runValidatePlan(root, report.path, { json: false, io: silentIO });
    assert.equal(validation.exitCode, 1);
    assert.ok(validation.report.errors.some((e) => e.code === "SPEC_NOT_FOUND"));
  } finally {
    cleanup(root);
  }
});

test("scaffold adr auto-increments its number", () => {
  const root = makeTempDir("kit-scaffold-");
  try {
    assert.equal(nextAdrNumber(root), 1);
    const first = scaffold(root, "adr", "use-postgres");
    assert.equal(first.exitCode, 0);
    assert.equal(first.report.path, "docs/architecture/adr/001-use-postgres.md");

    assert.equal(nextAdrNumber(root), 2);
    const second = scaffold(root, "adr", "add-caching");
    assert.equal(second.report.path, "docs/architecture/adr/002-add-caching.md");

    // existing ADRs found even when scaffolded by hand
    writeProject(root, { "docs/architecture/adr/010-hand-written.md": "# ADR-010\n" });
    assert.equal(nextAdrNumber(root), 11);

    const content = readFileSync(join(root, "docs/architecture/adr/001-use-postgres.md"), "utf8");
    assert.match(content, /## Context/);
    assert.match(content, /## Decision/);
    assert.match(content, /## Consequences/);
  } finally {
    cleanup(root);
  }
});

test("scaffold adr refuses to overwrite without --force", () => {
  const root = makeTempDir("kit-scaffold-");
  try {
    scaffold(root, "adr", "same-slug");
    const refused = scaffold(root, "adr", "same-slug");
    assert.equal(refused.exitCode, 1);
  } finally {
    cleanup(root);
  }
});

test("scaffold profile creates .ai/project.yml and the directory skeleton", () => {
  const root = makeTempDir("kit-scaffold-");
  try {
    writeProject(root, { "package.json": JSON.stringify({ name: "prof-app", version: "1.0.0", scripts: { test: "node --test" } }) });
    const created = scaffold(root, "profile", undefined);
    assert.equal(created.exitCode, 0);
    assert.equal(existsSync(join(root, ".ai", "project.yml")), true);
    assert.equal(existsSync(join(root, ".ai", "state", ".gitkeep")), true);
    assert.equal(existsSync(join(root, "docs", "specifications", "features", ".gitkeep")), true);
    assert.match(readFileSync(join(root, ".ai", "project.yml"), "utf8"), /name: prof-app/);

    // second run without --force is refused
    const refused = scaffold(root, "profile", undefined);
    assert.equal(refused.exitCode, 1);

    // --force overwrites
    const forced = scaffold(root, "profile", undefined, { force: true });
    assert.equal(forced.exitCode, 0);
  } finally {
    cleanup(root);
  }
});

test("scaffold rejects invalid kinds and slugs (exit 2)", () => {
  const root = makeTempDir("kit-scaffold-");
  try {
    assert.equal(scaffold(root, "diagram", "x").exitCode, 2);
    assert.equal(scaffold(root, "spec", "../escape").exitCode, 2);
    assert.equal(scaffold(root, "spec", "a/b").exitCode, 2);
    assert.equal(scaffold(root, "spec", undefined).exitCode, 2);
    assert.equal(scaffold(root, "profile", "extra-slug").exitCode, 2);
  } finally {
    cleanup(root);
  }
});
