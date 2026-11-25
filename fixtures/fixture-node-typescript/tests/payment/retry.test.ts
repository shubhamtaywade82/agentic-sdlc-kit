import { describe, expect, it } from "vitest";
import { RetryPolicy } from "../../src/payment/retry";

describe("RetryPolicy", () => {
  it("retries at most 3 times", () => {
    const policy = new RetryPolicy(3);
    expect(policy.shouldRetry(0)).toBe(true);
    expect(policy.shouldRetry(3)).toBe(false);
  });
});
