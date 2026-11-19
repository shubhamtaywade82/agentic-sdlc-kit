// packages/core/src/discovery/repository-scanner.ts
//
// Read-only repository scanner implementation (M2).
// Inspects file structure, manifests, and git metadata without executing scripts.

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  Errors,
  RepositoryScanSchema,
  type RepositoryScan,
  type Result,
} from "@agentic-sdlc-kit/contracts";
import { detectGitState } from "./git-scanner.js";
import { detectStacks } from "./stack-detector.js";
import {
  detectAgentInstructions,
  detectCi,
  detectEntryPoints,
  detectMigrations,
} from "./conventions-detector.js";

export interface RepositoryScanner {
  /**
   * Scan the repository at `root`. Read-only. Returns a structured
   * RepositoryScan or a DISCOVERY_FAILED error.
   */
  scan(root: string): Promise<Result<RepositoryScan>>;
}

export class FileSystemRepositoryScanner implements RepositoryScanner {
  async scan(rawRoot: string): Promise<Result<RepositoryScan>> {
    const root = path.resolve(rawRoot);
    try {
      const stat = await fs.stat(root);
      if (!stat.isDirectory()) {
        return { ok: false, error: Errors.discoveryFailed(`path is not a directory: ${root}`) };
      }
    } catch {
      return { ok: false, error: Errors.discoveryFailed(`directory does not exist: ${root}`) };
    }

    const { detectedStacks, packageManagers, testFrameworks } = await detectStacks(root);
    const entryPoints = await detectEntryPoints(root);
    const hasMigrations = await detectMigrations(root);
    const hasCi = await detectCi(root);
    const agentInstructionFiles = await detectAgentInstructions(root);
    const git = await detectGitState(root);

    const candidate: RepositoryScan = {
      root,
      detectedStacks,
      packageManagers,
      entryPoints,
      testFrameworks,
      hasMigrations,
      hasCi,
      agentInstructionFiles,
      git,
    };

    const parsed = RepositoryScanSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        ok: false,
        error: Errors.discoveryFailed("failed to validate repository scan schema", {
          issues: parsed.error.issues,
        }),
      };
    }

    return { ok: true, value: parsed.data };
  }
}

/**
 * M1 stub scanner preserved for backward compatibility and testing error paths.
 */
export class StubRepositoryScanner implements RepositoryScanner {
  async scan(root: string): Promise<Result<RepositoryScan>> {
    return {
      ok: false,
      error: Errors.notImplemented(
        "RepositoryScanner is not implemented in M1; lands in M2",
        { root, milestone: "M2" },
      ),
    };
  }
}
