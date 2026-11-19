// packages/testing/src/validators/contracts.test.ts
import { describe, expect, it } from "vitest";
import {
  validateImplementationPlan,
  validatePolicyDecision,
  validateProjectProfile,
  validateRepositoryScan,
  validateVerificationReport,
  validateWorkflowState,
} from "./contracts.js";
import {
  invalidEmptyStack,
  invalidMissingSchemaVersion,
  invalidMixedCaseStack,
  invalidShellStringCommand,
  validProfile,
} from "../fixtures/project-profile.js";
import { nodeFullstackScan } from "../fixtures/repository-scan.js";

describe("validateProjectProfile round-trip", () => {
  it("round-trips a valid profile", () => {
    const p = validateProjectProfile(validProfile);
    expect(p.name).toBe(validProfile.name);
  });
  it("rejects the shell-string-command fixture", () => {
    expect(() => validateProjectProfile(invalidShellStringCommand)).toThrow();
  });
  it("rejects the missing-schemaVersion fixture", () => {
    expect(() => validateProjectProfile(invalidMissingSchemaVersion)).toThrow();
  });
  it("rejects the empty-stack fixture", () => {
    expect(() => validateProjectProfile(invalidEmptyStack)).toThrow();
  });
  it("rejects the mixed-case-stack fixture", () => {
    expect(() => validateProjectProfile(invalidMixedCaseStack)).toThrow();
  });
});

describe("validateRepositoryScan round-trip", () => {
  it("round-trips a valid scan", () => {
    const s = validateRepositoryScan(nodeFullstackScan);
    expect(s.detectedStacks).toEqual(nodeFullstackScan.detectedStacks);
  });
});

describe("validateVerificationReport round-trip", () => {
  it("round-trips a passed report", () => {
    const r = validateVerificationReport({
      schemaVersion: 1,
      runId: "RUN-001",
      status: "passed",
      checks: [{ id: "architecture", status: "passed" }],
    });
    expect(r.status).toBe("passed");
  });
});

describe("validateWorkflowState round-trip", () => {
  it("round-trips a pending state", () => {
    const s = validateWorkflowState({
      runId: "RUN-001",
      mode: "feature",
      status: "pending",
      taskHistory: [],
    });
    expect(s.status).toBe("pending");
  });
});

describe("validateImplementationPlan round-trip", () => {
  it("round-trips a minimal plan", () => {
    const p = validateImplementationPlan({
      featureId: "FEATURE-001",
      tasks: [
        {
          id: "TASK-001",
          description: "do thing",
          acceptanceCriteria: ["it works"],
          verification: { command: ["pnpm", "test"], expectedStatus: "passed" },
          dependencies: [],
          likelyFiles: ["src/x.ts"],
          estimatedScope: "s",
          risk: "low",
        },
      ],
      edges: [],
      verticalSlices: [["TASK-001"]],
    });
    expect(p.tasks.length).toBe(1);
  });
});

describe("validatePolicyDecision round-trip", () => {
  it("round-trips an allow decision", () => {
    const d = validatePolicyDecision({
      action: "file.delete",
      verdict: "allow",
      reason: "ok",
    });
    expect(d.verdict).toBe("allow");
  });
});
