// packages/contracts/src/project/project-profile.test.ts
import { describe, expect, it } from "vitest";
import {
  PROJECT_PROFILE_SCHEMA_VERSION,
  ProjectProfileSchema,
  makeProfile,
} from "./project-profile.js";

const validProfile = {
  schemaVersion: PROJECT_PROFILE_SCHEMA_VERSION,
  name: "fixture-node-fullstack",
  stack: ["node-typescript", "react"],
  commands: {
    test: [["pnpm", "test"]],
    lint: [["pnpm", "lint"]],
    typecheck: [["pnpm", "typecheck"]],
    build: [["pnpm", "build"]],
  },
} as const;

describe("ProjectProfileSchema", () => {
  it("accepts a valid profile", () => {
    const parsed = ProjectProfileSchema.safeParse(validProfile);
    expect(parsed.success).toBe(true);
  });

  it("rejects wrong schemaVersion", () => {
    const r = ProjectProfileSchema.safeParse({ ...validProfile, schemaVersion: 2 });
    expect(r.success).toBe(false);
  });

  it("rejects missing schemaVersion", () => {
    const { schemaVersion: _omit, ...rest } = validProfile;
    void _omit;
    const r = ProjectProfileSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("rejects empty name", () => {
    const r = ProjectProfileSchema.safeParse({ ...validProfile, name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects empty stack", () => {
    const r = ProjectProfileSchema.safeParse({ ...validProfile, stack: [] });
    expect(r.success).toBe(false);
  });

  it("rejects mixed-case stack entry", () => {
    const r = ProjectProfileSchema.safeParse({ ...validProfile, stack: ["Node-TypeScript"] });
    expect(r.success).toBe(false);
  });

  it("rejects a string command (shell string is a contract violation)", () => {
    const r = ProjectProfileSchema.safeParse({
      ...validProfile,
      commands: { test: "pnpm test" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects an empty command array", () => {
    const r = ProjectProfileSchema.safeParse({
      ...validProfile,
      commands: { test: [[]] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown top-level keys (.strict())", () => {
    const r = ProjectProfileSchema.safeParse({ ...validProfile, extra: true });
    expect(r.success).toBe(false);
  });

  it("rejects unknown commands keys (.strict())", () => {
    const r = ProjectProfileSchema.safeParse({
      ...validProfile,
      commands: { ...validProfile.commands, deploy: [["echo", "hi"]] },
    });
    expect(r.success).toBe(false);
  });
});

describe("makeProfile", () => {
  it("injects the current schemaVersion and validates", () => {
    const { schemaVersion: _omit, ...rest } = validProfile;
    void _omit;
    const p = makeProfile(rest);
    expect(p.schemaVersion).toBe(PROJECT_PROFILE_SCHEMA_VERSION);
    expect(p.name).toBe(validProfile.name);
  });

  it("throws on invalid input (programmer-error path)", () => {
    const { schemaVersion: _omit, ...rest } = validProfile;
    void _omit;
    expect(() => makeProfile({ ...rest, stack: [] })).toThrow();
  });
});
