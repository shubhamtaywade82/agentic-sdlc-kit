// packages/cli/src/commands/clse.test.ts
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installCommand } from "./install.js";
import { memoryCommand } from "./memory.js";
import { evolveCommand } from "./evolve.js";
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

describe("installCommand (M15)", () => {
  it("installs kit configuration in target directory", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kit-cli-install-"));
    try {
      const ctx = makeCtx(["--profile", "full-sdlc", "--stack", "node-typescript"], tmp);
      const r = await installCommand.run(ctx);
      expect(r.exitCode).toBe(0);
      expect(ctx.out[0]).toContain("kit install: SUCCESS");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("memoryCommand (M29)", () => {
  it("searches hierarchical memory", async () => {
    const ctx = makeCtx(["Monorepo"], "/");
    const r = await memoryCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    expect(ctx.out[0]).toContain("MEM-BASE-001");
    expect(ctx.out[0]).toContain("Modular Monorepo Invariant");
  });
});

describe("evolveCommand (M31-M33)", () => {
  it("runs evolution lab benchmarks and emits metrics", async () => {
    const ctx = makeCtx(["--dry-run"], "/");
    const r = await evolveCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    expect(ctx.out[0]).toContain("Evolution Lab:      COMPLETED");
    expect(ctx.out[0]).toContain("Held-Out Gain:      +20.0%");
  });
});
