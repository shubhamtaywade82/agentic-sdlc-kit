/**
 * @agentic-mods/preset-resolver — Resolves a preset name to the set of mods to enable, validates overlaps and produces installation instructions.
 *
 * Implementation status: scaffold. The next milestone wires these interfaces to
 * the real agentic-sdlc-kit workflow / TDD / verification / policy APIs.
 */
export const packageId = "@agentic-mods/preset-resolver";

export interface ResolvedPreset {
  preset: string;
  mods: string[];
  warnings: string[];
}
