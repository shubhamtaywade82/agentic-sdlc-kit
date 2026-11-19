// packages/core/src/discovery/repository-scanner.test.ts
import { describe, expect, it } from "vitest";
import { StubRepositoryScanner } from "./repository-scanner.js";

describe("StubRepositoryScanner", () => {
  it("returns NOT_IMPLEMENTED", async () => {
    const s = new StubRepositoryScanner();
    const r = await s.scan("/some/root");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("NOT_IMPLEMENTED");
      expect(r.error.details).toMatchObject({ milestone: "M2" });
    }
  });
});
