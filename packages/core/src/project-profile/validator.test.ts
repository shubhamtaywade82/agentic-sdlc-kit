// packages/core/src/project-profile/validator.test.ts
import { describe, expect, it } from "vitest";
import { validateProfile } from "./validator.js";
import type { ProjectProfile } from "@agentic-sdlc-kit/contracts";

const valid: ProjectProfile = {
  schemaVersion: 1,
  name: "x",
  stack: ["node-typescript"],
  commands: { test: [["pnpm", "test"]] },
};

describe("validateProfile", () => {
  it("returns ok for a valid profile", () => {
    const r = validateProfile(valid);
    expect(r.ok).toBe(true);
  });

  it("returns PROFILE_INVALID for wrong schemaVersion", () => {
    const r = validateProfile({ ...valid, schemaVersion: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("PROFILE_INVALID");
      expect(r.error.details).toBeDefined();
    }
  });

  it("returns PROFILE_INVALID for a string command", () => {
    const r = validateProfile({ ...valid, commands: { test: "pnpm test" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROFILE_INVALID");
  });

  it("returns PROFILE_INVALID for empty stack", () => {
    const r = validateProfile({ ...valid, stack: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROFILE_INVALID");
  });

  it("returns PROFILE_INVALID for completely malformed input", () => {
    const r = validateProfile({ not: "a profile" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROFILE_INVALID");
  });

  it("never throws — always returns a Result", () => {
    expect(() => validateProfile(null)).not.toThrow();
    expect(() => validateProfile(undefined)).not.toThrow();
    expect(() => validateProfile("string")).not.toThrow();
    expect(() => validateProfile(42)).not.toThrow();
  });
});
