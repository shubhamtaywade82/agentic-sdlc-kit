/**
 * @agentic-mods/change-contract — Boundaries implementation to an approved contract (objective / allowed / forbidden / required evidence). Warns or blocks Edit/Write outside allowed scopes; requires explicit user action to amend.
 */
// Scaffold stand-in for the mod-sdk `defineMod` helper (see docs/mods/MOD_DEVELOPMENT.md).
// TODO(marketplace-m2): replace with `import { defineMod } from "@agentic-sdlc-kit/mod-sdk"`
// once the SDK exports the shared helper.
interface ModCapabilities {
  hooks: string[];
  apiAccess: string[];
  networkAccess: boolean;
  processExecution: boolean;
  modifiesToolCalls: boolean;
}

interface ModRuntime {
  /** Reserved for the mod-sdk runtime surface (state, ui, events). */
  readonly modId?: string;
}

interface ModDefinition {
  id: string;
  capabilities: ModCapabilities;
  register(runtime: ModRuntime): void;
}

function defineMod(definition: ModDefinition): ModDefinition {
  return definition;
}

export interface ChangeContractV1 {
  objective: string;
  allowed: string[];
  forbidden: string[];
  requiredEvidence: string[];
  mode: "observe" | "warn" | "enforce";
}

export default defineMod({
  id: "change-contract",
  capabilities: {
    hooks: ["tool.call","file.changed"],
    apiAccess: ["ui.render", "state.get", "state.set"],
    networkAccess: false,
    processExecution: false,
    modifiesToolCalls: true,
  },
  register(runtime) {
    // Next milestone: wire events to agentic-sdlc-kit via @agentic-mods/sdlc-bridge.
    void runtime;
  },
});
