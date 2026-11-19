// packages/claude-code-adapter/src/events/translator.ts
//
// Translator interface: convert host-specific events into RuntimeEvent
// values that core can consume.
//
// M1: the identity translator is provided so the contract surface compiles
// and is exercised by unit tests. The real Claude Code translator lands
// in M10 when the host SDK is wired.

import type { RuntimeEvent } from "../contracts/runtime-event.js";

/**
 * The shape of a "host event" is intentionally `unknown` in M1: the
// concrete shape depends on the host SDK, which is not imported until M10.
// The translator is the only place that knows the host shape.
 */
export type HostEvent = unknown;

export interface EventTranslator {
  translate(event: HostEvent): RuntimeEvent | null;
}

/**
 * Identity translator: returns the event if it already looks like a
 * RuntimeEvent, otherwise returns null. This exists so M1 tests can
 * exercise the contract surface without the host SDK.
 */
export class IdentityTranslator implements EventTranslator {
  translate(event: HostEvent): RuntimeEvent | null {
    if (typeof event !== "object" || event === null) return null;
    const e = event as { kind?: unknown };
    if (
      e.kind === "lifecycle" ||
      e.kind === "tool-call" ||
      e.kind === "model-request" ||
      e.kind === "verification"
    ) {
      return event as RuntimeEvent;
    }
    return null;
  }
}
