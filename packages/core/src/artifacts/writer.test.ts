// packages/core/src/artifacts/writer.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveArtifactPath, writeJson, writeMarkdown } from "./writer.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kit-writer-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("resolveArtifactPath", () => {
  it("resolves a path inside .ai-kit/", () => {
    const r = resolveArtifactPath(tmp, ".ai-kit", "state/run.json");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(path.resolve(tmp, ".ai-kit/state/run.json"));
  });

  it("resolves a path inside docs/", () => {
    const r = resolveArtifactPath(tmp, "docs", "specs/FEATURE-001/SPEC.md");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(path.resolve(tmp, "docs/specs/FEATURE-001/SPEC.md"));
  });

  it("REJECTS an unknown root", () => {
    // @ts-expect-error — testing runtime rejection of unknown roots
    const r = resolveArtifactPath(tmp, "src", "index.ts");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ARTIFACT_WRITE_DENIED");
  });

  it("REJECTS a relative path with ..", () => {
    const r = resolveArtifactPath(tmp, ".ai-kit", "../etc/passwd");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ARTIFACT_WRITE_DENIED");
  });

  it("REJECTS a deeply nested escape attempt", () => {
    const r = resolveArtifactPath(tmp, "docs", "ok/../../../etc/passwd");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ARTIFACT_WRITE_DENIED");
  });

  it("accepts a leading ./ in the relative path", () => {
    const r = resolveArtifactPath(tmp, ".ai-kit", "./state/run.json");
    expect(r.ok).toBe(true);
  });
});

describe("writeJson", () => {
  it("writes a JSON file under .ai-kit/", async () => {
    const r = await writeJson(tmp, ".ai-kit", "state/run.json", { ok: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const content = await fs.readFile(r.value, "utf8");
      expect(JSON.parse(content)).toEqual({ ok: true });
    }
  });

  it("creates parent directories", async () => {
    const r = await writeJson(tmp, "docs", "plans/FEATURE-001/plan.json", { tasks: [] });
    expect(r.ok).toBe(true);
  });

  it("rejects a path escape with ARTIFACT_WRITE_DENIED", async () => {
    const r = await writeJson(tmp, ".ai-kit", "../escape.json", { x: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ARTIFACT_WRITE_DENIED");
  });
});

describe("writeMarkdown", () => {
  it("writes a Markdown file under docs/", async () => {
    const r = await writeMarkdown(tmp, "docs", "specs/FEATURE-001/SPEC.md", "# Spec\n");
    expect(r.ok).toBe(true);
    if (r.ok) {
      const content = await fs.readFile(r.value, "utf8");
      expect(content).toBe("# Spec\n");
    }
  });

  it("rejects a path escape", async () => {
    const r = await writeMarkdown(tmp, "docs", "../README.md", "# hi");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ARTIFACT_WRITE_DENIED");
  });
});
