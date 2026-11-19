// packages/cli/src/application/dispatcher.test.ts
import { describe, expect, it } from "vitest";
import { createDispatcher } from "./dispatcher.js";
import type { CommandContext } from "../commands/types.js";

const makeCtx = (argv: ReadonlyArray<string>): CommandContext & { out: string[]; err: string[] } => {
  const out: string[] = [];
  const err: string[] = [];
  return {
    argv,
    cwd: "/tmp",
    stdout: (s) => void out.push(s),
    stderr: (s) => void err.push(s),
    out,
    err,
  };
};

describe("dispatcher", () => {
  it("handles --version", async () => {
    const { dispatch } = createDispatcher();
    const ctx = makeCtx(["--version"]);
    const r = await dispatch(ctx);
    expect(r.exitCode).toBe(0);
    expect(r.message).toBe("0.1.0");
    expect(r.command).toBe("version");
  });

  it("handles -v", async () => {
    const { dispatch } = createDispatcher();
    const ctx = makeCtx(["-v"]);
    const r = await dispatch(ctx);
    expect(r.exitCode).toBe(0);
    expect(r.message).toBe("0.1.0");
  });

  it("handles --help", async () => {
    const { dispatch } = createDispatcher();
    const ctx = makeCtx(["--help"]);
    const r = await dispatch(ctx);
    expect(r.exitCode).toBe(0);
    expect(r.command).toBe("help");
    // help text mentions the registered commands
    expect(ctx.out[0]).toContain("kit — Agentic SDLC Kit");
    expect(ctx.out[0]).toContain("version");
    expect(ctx.out[0]).toContain("doctor");
    expect(ctx.out[0]).toContain("inspect");
    expect(ctx.out[0]).toContain("init");
    expect(ctx.out[0]).toContain("validate-spec");
    expect(ctx.out[0]).toContain("validate-plan");
    expect(ctx.out[0]).toContain("verify");
    expect(ctx.out[0]).toContain("feature");
    expect(ctx.out[0]).toContain("new");
    expect(ctx.out[0]).toContain("fix");
    expect(ctx.out[0]).toContain("install");
    expect(ctx.out[0]).toContain("memory");
    expect(ctx.out[0]).toContain("evolve");
    expect(ctx.out[0]).toContain("help");
  });

  it("handles no args as help", async () => {
    const { dispatch } = createDispatcher();
    const ctx = makeCtx([]);
    const r = await dispatch(ctx);
    expect(r.exitCode).toBe(0);
    expect(r.command).toBe("help");
  });

  it("dispatches the doctor command", async () => {
    const { dispatch } = createDispatcher();
    const ctx = makeCtx(["doctor"]);
    const r = await dispatch(ctx);
    expect(r.exitCode).toBe(0);
    expect(r.command).toBe("doctor");
    expect(ctx.out[0]).toContain("kit 0.1.0");
    expect(ctx.out[0]).toContain("node");
  });

  it("rejects unknown commands with exit code 1", async () => {
    const { dispatch } = createDispatcher();
    const ctx = makeCtx(["bogus"]);
    const r = await dispatch(ctx);
    expect(r.exitCode).toBe(1);
    expect(r.command).toBe("bogus");
    expect(ctx.err[0]).toContain("unknown command 'bogus'");
  });
});
