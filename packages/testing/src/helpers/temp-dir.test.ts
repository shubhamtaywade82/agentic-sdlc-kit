// packages/testing/src/helpers/temp-dir.test.ts
import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { makeTempDir } from "./temp-dir.js";

describe("makeTempDir", () => {
  it("creates a temp dir that exists", async () => {
    const t = await makeTempDir();
    const stat = await fs.stat(t.path);
    expect(stat.isDirectory()).toBe(true);
    await t.cleanup();
  });
  it("cleanup removes the dir", async () => {
    const t = await makeTempDir();
    await t.cleanup();
    await expect(fs.stat(t.path)).rejects.toThrow();
  });
});
