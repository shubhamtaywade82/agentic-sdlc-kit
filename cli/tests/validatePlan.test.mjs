/**
 * validate-plan tests: one fixture/error class per test, including cycle
 * detection and exit codes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { makeTempDir, cleanup, writeProject, silentIO, loadDist } from "./helpers.mjs";

const { runValidatePlan } = loadDist("validatePlan");

const ROOT = process.cwd();

function validateIn(root, fileArg = "plan.md") {
  return runValidatePlan(root, fileArg, { json: false, io: silentIO });
}

const SPEC = `---
kind: spec
mode: feature
status: draft
---

# Example spec

## Problem

Problem text.

## Scope

### In scope

- One

### Out of scope

- Two

## Acceptance Criteria

- GIVEN x WHEN y THEN z

## Non-functional Requirements

- Fast.

## Open Questions

- Why?
`;

function planDoc({ spec = "./spec.md", tasks = undefined, checkpoints = "- Design review of the approach\n- Test review of the scenarios\n" } = {}) {
  const defaultTasks = `### TASK-001: First task

- Depends: none

Acceptance:
- Something verifiable

Verification:
- A command or check

### TASK-002: Second task

- Depends: TASK-001

Acceptance:
- Something else verifiable

Verification:
- Another check
`;
  return `---
kind: plan
mode: feature
spec: ${spec}
---

# Plan: Example

## Approach

Do the work in two steps, described here.

## Tasks

${tasks !== undefined ? tasks : defaultTasks}
## Checkpoints

${checkpoints}`;
}

test("good plan fixture passes", () => {
  const { exitCode, report } = runValidatePlan(ROOT, "tests/fixtures/plan-good.md", { json: false, io: silentIO });
  assert.equal(exitCode, 0);
  assert.equal(report.status, "passed");
  assert.equal(report.summary.tasks.total, 2);
  assert.equal(report.summary.tasks.valid, 2);
});

test("missing plan file exits 2", () => {
  const { exitCode } = runValidatePlan(ROOT, "tests/fixtures/nope.md", { json: false, io: silentIO });
  assert.equal(exitCode, 2);
});

test("SPEC_NOT_FOUND when the referenced spec does not exist", () => {
  const root = makeTempDir("kit-plan-");
  try {
    writeProject(root, { "plan.md": planDoc({ spec: "./missing-spec.md" }), "spec.md": SPEC });
    const { exitCode, report } = validateIn(root);
    assert.equal(exitCode, 1);
    const err = report.errors.find((e) => e.code === "SPEC_NOT_FOUND");
    assert.ok(err !== undefined);
    assert.equal(typeof err.line, "number");
  } finally {
    cleanup(root);
  }
});

test("SPEC_KIND_MISMATCH when the referenced file is not a spec", () => {
  const root = makeTempDir("kit-plan-");
  try {
    // plan.md references other-plan.md, which has kind: plan
    writeProject(root, {
      "plan.md": planDoc({ spec: "./other-plan.md" }),
      "other-plan.md": planDoc({ spec: "./spec.md" }),
      "spec.md": SPEC,
    });
    const { exitCode, report } = validateIn(root);
    assert.equal(exitCode, 1);
    assert.ok(report.errors.some((e) => e.code === "SPEC_KIND_MISMATCH"));
  } finally {
    cleanup(root);
  }
});

test("SPEC_NOT_FOUND falls back to the project root when not in the plan dir", () => {
  const root = makeTempDir("kit-plan-");
  try {
    // plan references ./spec.md from docs/plans/, but the spec sits at root
    writeProject(root, {
      "docs/plans/plan.md": planDoc({ spec: "spec.md" }), // relative to root, not plan dir
      "spec.md": SPEC,
    });
    const { exitCode } = validateIn(root, join("docs", "plans", "plan.md"));
    assert.equal(exitCode, 0);
  } finally {
    cleanup(root);
  }
});

test("DEPENDENCY_NOT_FOUND for unknown task references", () => {
  const root = makeTempDir("kit-plan-");
  try {
    const tasks = `### TASK-001: Only task

- Depends: TASK-999

Acceptance:
- Something

Verification:
- Check
`;
    writeProject(root, { "plan.md": planDoc({ tasks }), "spec.md": SPEC });
    const { exitCode, report } = validateIn(root);
    assert.equal(exitCode, 1);
    const err = report.errors.find((e) => e.code === "DEPENDENCY_NOT_FOUND");
    assert.ok(err !== undefined);
    assert.equal(err.task, "TASK-001");
    assert.match(err.message, /TASK-999/);
  } finally {
    cleanup(root);
  }
});

test("CYCLE_DETECTED reports the cycle path", () => {
  const root = makeTempDir("kit-plan-");
  try {
    const tasks = `### TASK-001: First

- Depends: TASK-002

Acceptance:
- Something

Verification:
- Check

### TASK-002: Second

- Depends: TASK-001

Acceptance:
- Something

Verification:
- Check
`;
    writeProject(root, { "plan.md": planDoc({ tasks }), "spec.md": SPEC });
    const { exitCode, report } = validateIn(root);
    assert.equal(exitCode, 1);
    const err = report.errors.find((e) => e.code === "CYCLE_DETECTED");
    assert.ok(err !== undefined);
    assert.match(err.message, /TASK-001 -> TASK-002 -> TASK-001|TASK-002 -> TASK-001 -> TASK-002/);
  } finally {
    cleanup(root);
  }
});

test("self-dependency is reported as a cycle", () => {
  const root = makeTempDir("kit-plan-");
  try {
    const tasks = `### TASK-001: Loop

- Depends: TASK-001

Acceptance:
- Something

Verification:
- Check
`;
    writeProject(root, { "plan.md": planDoc({ tasks }), "spec.md": SPEC });
    const { exitCode, report } = validateIn(root);
    assert.equal(exitCode, 1);
    assert.ok(report.errors.some((e) => e.code === "CYCLE_DETECTED" && e.message.includes("TASK-001 -> TASK-001")));
  } finally {
    cleanup(root);
  }
});

test("DUPLICATE_TASK_ID for repeated ids", () => {
  const root = makeTempDir("kit-plan-");
  try {
    const tasks = `### TASK-001: First

- Depends: none

Acceptance:
- Something

Verification:
- Check

### TASK-001: Again

- Depends: none

Acceptance:
- Something

Verification:
- Check
`;
    writeProject(root, { "plan.md": planDoc({ tasks }), "spec.md": SPEC });
    const { exitCode, report } = validateIn(root);
    assert.equal(exitCode, 1);
    assert.ok(report.errors.some((e) => e.code === "DUPLICATE_TASK_ID"));
  } finally {
    cleanup(root);
  }
});

test("MISSING_ACCEPTANCE and MISSING_VERIFICATION", () => {
  const root = makeTempDir("kit-plan-");
  try {
    const tasks = `### TASK-001: No lists

- Depends: none

Acceptance:

Verification:
`;
    writeProject(root, { "plan.md": planDoc({ tasks }), "spec.md": SPEC });
    const { exitCode, report } = validateIn(root);
    assert.equal(exitCode, 1);
    assert.ok(report.errors.some((e) => e.code === "MISSING_ACCEPTANCE"));
    assert.ok(report.errors.some((e) => e.code === "MISSING_VERIFICATION"));
  } finally {
    cleanup(root);
  }
});

test("MISSING_DEPENDS when the Depends line is absent", () => {
  const root = makeTempDir("kit-plan-");
  try {
    const tasks = `### TASK-001: No depends

Acceptance:
- Something

Verification:
- Check
`;
    writeProject(root, { "plan.md": planDoc({ tasks }), "spec.md": SPEC });
    const { exitCode, report } = validateIn(root);
    assert.equal(exitCode, 1);
    assert.ok(report.errors.some((e) => e.code === "MISSING_DEPENDS"));
  } finally {
    cleanup(root);
  }
});

test("missing Checkpoints section is MISSING_SECTION", () => {
  const root = makeTempDir("kit-plan-");
  try {
    writeProject(root, {
      "plan.md": planDoc({ checkpoints: undefined }).split("## Checkpoints")[0],
      "spec.md": SPEC,
    });
    const { exitCode, report } = validateIn(root);
    assert.equal(exitCode, 1);
    assert.ok(report.errors.some((e) => e.code === "MISSING_SECTION" && e.message.includes("Checkpoints")));
  } finally {
    cleanup(root);
  }
});

test("Checkpoints without a test review item is MISSING_CHECKPOINT", () => {
  const root = makeTempDir("kit-plan-");
  try {
    writeProject(root, {
      "plan.md": planDoc({ checkpoints: "- Design review of everything\n" }),
      "spec.md": SPEC,
    });
    const { exitCode, report } = validateIn(root);
    assert.equal(exitCode, 1);
    assert.ok(report.errors.some((e) => e.code === "MISSING_CHECKPOINT"));
  } finally {
    cleanup(root);
  }
});

test("TASK_TOO_LARGE is a warning (>15 acceptance+verification items)", () => {
  const root = makeTempDir("kit-plan-");
  try {
    const items = Array.from({ length: 9 }, (_, i) => `- Acceptance item ${i + 1}`).join("\n");
    const verifications = Array.from({ length: 8 }, (_, i) => `- Verification step ${i + 1}`).join("\n");
    const tasks = `### TASK-001: Huge task

- Depends: none

Acceptance:
${items}

Verification:
${verifications}
`;
    writeProject(root, { "plan.md": planDoc({ tasks }), "spec.md": SPEC });
    const { exitCode, report } = validateIn(root);
    assert.equal(exitCode, 0, "warnings must not fail validation");
    assert.ok(report.warnings.some((w) => w.code === "TASK_TOO_LARGE" && w.task === "TASK-001"));
  } finally {
    cleanup(root);
  }
});

test("empty Approach is EMPTY_SECTION", () => {
  const root = makeTempDir("kit-plan-");
  try {
    const doc = planDoc().replace(
      "## Approach\n\nDo the work in two steps, described here.\n",
      "## Approach\n"
    );
    writeProject(root, { "plan.md": doc, "spec.md": SPEC });
    const { exitCode, report } = validateIn(root);
    assert.equal(exitCode, 1);
    assert.ok(report.errors.some((e) => e.code === "EMPTY_SECTION" && e.message.includes("Approach")));
  } finally {
    cleanup(root);
  }
});

test("H3 under Tasks that is not a TASK heading is INVALID_TASK_HEADING", () => {
  const root = makeTempDir("kit-plan-");
  try {
    const tasks = `### Notes

Some notes.

### TASK-001: Real task

- Depends: none

Acceptance:
- Something

Verification:
- Check
`;
    writeProject(root, { "plan.md": planDoc({ tasks }), "spec.md": SPEC });
    const { exitCode, report } = validateIn(root);
    assert.equal(exitCode, 1);
    assert.ok(report.errors.some((e) => e.code === "INVALID_TASK_HEADING"));
  } finally {
    cleanup(root);
  }
});
