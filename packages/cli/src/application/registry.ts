// packages/cli/src/application/registry.ts
//
// Command registry. The dispatcher uses this to find a command by name.
// Adding a command = adding one entry here.

import type { Command } from '../commands/types.js';

export interface CommandRegistry {
  list(): ReadonlyArray<Command>;
  get(name: string): Command | undefined;
  register(command: Command): void;
}

export function createCommandRegistry(initial: ReadonlyArray<Command> = []): CommandRegistry {
  const commands = new Map<string, Command>();
  for (const c of initial) commands.set(c.name, c);
  return {
    list: () => Array.from(commands.values()),
    get: (name: string) => commands.get(name),
    register: (command: Command) => {
      commands.set(command.name, command);
    },
  };
}
