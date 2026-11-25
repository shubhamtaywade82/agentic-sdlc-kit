/**
 * @agentic-mods/architecture-guard — Layer and dependency boundary enforcement from declarative rules; baselines existing violations and blocks only newly introduced ones.
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

export interface LayerRule { layer: string; paths: string[]; mayDependOn: string[]; }
export interface ArchitectureViolation { from: string; import: string; rule: LayerRule; suggested: string; }

export default defineMod({
  id: "architecture-guard",
  capabilities: {
    hooks: ["file.changed","tool.call"],
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
