#!/usr/bin/env node
// packages/cli/src/index.ts
//
// `kit` executable entry point. Parses argv, dispatches to a command,
// prints output, and exits.

import { createDispatcher } from "./application/dispatcher.js";
import type { CommandContext } from "./commands/types.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const ctx: CommandContext = {
    argv,
    cwd: process.cwd(),
    stdout: (s: string) => process.stdout.write(s + "\n"),
    stderr: (s: string) => process.stderr.write(s + "\n"),
  };
  const { dispatch } = createDispatcher();
  const result = await dispatch(ctx);
  if (result.message && result.command !== "help" && result.command !== "doctor") {
    // help and doctor write their own output; everything else prints the message.
    process.stdout.write(result.message + "\n");
  }
  process.exit(result.exitCode);
}

main().catch((e) => {
  process.stderr.write(`kit: internal error: ${String(e)}\n`);
  process.exit(2);
});
