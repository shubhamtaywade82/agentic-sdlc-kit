/**
 * @agentic-mods/external-mod-adapters — Adapters for catalogued external mods (Blast Radius, Context Bar, Replay Theater, Mission Control, Mod Firewall). Publish normalized events; never modify upstream code.
 *
 * Implementation status: scaffold. The next milestone wires these interfaces to
 * the real agentic-sdlc-kit workflow / TDD / verification / policy APIs.
 */
export const packageId = "@agentic-mods/external-mod-adapters";

/**
 * Scaffold stand-in for the normalized mod event envelope.
 * TODO(marketplace-m2): replace with the @agentic-sdlc-kit/contracts event type.
 */
export interface AgenticModEvent {
  type: string;
  payload?: Record<string, unknown>;
}

export interface ExternalAdapter {
  id: string;
  trustLevel: "review-required" | "trusted";
  publish(event: AgenticModEvent): void;
}
