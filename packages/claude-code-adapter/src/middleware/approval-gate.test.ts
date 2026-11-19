// packages/claude-code-adapter/src/middleware/approval-gate.test.ts
import { describe, expect, it } from "vitest";
import { DefaultApprovalGate } from "./approval-gate.js";
import type { PolicyDecision } from "@agentic-sdlc-kit/contracts";

const allow: PolicyDecision = { action: "file.delete", verdict: "allow", reason: "ok" };
const deny: PolicyDecision = { action: "file.delete", verdict: "deny", reason: "no" };
const requireApproval: PolicyDecision = {
  action: "file.delete",
  verdict: "require-approval",
  reason: "needs ok",
  approver: "user",
};

describe("DefaultApprovalGate — interactive", () => {
  const gate = new DefaultApprovalGate(true);
  it("maps allow → allow", () => {
    expect(gate.apply(allow)).toBe("allow");
  });
  it("INVARIANT: maps deny → deny (never allow)", () => {
    expect(gate.apply(deny)).toBe("deny");
  });
  it("maps require-approval → prompt", () => {
    expect(gate.apply(requireApproval)).toBe("prompt");
  });
});

describe("DefaultApprovalGate — non-interactive (fail-closed)", () => {
  const gate = new DefaultApprovalGate(false);
  it("maps allow → allow", () => {
    expect(gate.apply(allow)).toBe("allow");
  });
  it("INVARIANT: maps deny → deny", () => {
    expect(gate.apply(deny)).toBe("deny");
  });
  it("maps require-approval → deny (fail-closed)", () => {
    expect(gate.apply(requireApproval)).toBe("deny");
  });
});
