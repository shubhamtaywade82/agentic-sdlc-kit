// packages/cli/src/commands/inspect.test.ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inspectCommand } from "./inspect.js";
import type { CommandContext } from "./types.js";

const FIXTURE_ROOT = path.resolve(
  new URL("../../../../fixtures/fixture-node-fullstack", import.meta.url).pathname,
);

const makeCtx = (argv: string[]): CommandContext & { out: string[]; err: string[] } => {
  const out: string[] = [];
  const err: string[] = [];
  return {
    argv,
    cwd: FIXTURE_ROOT,
    stdout: (s) => void out.push(s),
    stderr: (s) => void err.push(s),
    out,
    err,
  };
};

describe("inspectCommand", () => {
  it("shows help when --help is passed", async () => {
    const ctx = makeCtx(["--help"]);
    const r = await inspectCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    expect(ctx.out[0]).toContain("Usage: kit inspect");
  });

  it("inspects fixture repository and prints summary", async () => {
    const ctx = makeCtx([]);
    const r = await inspectCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    const text = ctx.out[0] ?? "";
    expect(text).toContain("Repository:");
    expect(text).toContain("node-typescript");
    expect(text).toContain("node:test");
  });

  it("emits valid JSON when --json flag is passed", async () => {
    const ctx = makeCtx(["--json"]);
    const r = await inspectCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(ctx.out[0] ?? "{}");
    expect(parsed.detectedStacks).toContain("node-typescript");
    expect(parsed.testFrameworks).toContain("node:test");
  });

  it("fails when target path does not exist", async () => {
    const ctx = makeCtx(["/non/existent/repo/path/xyz"]);
    const r = await inspectCommand.run(ctx);
    expect(r.exitCode).toBe(1);
    expect(ctx.err[0]).toContain("kit inspect: error:");
  });
});
