// packages/claude-code-adapter/src/mods/mods.test.ts
import { describe, expect, it } from "vitest";
import { ModelRouter, RunObserver, SdlcGuard, SecretGuard } from "./index.js";

describe("SdlcGuard", () => {
  const guard = new SdlcGuard();

  it("permits safe read-only commands", () => {
    expect(guard.evaluateBashCommand("git status").allowed).toBe(true);
    expect(guard.evaluateBashCommand("pnpm test").allowed).toBe(true);
  });

  it("blocks destructive git commands", () => {
    expect(guard.evaluateBashCommand("git push origin branch -f").allowed).toBe(false);
    expect(guard.evaluateBashCommand("git reset --hard HEAD~1").allowed).toBe(false);
    expect(guard.evaluateBashCommand("git clean -fd").allowed).toBe(false);
  });

  it("requires approval for push to main", () => {
    const res = guard.evaluateBashCommand("git push origin main");
    expect(res.allowed).toBe(false);
    expect(res.requiresApproval).toBe(true);
  });
});

describe("SecretGuard", () => {
  const guard = new SecretGuard();

  it("permits safe content without secrets", () => {
    const res = guard.evaluateWrite("src/index.ts", "const x = 42;");
    expect(res.allowed).toBe(true);
  });

  it("detects and redacts exposed Stripe keys", () => {
    const fakeKey = "sk" + "_live_" + "123456789012345678901234";
    const text = `const apiKey = "${fakeKey}";`;
    const scan = guard.scan(text);
    expect(scan.hasSecret).toBe(true);
    expect(scan.redacted).toContain("[REDACTED_STRIPE]");
  });

  it("blocks write containing exposed secrets", () => {
    const fakeKey = "sk" + "_live_" + "123456789012345678901234";
    const res = guard.evaluateWrite("config.ts", `key = '${fakeKey}'`);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("blocked: contains exposed secret");
  });
});

describe("ModelRouter", () => {
  const router = new ModelRouter();

  it("routes discovery to Haiku", () => {
    const res = router.route({ phase: "discovery" });
    expect(res.model).toBe("haiku");
    expect(res.effort).toBe("low");
  });

  it("routes standard implementation to Sonnet", () => {
    const res = router.route({ phase: "tdd", risk: "medium" });
    expect(res.model).toBe("sonnet");
  });

  it("escalates to Opus upon repeated verification failures", () => {
    const res = router.route({ phase: "tdd", failureCount: 2 });
    expect(res.model).toBe("opus");
    expect(res.effort).toBe("high");
  });
});

describe("RunObserver", () => {
  it("records tool calls, model tokens, and verification status", () => {
    const observer = new RunObserver();
    observer.record({ kind: "tool-call", tool: "Bash", input: "git status", timestamp: "now" });
    observer.record({ kind: "tool-call", tool: "Bash", input: "pnpm test", timestamp: "now" });
    observer.record({ kind: "model-request", model: "claude-3-7-sonnet", effort: "high", tokensIn: 500, tokensOut: 120, timestamp: "now" });
    observer.record({
      kind: "verification",
      report: { schemaVersion: 1, runId: "r1", status: "passed", checks: [] },
      timestamp: "now",
    });

    const metrics = observer.getMetrics();
    expect(metrics.totalEvents).toBe(4);
    expect(metrics.toolCalls["Bash"]).toBe(2);
    expect(metrics.tokensIn).toBe(500);
    expect(metrics.tokensOut).toBe(120);
    expect(metrics.verificationPassed).toBe(1);
  });
});
