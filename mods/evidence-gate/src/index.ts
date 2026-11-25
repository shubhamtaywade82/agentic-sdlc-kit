/**
 * @agentic-mods/evidence-gate — Observes build/test/lint/typecheck commands, records exit codes with git fingerprints, invalidates evidence on relevant file changes, and blocks completion claims while required checks are MISSING or STALE.
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

export interface EvidenceRecord {
  id: string;
  check: "build" | "test" | "lint" | "typecheck" | "security";
  status: "pass" | "fail" | "stale" | "unknown";
  command: string;
  exitCode?: number;
  gitHead: string;
  workingTreeFingerprint: string;
  collectedAt: string;
}

export default defineMod({
  id: "evidence-gate",
  capabilities: {
    hooks: ["tool.call","command.completed","file.changed","turn.complete"],
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
