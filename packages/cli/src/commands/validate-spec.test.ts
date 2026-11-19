// packages/cli/src/commands/validate-spec.test.ts
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scaffoldSpecification } from "@agentic-sdlc-kit/core";
import { validateSpecCommand } from "./validate-spec.js";
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

describe("validateSpecCommand", () => {
  it("shows help when --help is passed", async () => {
    const ctx = makeCtx(["--help"], "/");
    const r = await validateSpecCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    expect(ctx.out[0]).toContain("Usage: kit validate-spec");
  });

  it("validates a scaffolded specification successfully", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kit-cli-spec-"));
    try {
      const featureDir = await scaffoldSpecification({
        id: "FEATURE-001",
        title: "Test Feature",
        targetDir: tmp,
      });

      const ctx = makeCtx([featureDir], tmp);
      const r = await validateSpecCommand.run(ctx);
      expect(r.exitCode).toBe(0);
      expect(ctx.out[0]).toContain("kit validate-spec: PASS");
      expect(ctx.out[0]).toContain("FEATURE-001");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("fails when specification file is invalid or missing", async () => {
    const ctx = makeCtx(["/nonexistent/spec/path"], "/");
    const r = await validateSpecCommand.run(ctx);
    expect(r.exitCode).toBe(1);
    expect(ctx.err[0]).toContain("kit validate-spec: FAIL");
  });
});
