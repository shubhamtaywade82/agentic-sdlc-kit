// packages/contracts/src/policy/policy.test.ts
import { describe, expect, it } from "vitest";
import { PolicyDecisionSchema, type PolicyDecision } from "./policy.js";

const allow: PolicyDecision = { action: "file.delete", verdict: "allow", reason: "scope=1" };
const deny: PolicyDecision = { action: "git.force-push", verdict: "deny", reason: "always" };
const requireApproval: PolicyDecision = {
  action: "db.migrate",
  verdict: "require-approval",
  reason: "destructive",
  approver: "user",
};

describe("PolicyDecisionSchema", () => {
  it("accepts allow", () => {
    expect(PolicyDecisionSchema.safeParse(allow).success).toBe(true);
  });
  it("accepts deny", () => {
    expect(PolicyDecisionSchema.safeParse(deny).success).toBe(true);
  });
  it("accepts require-approval", () => {
    expect(PolicyDecisionSchema.safeParse(requireApproval).success).toBe(true);
  });
  it("rejects require-approval without approver", () => {
    const { approver: _omit, ...rest } = requireApproval;
    void _omit;
    expect(PolicyDecisionSchema.safeParse(rest).success).toBe(false);
  });
  it("rejects an unknown verdict", () => {
    expect(PolicyDecisionSchema.safeParse({ ...allow, verdict: "maybe" }).success).toBe(false);
  });
  it("rejects an unknown action", () => {
    expect(PolicyDecisionSchema.safeParse({ ...allow, action: "file.format" }).success).toBe(
      false,
    );
  });
});

describe("PolicyDecision discriminated union", () => {
  // Compile-time check that narrowing works on `verdict`. If this compiles,
  // the discriminated union is correctly defined.
  const narrow = (d: PolicyDecision): string => {
    if (d.verdict === "allow") return `allow:${d.action}`;
    if (d.verdict === "deny") return `deny:${d.action}`;
    return `require-approval:${d.approver}`;
  };
  it("narrows on verdict", () => {
    expect(narrow(allow)).toBe("allow:file.delete");
    expect(narrow(deny)).toBe("deny:git.force-push");
    expect(narrow(requireApproval)).toBe("require-approval:user");
  });
});
