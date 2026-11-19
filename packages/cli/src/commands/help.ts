// packages/cli/src/commands/help.ts
//
// `kit --help` / `kit help`. Lists every registered command.

import type { CommandRegistry } from "../application/registry.js";
import type { Command, CommandContext, CommandResult } from "./types.js";

export function makeHelpCommand(registry: CommandRegistry): Command {
  return {
    name: "help",
    summary: "Show this help.",
    run(ctx: CommandContext): CommandResult {
      const lines: string[] = [];
      lines.push("kit — Agentic SDLC Kit");
      lines.push("");
      lines.push("USAGE:");
      lines.push("  kit <command> [options]");
      lines.push("");
      lines.push("COMMANDS:");
      const maxName = Math.max(...registry.list().map((c) => c.name.length));
      for (const c of registry.list()) {
        const pad = " ".repeat(maxName - c.name.length + 2);
        lines.push(`  ${c.name}${pad}${c.summary}`);
      }
      lines.push("");
      lines.push("FLAGS:");
      lines.push("  --help, -h      Show this help.");
      lines.push("  --version, -v   Print the kit version.");
      lines.push("");
      lines.push("Exit codes: 0 success, 1 unknown command, 2 runtime error.");
      ctx.stdout(lines.join("\n"));
      return { exitCode: 0 };
    },
  };
}
