// packages/claude-code-adapter/src/events/translator.test.ts
import { describe, expect, it } from "vitest";
import { IdentityTranslator } from "./translator.js";

const ts = "2026-01-01T00:00:00.000Z";

describe("IdentityTranslator", () => {
  const t = new IdentityTranslator();
  it("returns the event when it is already a RuntimeEvent", () => {
    const e = { kind: "lifecycle", phase: "session-start", timestamp: ts };
    expect(t.translate(e)).toEqual(e);
  });
  it("returns null for non-event input", () => {
    expect(t.translate(null)).toBeNull();
    expect(t.translate("hello")).toBeNull();
    expect(t.translate({})).toBeNull();
    expect(t.translate({ kind: "unknown" })).toBeNull();
  });
});
