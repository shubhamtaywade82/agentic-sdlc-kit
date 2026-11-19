// packages/core/src/policy/evaluator.test.ts
import { describe, expect, it } from "vitest";
import { applyApproval, evaluate, maybeAllowScopedDelete } from "./evaluator.js";
import type { PolicyAction, PolicyContext, PolicyDecision } from "@agentic-sdlc-kit/contracts";

const actions: ReadonlyArray<PolicyAction> = [
  "file.delete",
  "file.bulk-modify",
  "db.migrate",
  "db.production-mutate",
  "git.force-push",
  "release.deploy",
  "secret.modify",
  "dependency.remove",
];

const interactive: PolicyContext = { interactive: true };
const nonInteractive: PolicyContext = { interactive: false };

describe("evaluate — M1 baseline", () => {
  for (const a of actions) {
    it(`interactive ${a} → require-approval`, () => {
      const d = evaluate(a, interactive);
      expect(d.verdict).toBe("require-approval");
      expect(d.action).toBe(a);
    });
    it(`non-interactive ${a} → deny (fail-closed)`, () => {
      const d = evaluate(a, nonInteractive);
      expect(d.verdict).toBe("deny");
      expect(d.action).toBe(a);
    });
  }
});

describe("applyApproval — INVARIANT: deny cannot become allow", () => {
  const denyDecision: PolicyDecision = {
    action: "file.delete",
    verdict: "deny",
    reason: "no",
  };
  it("deny stays deny regardless of approval", () => {
    const r = applyApproval(denyDecision, { approver: "user", action: "file.delete" });
    expect(r.verdict).toBe("deny");
  });
  it("allow stays allow regardless of approval", () => {
    const allowDecision: PolicyDecision = {
      action: "file.delete",
      verdict: "allow",
      reason: "ok",
    };
    const r = applyApproval(allowDecision, { approver: "anyone", action: "file.delete" });
    expect(r.verdict).toBe("allow");
  });
  it("require-approval becomes allow when approver matches", () => {
    const req: PolicyDecision = {
      action: "file.delete",
      verdict: "require-approval",
      reason: "needs ok",
      approver: "user",
    };
    const r = applyApproval(req, { approver: "user", action: "file.delete" });
    expect(r.verdict).toBe("allow");
  });
  it("require-approval becomes deny when approver does NOT match", () => {
    const req: PolicyDecision = {
      action: "file.delete",
      verdict: "require-approval",
      reason: "needs ok",
      approver: "user",
    };
    const r = applyApproval(req, { approver: "attacker", action: "file.delete" });
    expect(r.verdict).toBe("deny");
  });
  it("require-approval is unchanged when the approval action does not match", () => {
    const req: PolicyDecision = {
      action: "file.delete",
      verdict: "require-approval",
      reason: "needs ok",
      approver: "user",
    };
    const r = applyApproval(req, { approver: "user", action: "git.force-push" });
    expect(r.verdict).toBe("require-approval");
  });
});

describe("maybeAllowScopedDelete", () => {
  it("returns allow for interactive single-file delete", () => {
    const d = maybeAllowScopedDelete({ interactive: true, scopeFileCount: 1 });
    expect(d?.verdict).toBe("allow");
    expect(d?.action).toBe("file.delete");
  });
  it("returns undefined for non-interactive", () => {
    expect(maybeAllowScopedDelete({ interactive: false, scopeFileCount: 1 })).toBeUndefined();
  });
  it("returns undefined for interactive multi-file delete", () => {
    expect(maybeAllowScopedDelete({ interactive: true, scopeFileCount: 5 })).toBeUndefined();
  });
  it("returns undefined when scope is unset", () => {
    expect(maybeAllowScopedDelete({ interactive: true })).toBeUndefined();
  });
});
