// packages/core/src/project-profile/generator.ts
//
// Generates a ProjectProfile from a RepositoryScan. The scan is read-only;
// the generator only shapes data, never executes anything.
//
// M1 implementation: supports the obvious stack mappings. M2 will expand
// detection and may add heuristics for ambiguous cases.

import {
  Errors,
  type ProjectProfile,
  type RepositoryScan,
  type Result,
} from "@agentic-sdlc-kit/contracts";
import { validateProfile } from "./validator.js";

const STACK_TO_COMMANDS: Readonly<Record<string, Partial<Record<"test" | "lint" | "typecheck" | "build", string[][]>>>> = {
  "node-typescript": {
    test: [["pnpm", "test"]],
    lint: [["pnpm", "lint"]],
    typecheck: [["pnpm", "typecheck"]],
    build: [["pnpm", "build"]],
  },
  "react-typescript": {
    test: [["pnpm", "test"]],
    build: [["pnpm", "build"]],
  },
  "ruby-rails": {
    test: [["bundle", "exec", "rspec"]],
    lint: [["bundle", "exec", "rubocop"]],
  },
};

/**
 * Generate a ProjectProfile from a RepositoryScan. The result is validated
 * before being returned.
 *
 * The generator does NOT execute anything; it only shapes data based on
 * what the (read-only) scan found.
 */
export function generateProfile(scan: RepositoryScan): Result<ProjectProfile> {
  const primary = scan.detectedStacks[0];
  if (!primary) {
    return {
      ok: false,
      error: Errors.discoveryFailed("RepositoryScan did not detect any stacks"),
    };
  }
  const commands: ProjectProfile["commands"] = {};
  const cmdMap = STACK_TO_COMMANDS[primary];
  if (cmdMap) {
    if (cmdMap.test) commands.test = cmdMap.test;
    if (cmdMap.lint) commands.lint = cmdMap.lint;
    if (cmdMap.typecheck) commands.typecheck = cmdMap.typecheck;
    if (cmdMap.build) commands.build = cmdMap.build;
  }
  const candidate: ProjectProfile = {
    schemaVersion: 1,
    name: deriveName(scan),
    stack: scan.detectedStacks,
    commands,
  };
  return validateProfile(candidate);
}

function deriveName(scan: RepositoryScan): string {
  // The root is an absolute path; use the last segment as the project name.
  // Strip trailing slashes for robustness.
  const trimmed = scan.root.replace(/\/+$/, "");
  const segments = trimmed.split("/");
  const last = segments[segments.length - 1];
  if (!last) return "unnamed-project";
  // Lowercase, replace non-alphanumeric with dashes, collapse repeats.
  return last.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unnamed-project";
}
