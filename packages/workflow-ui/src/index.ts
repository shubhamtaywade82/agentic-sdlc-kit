/**
 * @agentic-mods/workflow-ui — Renders workflow stage state, TDD panels and readiness summaries from ClaudeWorkflowSession envelopes. Imports contracts + sdlc-bridge only.
 *
 * Implementation status: scaffold. The next milestone wires these interfaces to
 * the real agentic-sdlc-kit workflow / TDD / verification / policy APIs.
 */
export const packageId = "@agentic-mods/workflow-ui";

export interface PanelState {
  title: string;
  rows: Array<{ label: string; status: "PASS" | "FAIL" | "UNKNOWN" | "STALE"; detail?: string }>;
  nextAction?: string;
}
