/**
 * Secret-pattern tests: each canonical pattern matches a real-shaped sample,
 * placeholders are ignored, previews are truncated.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDist } from "./helpers.mjs";

const { scanLine, isPlaceholder, SECRET_PATTERNS } = loadDist("secrets");

function ids(line) {
  return scanLine(line, 1).map((f) => f.patternId);
}

test("all nine canonical patterns are defined", () => {
  assert.deepEqual(
    SECRET_PATTERNS.map((p) => p.id),
    [
      "aws-access-key-id",
      "private-key-block",
      "github-token",
      "gitlab-token",
      "slack-token",
      "stripe-key",
      "google-api-key",
      "openai-key",
      "generic-assignment",
    ]
  );
});

test("aws-access-key-id matches a real-shaped key", () => {
  assert.deepEqual(ids("aws_key = " + "AKIA" + "ABCDEFGHIJKLMNOP"), ["aws-access-key-id"]);
});

test("private-key-block matches a key header", () => {
  assert.deepEqual(ids("-----BEGIN RSA PRIVATE KEY-----"), ["private-key-block"]);
});

test("github-token matches", () => {
  assert.deepEqual(ids("token: " + "ghp_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij"), ["github-token"]);
});

test("gitlab-token matches", () => {
  assert.deepEqual(ids("glpat-" + "01234567890123456789"), ["gitlab-token"]);
});

test("slack-token matches", () => {
  assert.deepEqual(ids("xoxb-" + "0123456789abcdef"), ["slack-token"]);
});

test("stripe-key matches and is not double-reported as openai-key", () => {
  const found = ids("key = " + "sk_live_" + "abcdefghijklmnopqrstuvwxyz0123");
  assert.deepEqual(found, ["stripe-key"]);
});

test("google-api-key matches exactly 35 trailing chars", () => {
  assert.deepEqual(ids("key: " + "AIza" + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi"), ["google-api-key"]);
});

test("openai-key matches sk- tokens", () => {
  assert.deepEqual(ids("sk-" + "abcdefghij0123456789"), ["openai-key"]);
});

test("generic-assignment matches password/api key assignments", () => {
  assert.deepEqual(ids('password = "supersecretvalue12345"'), ["generic-assignment"]);
  assert.deepEqual(ids("api_key: 'abcdefghij0123456789'"), ["generic-assignment"]);
  assert.deepEqual(ids('auth_token="abcdefghijklmnopqrstuvwx"'), ["generic-assignment"]);
});

test("placeholder values are ignored (aws example key)", () => {
  // the canonical AWS documentation example contains "example"
  assert.deepEqual(ids("AKIAIOSFODNN7EXAMPLE"), []);
});

test("placeholder values are ignored (github x's)", () => {
  assert.deepEqual(ids("ghp_" + "x".repeat(36)), []);
});

test("placeholder values are ignored (private key example header)", () => {
  assert.deepEqual(ids("-----BEGIN EXAMPLE PRIVATE KEY-----"), []);
});

test("placeholder values are ignored (${VAR} assignment)", () => {
  assert.deepEqual(ids('password = "${SERVICE_PASSWORD}"'), []);
});

test("placeholder values are ignored (your/example/dummy values)", () => {
  assert.deepEqual(ids('password = "your-password-here-1234"'), []);
  assert.deepEqual(ids('api_key = "example-key-0123456789"'), []);
  assert.deepEqual(ids('api_key = "dummy-key-0123456789"'), []);
});

test("isPlaceholder heuristics", () => {
  assert.equal(isPlaceholder("changeme1234567890"), true);
  assert.equal(isPlaceholder("PLACEHOLDER"), true);
  assert.equal(isPlaceholder("redacted-abc"), true);
  assert.equal(isPlaceholder("xxxxx"), true);
  assert.equal(isPlaceholder("<api-key>"), true);
  assert.equal(isPlaceholder("{{SECRET_KEY}}"), true);
  assert.equal(isPlaceholder("${ENV_KEY}"), true);
  assert.equal(isPlaceholder("YourApiKeyHere"), true);
  assert.equal(isPlaceholder("real-looking-secret-9f8e7d"), false);
});

test("preview is the first 8 characters plus an ellipsis — never the full secret", () => {
  const findings = scanLine('password = "supersecretvalue12345"', 1);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].preview, 'password'.slice(0, 8) + "…");
  assert.equal(findings[0].preview.length, 9);
  assert.equal(findings[0].preview.includes("supersecretvalue"), false);

  const aws = scanLine("AKIA" + "ABCDEFGHIJKLMNOP", 1);
  assert.equal(aws[0].preview, "AKIAABCD…");
  assert.equal(aws[0].preview.includes("EFGHIJKLMNOP"), false);
});

test("multiple matches on one line are all reported", () => {
  const line = "AKIA" + "ABCDEFGHIJKLMNOP and " + "ghp_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
  const found = ids(line);
  assert.deepEqual(found.sort(), ["aws-access-key-id", "github-token"]);
});
