/**
 * @agentic-mods/release-conductor — Release gate: aggregates PR readiness, changelog/version checks, migration detection, deployment and rollback checklists. Never deploys autonomously in v1.
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

export interface ReleaseChecklist {
  evidenceCurrent: boolean;
  criticalFindings: number;
  migrationsReviewed: boolean;
  rollbackDocumented: boolean;
}

export default defineMod({
  id: "release-conductor",
  capabilities: {
    hooks: ["turn.complete"],
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
