// packages/claude-code-adapter/src/contracts/runtime-event.ts
//
// RuntimeEvent: the boundary contract between the host runtime and core.
//
// The host (Claude Code, Codex, others) emits events in its own shape. The
// adapter translates them to RuntimeEvent. Core consumes RuntimeEvent and
// NEVER the raw host event. This is what makes core runtime-independent.
//
// See ARCHITECTURE.md §3 and ADR-0004 / ADR-0005.

import type { VerificationReport } from "@agentic-sdlc-kit/contracts";

export type RuntimeEvent =
  | {
      kind: "lifecycle";
      phase: "session-start" | "session-end" | "task-start" | "task-end";
      runId?: string;
      timestamp: string; // ISO 8601
    }
  | {
      kind: "tool-call";
      tool: string;
      input: unknown;
      output?: unknown;
      timestamp: string;
    }
  | {
      kind: "model-request";
      model: string;
      effort: string;
      tokensIn?: number;
      tokensOut?: number;
      timestamp: string;
    }
  | {
      kind: "verification";
      report: VerificationReport;
      timestamp: string;
    };

/**
 * Type guard helpers for narrowing a RuntimeEvent by kind.
 */
export function isLifecycle(e: RuntimeEvent): e is Extract<RuntimeEvent, { kind: "lifecycle" }> {
  return e.kind === "lifecycle";
}
export function isToolCall(e: RuntimeEvent): e is Extract<RuntimeEvent, { kind: "tool-call" }> {
  return e.kind === "tool-call";
}
export function isModelRequest(
  e: RuntimeEvent,
): e is Extract<RuntimeEvent, { kind: "model-request" }> {
  return e.kind === "model-request";
}
export function isVerification(
  e: RuntimeEvent,
): e is Extract<RuntimeEvent, { kind: "verification" }> {
  return e.kind === "verification";
}
