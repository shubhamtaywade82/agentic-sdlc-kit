// packages/cli/src/commands/version.test.ts
import { describe, expect, it } from "vitest";
import { versionCommand } from "./version.js";

describe("versionCommand", () => {
  it("returns the version with exit code 0", () => {
    const r = versionCommand.run({ argv: [], cwd: "/", stdout: () => {}, stderr: () => {} });
    expect(r.exitCode).toBe(0);
    expect(r.message).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
