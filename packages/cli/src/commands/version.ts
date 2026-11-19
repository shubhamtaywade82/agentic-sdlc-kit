// packages/cli/src/commands/version.ts
//
// `kit --version` / `kit version`. Prints the package version.

import { VERSION } from "../application/version.js";
import type { Command, CommandResult } from "./types.js";

export const versionCommand: Command = {
  name: "version",
  summary: "Print the kit version.",
  run(): CommandResult {
    return { exitCode: 0, message: VERSION };
  },
};
