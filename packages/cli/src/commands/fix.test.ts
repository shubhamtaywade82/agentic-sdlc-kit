// packages/cli/src/commands/fix.test.ts
import { describe, expect, it } from "vitest";
import { fixCommand } from "./fix.js";
import type { CommandContext } from "./types.js";

const makeCtx = (
  argv: string[],
  cwd: string,
): CommandContext & { out: string[]; err: string[] } => {
  const out: string[] = [];
  const err: string[] = [];
  return {
    argv,
    cwd,
    stdout: (s) => void out.push(s),
    stderr: (s) => void err.push(s),
    out,
    err,
  };
};

describe("fixCommand", () => {
  it("shows help when --help is passed", async () => {
    const ctx = makeCtx(["--help"], "/");
    const r = await fixCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    expect(ctx.out[0]).toContain("Usage: kit fix");
  });

  it("fails if issue ID is missing", async () => {
    const ctx = makeCtx([], "/");
    const r = await fixCommand.run(ctx);
    expect(r.exitCode).toBe(1);
    expect(ctx.err[0]).toContain("missing required issue identifier");
  });
});
