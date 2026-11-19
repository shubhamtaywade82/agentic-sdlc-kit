/**
 * validate-spec tests: passing fixtures, one test per error class, exit codes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { makeTempDir, cleanup, writeProject, silentIO, loadDist } from "./helpers.mjs";

const { runValidateSpec } = loadDist("validateSpec");

const ROOT = process.cwd();
const GOOD = join(ROOT, "tests", "fixtures", "spec-good.md");

function validate(fileArg) {
  return runValidateSpec(ROOT, fileArg, { json: false, io: silentIO });
}

function specDoc({ status = "approved", sections = "" } = {}) {
  return `---
kind: spec
mode: feature
status: ${status}
---

# Example feature

## Problem

There is a real problem here worth solving.

## Scope

### In scope

- First thing

### Out of scope

- Excluded thing

## Acceptance Criteria

- GIVEN a user WHEN they act THEN it works

${sections}`;
}

test("good fixture passes with acceptance criteria counted", () => {
  const { exitCode, report } = validate("tests/fixtures/spec-good.md");
  assert.equal(exitCode, 0);
  assert.equal(report.status, "passed");
  assert.equal(report.summary.errors, 0);
  assert.equal(report.summary.acceptanceCriteria, 3);
});

test("missing file exits 2", () => {
  const { exitCode } = validate("tests/fixtures/does-not-exist.md");
  assert.equal(exitCode, 2);
});

test("missing section (Scope) is MISSING_SECTION", () => {
  const root = makeTempDir("kit-spec-");
  try {
    writeProject(root, { "spec.md": specDoc().replace("## Scope", "## Skope") });
    const { exitCode, report } = runValidateSpec(root, "spec.md", { json: false, io: silentIO });
    assert.equal(exitCode, 1);
    assert.ok(report.errors.some((e) => e.code === "MISSING_SECTION" && e.message.includes("Scope")));
  } finally {
    cleanup(root);
  }
});

test("missing acceptance criteria is NO_ACCEPTANCE_CRITERIA", () => {
  const root = makeTempDir("kit-spec-");
  try {
    const content = specDoc().replace("- GIVEN a user WHEN they act THEN it works", "- The button is blue");
    writeProject(root, { "spec.md": content });
    const { exitCode, report } = runValidateSpec(root, "spec.md", { json: false, io: silentIO });
    assert.equal(exitCode, 1);
    const err = report.errors.find((e) => e.code === "NO_ACCEPTANCE_CRITERIA");
    assert.ok(err !== undefined);
    assert.equal(typeof err.line, "number");
  } finally {
    cleanup(root);
  }
});

test("bad frontmatter (wrong kind) is BAD_FRONTMATTER", () => {
  const root = makeTempDir("kit-spec-");
  try {
    writeProject(root, { "spec.md": specDoc().replace("kind: spec", "kind: plan") });
    const { exitCode, report } = runValidateSpec(root, "spec.md", { json: false, io: silentIO });
    assert.equal(exitCode, 1);
    assert.ok(report.errors.some((e) => e.code === "BAD_FRONTMATTER" && e.message.includes("spec")));
  } finally {
    cleanup(root);
  }
});

test("invalid status is BAD_FRONTMATTER", () => {
  const root = makeTempDir("kit-spec-");
  try {
    writeProject(root, { "spec.md": specDoc({ status: "final" }) });
    const { exitCode, report } = runValidateSpec(root, "spec.md", { json: false, io: silentIO });
    assert.equal(exitCode, 1);
    assert.ok(report.errors.some((e) => e.code === "BAD_FRONTMATTER" && e.message.includes("status")));
  } finally {
    cleanup(root);
  }
});

test("missing H1 is MISSING_H1", () => {
  const root = makeTempDir("kit-spec-");
  try {
    writeProject(root, { "spec.md": specDoc().replace("# Example feature", "## Not a title") });
    const { exitCode, report } = runValidateSpec(root, "spec.md", { json: false, io: silentIO });
    assert.equal(exitCode, 1);
    assert.ok(report.errors.some((e) => e.code === "MISSING_H1"));
  } finally {
    cleanup(root);
  }
});

test("scope without 'Out of scope' H3 is MISSING_SUBSECTION", () => {
  const root = makeTempDir("kit-spec-");
  try {
    writeProject(root, { "spec.md": specDoc().replace("### Out of scope", "### Not in scope") });
    const { exitCode, report } = runValidateSpec(root, "spec.md", { json: false, io: silentIO });
    assert.equal(exitCode, 1);
    assert.ok(report.errors.some((e) => e.code === "MISSING_SUBSECTION" && e.message.includes("Out of scope")));
  } finally {
    cleanup(root);
  }
});

test("empty 'In scope' list is EMPTY_SUBSECTION", () => {
  const root = makeTempDir("kit-spec-");
  try {
    writeProject(root, { "spec.md": specDoc().replace("- First thing", "") });
    const { exitCode, report } = runValidateSpec(root, "spec.md", { json: false, io: silentIO });
    assert.equal(exitCode, 1);
    assert.ok(report.errors.some((e) => e.code === "EMPTY_SUBSECTION"));
  } finally {
    cleanup(root);
  }
});

test("approved spec without NFR fails; draft spec without NFR only warns", () => {
  const approved = makeTempDir("kit-spec-");
  const draft = makeTempDir("kit-spec-");
  try {
    // content without the NFR section
    const content = (status) =>
      `---
kind: spec
mode: feature
status: ${status}
---

# Example

## Problem

Real problem.

## Scope

### In scope

- One

### Out of scope

- Two

## Acceptance Criteria

- GIVEN x WHEN y THEN z

## Open Questions

- Why?
`;

    writeProject(approved, { "spec.md": content("approved") });
    const a = runValidateSpec(approved, "spec.md", { json: false, io: silentIO });
    assert.equal(a.exitCode, 1);
    assert.ok(a.report.errors.some((e) => e.code === "MISSING_SECTION" && e.message.includes("Non-functional")));

    writeProject(draft, { "spec.md": content("draft") });
    const d = runValidateSpec(draft, "spec.md", { json: false, io: silentIO });
    assert.equal(d.exitCode, 0);
    assert.equal(d.report.status, "passed");
    assert.ok(d.report.warnings.some((w) => w.code === "MISSING_SECTION" && w.message.includes("Non-functional")));
  } finally {
    cleanup(approved);
    cleanup(draft);
  }
});

test("NFR 'None' is reported as a warning-level note, not an error", () => {
  const root = makeTempDir("kit-spec-");
  try {
    const content = `---
kind: spec
mode: fix
status: approved
---

# Example

## Problem

Real problem.

## Scope

### In scope

- One

### Out of scope

- Two

## Acceptance Criteria

- The fix must handle the error case

## Non-functional Requirements

None

## Open Questions

- Why?
`;
    writeProject(root, { "spec.md": content });
    const { exitCode, report } = runValidateSpec(root, "spec.md", { json: false, io: silentIO });
    assert.equal(exitCode, 0);
    assert.ok(report.warnings.some((w) => w.code === "NFR_EMPTY"));
  } finally {
    cleanup(root);
  }
});

test("empty Open Questions is informational (warning), not an error", () => {
  const root = makeTempDir("kit-spec-");
  try {
    const content = `---
kind: spec
mode: app
status: approved
---

# Example

## Problem

Real problem.

## Scope

### In scope

- One

### Out of scope

- Two

## Acceptance Criteria

- The app should start

## Non-functional Requirements

- Fast enough.

## Open Questions

`;
    writeProject(root, { "spec.md": content });
    const { exitCode, report } = runValidateSpec(root, "spec.md", { json: false, io: silentIO });
    assert.equal(exitCode, 0);
    assert.ok(report.warnings.some((w) => w.code === "OPEN_QUESTIONS_EMPTY"));
  } finally {
    cleanup(root);
  }
});

test("--json output shape", () => {
  const root = makeTempDir("kit-spec-");
  try {
    const lines = [];
    const io = { out: (l) => lines.push(l), err: () => {} };
    writeProject(root, { "spec.md": specDoc().replace("## Scope", "## Skope") });
    const { exitCode } = runValidateSpec(root, "spec.md", { json: true, io });
    assert.equal(exitCode, 1);
    const parsed = JSON.parse(lines.join("\n"));
    assert.equal(parsed.status, "failed");
    assert.equal(typeof parsed.summary.errors, "number");
    assert.ok(Array.isArray(parsed.errors));
    assert.ok(parsed.errors.every((e) => typeof e.file === "string" && typeof e.code === "string"));
  } finally {
    cleanup(root);
  }
});
