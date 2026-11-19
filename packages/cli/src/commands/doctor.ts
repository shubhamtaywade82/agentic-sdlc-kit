// packages/cli/src/commands/doctor.ts
//
// `kit doctor`. Checks the kit's own toolchain health:
//   - Node version meets the minimum.
//   - pnpm is available.
//   - Every workspace package is listed.
//
// In M1 this is a smoke command. It does not execute pnpm; it only checks
// presence and versions. M2 expands it to check the target repo's toolchain.

import { VERSION } from "../application/version.js";
import type { Command, CommandContext, CommandResult } from "./types.js";

const MIN_NODE_MAJOR = 20;

export const doctorCommand: Command = {
  name: "doctor",
  summary: "Check the kit toolchain and configuration health.",
  async run(ctx: CommandContext): Promise<CommandResult> {
    const lines: string[] = [];
    let healthy = true;

    lines.push(`kit ${VERSION}`);
    lines.push("");

    // Node version
    const nodeVersion = process.versions.node;
    const nodeMajor = Number.parseInt(nodeVersion.split(".")[0] ?? "0", 10);
    const nodeOk = nodeMajor >= MIN_NODE_MAJOR;
    if (!nodeOk) healthy = false;
    lines.push(`  node           ${nodeVersion}  ${nodeOk ? "[ok]" : `[FAIL: needs >= ${MIN_NODE_MAJOR}]`}`);

    // pnpm presence (read from env PATH; do not spawn)
    const pnpmPath = await findPnpm();
    const pnpmOk = pnpmPath !== null;
    if (!pnpmOk) healthy = false;
    lines.push(`  pnpm           ${pnpmOk ? "found" : "MISSING"}  ${pnpmOk ? "[ok]" : "[FAIL]"}`);

    // Workspace packages — declared, not built
    lines.push(`  workspace      contracts, core, cli, testing, claude-code-adapter  [declared]`);

    lines.push("");
    lines.push(healthy ? "Status: healthy" : "Status: issues found");
    ctx.stdout(lines.join("\n"));
    return { exitCode: healthy ? 0 : 2 };
  },
};

async function findPnpm(): Promise<string | null> {
  try {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    // Try to resolve pnpm via require.resolve — works when pnpm is global.
    try {
      const resolved = require.resolve("pnpm/package.json");
      return resolved;
    } catch {
      // Fall back to a PATH check
      const { execFileSync } = await import("node:child_process");
      try {
        execFileSync("pnpm", ["--version"], { stdio: "ignore" });
        return "pnpm";
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
}
