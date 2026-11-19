/**
 * YAML subset parser tests: accepted syntax, precise rejections with line
 * numbers, and canonical serialization round-trips.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDist } from "./helpers.mjs";

const { parseYaml, serializeProfile, YamlParseError } = loadDist("yaml");

const FULL_PROFILE = `version: 1
project:
  name: example-app
  mode: existing
stack:
  backend:
    language: typescript
    framework: express
  frontend:
    language: typescript
    framework: react
quality:
  timeoutSeconds: 600
  stopOnFailure: true
  commands:
    typecheck:
      - npm
      - run
      - typecheck
    lint:
      - npm
      - run
      - lint
policies:
  tdd: required
  approvals:
    migrations: required
    deployment: not-required
    forcePush: prohibited
  protectedPaths:
    - infra/**
guard:
  protectedPaths:
    - .env
router:
  enabled: true
  main:
    model: claude-sonnet-4-6
  agents:
    coder:
      model: claude-sonnet-4-6
      effort: high
observer:
  enabled: false
`;

test("parses a full profile: nested maps, sequences, bools, ints", () => {
  const v = parseYaml(FULL_PROFILE);
  assert.equal(v.version, 1);
  assert.equal(v.project.name, "example-app");
  assert.equal(v.project.mode, "existing");
  assert.equal(v.stack.backend.framework, "express");
  assert.deepEqual(v.quality.commands.typecheck, ["npm", "run", "typecheck"]);
  assert.equal(v.quality.timeoutSeconds, 600);
  assert.equal(v.quality.stopOnFailure, true);
  assert.equal(v.policies.tdd, "required");
  assert.equal(v.policies.approvals.deployment, "not-required");
  assert.deepEqual(v.policies.protectedPaths, ["infra/**"]);
  assert.equal(v.router.enabled, true);
  assert.equal(v.router.main.model, "claude-sonnet-4-6");
  assert.equal(v.router.agents.coder.effort, "high");
  assert.equal(v.observer.enabled, false);
});

test("bools and ints parse as primitives; quoted scalars stay strings", () => {
  const v = parseYaml("a: true\nb: false\nc: 42\nd: -7\ne: \"true\"\nf: '123'\ng: plain text");
  assert.equal(v.a, true);
  assert.equal(v.b, false);
  assert.equal(v.c, 42);
  assert.equal(v.d, -7);
  assert.equal(v.e, "true");
  assert.equal(v.f, "123");
  assert.equal(v.g, "plain text");
});

test("comments and blank lines are ignored (quote-aware)", () => {
  const v = parseYaml("# leading comment\n\na: value # trailing comment\nb: \"# not a comment\"\nc: 1");
  assert.equal(v.a, "value");
  assert.equal(v.b, "# not a comment");
  assert.equal(v.c, 1);
});

test("quoted scalars: escapes and doubled single quotes", () => {
  const v = parseYaml('a: "line\\nbreak"\nb: \'it\'\'s here\'\nc: ""');
  assert.equal(v.a, "line\nbreak");
  assert.equal(v.b, "it's here");
  assert.equal(v.c, "");
});

function expectReject(text, code, line) {
  let caught;
  try {
    parseYaml(text);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof YamlParseError, `expected YamlParseError for ${JSON.stringify(text)}`);
  assert.equal(caught.code, code, `code mismatch for ${JSON.stringify(text)}: ${caught.message}`);
  assert.equal(caught.line, line, `line mismatch for ${JSON.stringify(text)}: ${caught.message}`);
}

test("rejects tab characters with a line number", () => {
  expectReject("a:\n\tb: 1", "TAB_CHARACTER", 2);
  expectReject("a: value\twithTab", "TAB_CHARACTER", 1);
});

test("rejects flow style", () => {
  expectReject("a: [1, 2]", "FLOW_STYLE", 1);
  expectReject("a: {b: 1}", "FLOW_STYLE", 1);
});

test("rejects anchors and aliases", () => {
  expectReject("a: &anchor value", "ANCHOR", 1);
  expectReject("a: *alias", "ALIAS", 1);
});

test("rejects block scalars", () => {
  expectReject("a: |\n  text", "BLOCK_SCALAR", 1);
  expectReject("a: >-\n  folded", "BLOCK_SCALAR", 1);
});

test("rejects multi-document markers and directives", () => {
  expectReject("a: 1\n---\nb: 2", "MULTI_DOCUMENT", 2);
  expectReject("---\na: 1", "MULTI_DOCUMENT", 1);
  expectReject("%YAML 1.2\n---\na: 1", "DIRECTIVE", 1);
});

test("rejects tags", () => {
  expectReject("a: !!str value", "TAG", 1);
});

test("rejects duplicate keys", () => {
  expectReject("a: 1\na: 2", "DUPLICATE_KEY", 2);
  expectReject("parent:\n  k: 1\n  k: 2", "DUPLICATE_KEY", 3);
});

test("rejects bad indentation jumps and odd indents", () => {
  expectReject("a:\n    b: 1", "BAD_INDENT", 2); // 0 -> 4 under key at 0
  expectReject("a:\n  b: 1\n   c: 2", "BAD_INDENT", 3);
  expectReject("a: 1\n b: 2", "BAD_INDENT", 2); // odd indent
  expectReject("  a: 1", "BAD_INDENT", 1); // document starts indented
});

test("rejects non-map top level and misplaced sequences", () => {
  expectReject("- a\n- b", "NOT_A_MAP", 1);
  expectReject("a: 1\n- b", "UNEXPECTED_SEQUENCE", 2);
});

test("rejects malformed entries and scalars", () => {
  expectReject("a b: 1", "INVALID_ENTRY", 1);
  expectReject('a: "unterminated', "INVALID_SCALAR", 1);
  expectReject("a: 'unterminated", "INVALID_SCALAR", 1);
  expectReject("a: \"bad \\q escape\"", "INVALID_ESCAPE", 1);
  expectReject("a:", "EMPTY_VALUE", 1);
  expectReject("a:\n  -", "EXPECTED_SEQUENCE_ITEM", 2);
  expectReject("a:\n  - ", "EXPECTED_SEQUENCE_ITEM", 2);
});

test("serializeProfile produces canonical 2-space YAML and round-trips", () => {
  const obj = parseYaml(FULL_PROFILE);
  const text = serializeProfile(obj);
  assert.equal(
    text,
    `version: 1
project:
  name: example-app
  mode: existing
stack:
  backend:
    language: typescript
    framework: express
  frontend:
    language: typescript
    framework: react
quality:
  timeoutSeconds: 600
  stopOnFailure: true
  commands:
    typecheck:
      - npm
      - run
      - typecheck
    lint:
      - npm
      - run
      - lint
policies:
  tdd: required
  approvals:
    migrations: required
    deployment: not-required
    forcePush: prohibited
  protectedPaths:
    - infra/**
guard:
  protectedPaths:
    - .env
router:
  enabled: true
  main:
    model: claude-sonnet-4-6
  agents:
    coder:
      model: claude-sonnet-4-6
      effort: high
observer:
  enabled: false
`
  );
  assert.deepEqual(parseYaml(text), obj);
});

test("round-trip preserves strings that look like bools/ints and special characters", () => {
  const obj = {
    version: 1,
    looksBool: "true",
    looksInt: "123",
    colon: "a: b",
    empty: "",
    quoted: 'she said "hi"',
    newline: "line1\nline2",
    negative: -3,
    flag: false,
    list: ["npm", "run", "with space", "- --flag", "123"],
  };
  const roundTripped = parseYaml(serializeProfile(obj));
  assert.deepEqual(roundTripped, obj);
});

test("serializeProfile quotes strings that would parse as other types", () => {
  const text = serializeProfile({ a: "true", b: "42", c: "x: y" });
  assert.match(text, /a: "true"/);
  assert.match(text, /b: "42"/);
  assert.match(text, /c: "x: y"/);
});

test("serializeProfile refuses keys outside the subset charset", () => {
  assert.throws(() => serializeProfile({ "bad key": 1 }), TypeError);
});

test("serializeProfile refuses empty maps and sequences (not representable)", () => {
  assert.throws(() => serializeProfile({ a: {} }), TypeError);
  assert.throws(() => serializeProfile({ a: [] }), TypeError);
});
