// packages/core/src/workflows/engine.test.ts
import { describe, expect, it } from "vitest";
import {
  canTransition,
  createWorkflowState,
  isTerminal,
  transition,
} from "./engine.js";

const FIXED_TIME = "2026-01-01T00:00:00.000Z";
const fixedClock = () => FIXED_TIME;

describe("createWorkflowState", () => {
  it("creates a pending workflow state", () => {
    const s = createWorkflowState("RUN-001", "feature");
    expect(s.runId).toBe("RUN-001");
    expect(s.mode).toBe("feature");
    expect(s.status).toBe("pending");
    expect(s.taskHistory).toEqual([]);
    expect(s.startedAt).toBeUndefined();
  });
});

describe("canTransition", () => {
  const cases: ReadonlyArray<{
    from: ReturnType<typeof createWorkflowState>["status"];
    t: Parameters<typeof canTransition>[1];
    expected: boolean;
  }> = [
    { from: "pending", t: "start", expected: true },
    { from: "pending", t: "block", expected: false },
    { from: "in_progress", t: "block", expected: true },
    { from: "in_progress", t: "complete", expected: true },
    { from: "in_progress", t: "fail", expected: true },
    { from: "blocked", t: "resume", expected: true },
    { from: "blocked", t: "fail", expected: true },
    { from: "blocked", t: "start", expected: false },
    { from: "completed", t: "start", expected: false },
    { from: "completed", t: "fail", expected: false },
    { from: "failed", t: "start", expected: false },
    { from: "failed", t: "complete", expected: false },
  ];
  for (const c of cases) {
    it(`${c.from} --${c.t}--> ${c.expected ? "allowed" : "rejected"}`, () => {
      expect(canTransition(c.from, c.t)).toBe(c.expected);
    });
  }
});

describe("transition", () => {
  it("start moves pending to in_progress and stamps startedAt", () => {
    const s = createWorkflowState("RUN-001", "feature");
    const r = transition(s, "start", fixedClock);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.status).toBe("in_progress");
      expect(r.value.startedAt).toBe(FIXED_TIME);
    }
  });

  it("complete moves in_progress to completed", () => {
    const s = { ...createWorkflowState("RUN-001", "feature"), status: "in_progress" } as const;
    const r = transition(s, "complete", fixedClock);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("completed");
  });

  it("fail moves in_progress to failed (terminal)", () => {
    const s = { ...createWorkflowState("RUN-001", "feature"), status: "in_progress" } as const;
    const r = transition(s, "fail", fixedClock);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("failed");
  });

  it("block moves in_progress to blocked", () => {
    const s = { ...createWorkflowState("RUN-001", "feature"), status: "in_progress" } as const;
    const r = transition(s, "block", fixedClock);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("blocked");
  });

  it("resume moves blocked to in_progress", () => {
    const s = {
      ...createWorkflowState("RUN-001", "feature"),
      status: "blocked",
      startedAt: FIXED_TIME,
    } as const;
    const r = transition(s, "resume", fixedClock);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("in_progress");
  });

  it("INVARIANT: cannot transition out of completed", () => {
    const s = {
      ...createWorkflowState("RUN-001", "feature"),
      status: "completed",
      startedAt: FIXED_TIME,
    } as const;
    for (const t of ["start", "block", "resume", "complete", "fail"] as const) {
      const r = transition(s, t, fixedClock);
      expect(r.ok).toBe(false);
    }
  });

  it("INVARIANT: cannot transition out of failed", () => {
    const s = {
      ...createWorkflowState("RUN-001", "feature"),
      status: "failed",
      startedAt: FIXED_TIME,
    } as const;
    for (const t of ["start", "block", "resume", "complete", "fail"] as const) {
      const r = transition(s, t, fixedClock);
      expect(r.ok).toBe(false);
    }
  });

  it("INVARIANT: cannot turn failed into completed via any sequence", () => {
    const failed = {
      ...createWorkflowState("RUN-001", "feature"),
      status: "failed",
      startedAt: FIXED_TIME,
    } as const;
    // Try every transition; none should change the status.
    for (const t of ["start", "block", "resume", "complete", "fail"] as const) {
      const r = transition(failed, t, fixedClock);
      expect(r.ok).toBe(false);
    }
  });

  it("rejects unknown transition from pending (e.g. block)", () => {
    const s = createWorkflowState("RUN-001", "feature");
    const r = transition(s, "block", fixedClock);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INTERNAL");
  });
});

describe("isTerminal", () => {
  it("returns true for completed and failed", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
  });
  it("returns false for pending, in_progress, blocked", () => {
    expect(isTerminal("pending")).toBe(false);
    expect(isTerminal("in_progress")).toBe(false);
    expect(isTerminal("blocked")).toBe(false);
  });
});
