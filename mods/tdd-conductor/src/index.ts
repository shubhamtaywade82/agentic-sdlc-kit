/**
 * @agentic-mods/tdd-conductor — Enforces RED -> GREEN -> REFACTOR. Validates that RED failures are behavioral (not compilation), keeps cycle evidence, and prevents skipping RED without an approved exception.
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

export interface TddCycle {
  cycle: number;
  state: "specify" | "red" | "green" | "refactor";
  behavior: string;
  redEvidence: "VERIFIED" | "SKIPPED" | "PENDING";
  regression: string;
}

export default defineMod({
  id: "tdd-conductor",
  capabilities: {
    hooks: ["tool.call","command.completed"],
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
