// packages/core/src/planning/planning.test.ts
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ImplementationPlan } from "@agentic-sdlc-kit/contracts";
import {
  createAdr,
  loadPlan,
  topologicalSort,
  validatePlan,
} from "./index.js";

const samplePlan: ImplementationPlan = {
  featureId: "FEATURE-001",
  tasks: [
    {
      id: "TASK-001",
      description: "Setup schema and models",
      acceptanceCriteria: ["User schema defined"],
      verification: { command: ["pnpm", "test"], expectedStatus: "passed" },
      dependencies: [],
      likelyFiles: ["src/models/user.ts"],
      estimatedScope: "s",
      risk: "low",
    },
    {
      id: "TASK-002",
      description: "Implement service login logic",
      acceptanceCriteria: ["Valid token emitted"],
      verification: { command: ["pnpm", "test"], expectedStatus: "passed" },
      dependencies: ["TASK-001"],
      likelyFiles: ["src/services/auth.ts"],
      estimatedScope: "m",
      risk: "medium",
    },
    {
      id: "TASK-003",
      description: "Implement HTTP endpoint",
      acceptanceCriteria: ["Endpoint returns 200 on login"],
      verification: { command: ["pnpm", "test"], expectedStatus: "passed" },
      dependencies: ["TASK-002"],
      likelyFiles: ["src/routes/auth.ts"],
      estimatedScope: "s",
      risk: "low",
    },
  ],
  edges: [
    { from: "TASK-001", to: "TASK-002", reason: "Service depends on models" },
    { from: "TASK-002", to: "TASK-003", reason: "Endpoint calls service" },
  ],
  verticalSlices: [["TASK-001", "TASK-002", "TASK-003"]],
};

describe("planning module", () => {
  it("topologically sorts a valid dependency DAG", () => {
    const res = topologicalSort(samplePlan.tasks, samplePlan.edges);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.executionOrder).toEqual(["TASK-001", "TASK-002", "TASK-003"]);
      expect(res.value.roots).toEqual(["TASK-001"]);
      expect(res.value.leaves).toEqual(["TASK-003"]);
    }
  });

  it("detects dependency cycles in tasks", () => {
    const cyclicTasks = [
      { ...samplePlan.tasks[0]!, id: "TASK-001", dependencies: ["TASK-002"] },
      { ...samplePlan.tasks[1]!, id: "TASK-002", dependencies: ["TASK-001"] },
    ];
    const res = topologicalSort(cyclicTasks, []);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain("Dependency cycle detected");
    }
  });

  it("validates a complete plan", () => {
    const res = validatePlan(samplePlan);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.analysis.executionOrder).toHaveLength(3);
    }
  });

  it("fails when an edge references non-existent task", () => {
    const badPlan: ImplementationPlan = {
      ...samplePlan,
      edges: [{ from: "TASK-001", to: "TASK-999", reason: "Bad edge" }],
    };
    const res = validatePlan(badPlan);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain("references non-existent");
    }
  });

  it("creates and formats an ADR correctly", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kit-adr-test-"));
    try {
      const adrPath = await createAdr(tmp, {
        number: 1,
        title: "Use PostgreSQL",
        context: "Need relational store with ACID transactions",
        decision: "Adopt PostgreSQL 16",
        consequences: ["Supported by standard ORMs", "Requires migration tooling"],
      });
      const content = await fs.readFile(adrPath, "utf8");
      expect(content).toContain("# ADR-0001: Use PostgreSQL");
      expect(content).toContain("## Decision");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("loads a plan from JSON file", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kit-plan-test-"));
    try {
      const planFile = path.join(tmp, "plan.json");
      await fs.writeFile(planFile, JSON.stringify(samplePlan, null, 2), "utf8");
      const res = await loadPlan(planFile);
      expect(res.ok).toBe(true);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
