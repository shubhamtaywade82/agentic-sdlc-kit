/**
 * @agentic-mods/sdlc-controller — Entry point for SDLC workflows in Claude Code. Maps /agentic feature|fix|app intents to agentic-sdlc-kit workflow starts via sdlc-bridge.
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

export interface SdlcControllerState {
  activeWorkflow?: { workflowId: string; taskId: string; currentStage: string };
}

export default defineMod({
  id: "sdlc-controller",
  capabilities: {
    hooks: ["session.start","prompt.submitted","turn.complete"],
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
