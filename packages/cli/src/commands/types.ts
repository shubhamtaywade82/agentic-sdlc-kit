// packages/cli/src/commands/types.ts
//
// Command interface. Every command implements this. The dispatcher
// (application/dispatcher.ts) is the only place that knows the full
// command list. Adding a command = adding one file + one registry entry.

export interface CommandContext {
  argv: ReadonlyArray<string>;
  cwd: string;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

export interface CommandResult {
  exitCode: number;
  message?: string;
}

export interface Command {
  /** Command name as invoked on the CLI: `doctor`, `version`, etc. */
  readonly name: string;
  /** One-line summary for `kit --help`. */
  readonly summary: string;
  /** Run the command. MUST NOT throw; failures return a non-zero exitCode. */
  run(ctx: CommandContext): Promise<CommandResult> | CommandResult;
}
