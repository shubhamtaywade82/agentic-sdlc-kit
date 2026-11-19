// packages/core/src/project-profile/serializer.ts
//
// Deterministic YAML serializer for ProjectProfile (.ai-kit/project.yml).
// Generates clean, human-readable YAML without external dependencies.

import type { ProjectProfile } from "@agentic-sdlc-kit/contracts";

export function serializeProfileToYaml(profile: ProjectProfile): string {
  const lines: string[] = [];
  lines.push(`schemaVersion: ${profile.schemaVersion}`);
  lines.push(`name: ${profile.name}`);
  lines.push("stack:");
  for (const s of profile.stack) {
    lines.push(`  - ${s}`);
  }

  const entries = Object.entries(profile.commands).filter(
    ([, cmds]) => cmds && cmds.length > 0,
  );
  if (entries.length === 0) {
    lines.push("commands: {}");
    return lines.join("\n") + "\n";
  }

  lines.push("commands:");
  for (const [category, cmds] of entries) {
    lines.push(`  ${category}:`);
    for (const cmd of cmds!) {
      const formatted = JSON.stringify(cmd);
      lines.push(`    - ${formatted}`);
    }
  }

  return lines.join("\n") + "\n";
}
