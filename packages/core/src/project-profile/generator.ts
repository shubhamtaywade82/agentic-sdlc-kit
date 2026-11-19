// packages/core/src/project-profile/generator.ts
//
// Generates a ProjectProfile from a RepositoryScan.
// The scan is read-only; the generator shapes data, never executes anything.

import {
  Errors,
  type ProjectProfile,
  type RepositoryScan,
  type Result,
} from "@agentic-sdlc-kit/contracts";
import { validateProfile } from "./validator.js";

function deriveCommands(scan: RepositoryScan): ProjectProfile["commands"] {
  const commands: ProjectProfile["commands"] = {};
  const primary = scan.detectedStacks[0];
  const pm = scan.packageManagers[0] ?? "pnpm";

  if (scan.testFrameworks.includes("node:test")) {
    commands.test = [["node", "--test", "tests/"]];
    return commands;
  }
  if (primary === "node-typescript") {
    commands.test = [[pm, "test"]];
    commands.lint = [[pm, "lint"]];
    commands.typecheck = [[pm, "typecheck"]];
    commands.build = [[pm, "build"]];
    return commands;
  }
  if (primary === "react-typescript") {
    commands.test = [[pm, "test"]];
    commands.build = [[pm, "build"]];
    return commands;
  }
  if (primary === "ruby-rails") {
    commands.test = [["bundle", "exec", "rspec"]];
    commands.lint = [["bundle", "exec", "rubocop"]];
    return commands;
  }
  return commands;
}

export function generateProfile(scan: RepositoryScan): Result<ProjectProfile> {
  const primary = scan.detectedStacks[0];
  if (!primary) {
    return {
      ok: false,
      error: Errors.discoveryFailed("RepositoryScan did not detect any stacks"),
    };
  }

  const candidate: ProjectProfile = {
    schemaVersion: 1,
    name: deriveName(scan),
    stack: scan.detectedStacks,
    commands: deriveCommands(scan),
  };
  return validateProfile(candidate);
}

function deriveName(scan: RepositoryScan): string {
  const trimmed = scan.root.replace(/\/+$/, "");
  const segments = trimmed.split("/");
  const last = segments[segments.length - 1];
  if (!last) return "unnamed-project";
  return last.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unnamed-project";
}
