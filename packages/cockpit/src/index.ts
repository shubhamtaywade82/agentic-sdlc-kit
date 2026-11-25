/**
 * @agentic-mods/cockpit — Unified Agentic Engineering Cockpit: aggregates contract / impact / evidence / review / safety / release rows from all enabled mods.
 *
 * Implementation status: scaffold. The next milestone wires these interfaces to
 * the real agentic-sdlc-kit workflow / TDD / verification / policy APIs.
 */
export const packageId = "@agentic-mods/cockpit";

export interface CockpitRow {
  section: "Task" | "Contract" | "Impact" | "Evidence" | "Review" | "Safety" | "Release";
  label: string;
  state: "PASS" | "FAIL" | "UNKNOWN" | "BLOCKED" | "ATTENTION" | "CLEAR" | "NOT READY";
  detail?: string;
}
