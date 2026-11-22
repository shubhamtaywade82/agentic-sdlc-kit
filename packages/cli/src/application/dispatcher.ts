// packages/cli/src/application/dispatcher.ts
//
// Resolves the first non-flag argument to a registered command and runs it.
// Handles --help, --version, and unknown commands.

import { makeHelpCommand } from '../commands/help.js';
import { versionCommand } from '../commands/version.js';
import { doctorCommand } from '../commands/doctor.js';
import { inspectCommand } from '../commands/inspect.js';
import { initCommand } from '../commands/init.js';
import { validateSpecCommand } from '../commands/validate-spec.js';
import { elicitCommand } from '../commands/elicit.js';
import { validatePlanCommand } from '../commands/validate-plan.js';
import { verifyCommand } from '../commands/verify.js';
import { featureCommand } from '../commands/feature.js';
import { newCommand } from '../commands/new.js';
import { fixCommand } from '../commands/fix.js';
import { installCommand } from '../commands/install.js';
import { memoryCommand } from '../commands/memory.js';
import { evolveCommand } from '../commands/evolve.js';
import { refactorCommand } from '../commands/refactor.js';
import { optimizeCommand } from '../commands/optimize.js';
import type { Command, CommandContext, CommandResult } from '../commands/types.js';
import { createCommandRegistry, type CommandRegistry } from './registry.js';
import { VERSION } from './version.js';

export interface DispatchResult extends CommandResult {
  command?: string;
}

export interface DispatcherOptions {
  registry?: CommandRegistry;
}

export function createDispatcher(opts: DispatcherOptions = {}): {
  dispatch: (ctx: CommandContext) => Promise<DispatchResult>;
  registry: CommandRegistry;
} {
  const registry = opts.registry ?? createCommandRegistry();
  // Register default commands. Help needs the registry so it is built lazily.
  if (!registry.get('version')) registry.register(versionCommand);
  if (!registry.get('doctor')) registry.register(doctorCommand);
  if (!registry.get('inspect')) registry.register(inspectCommand);
  if (!registry.get('init')) registry.register(initCommand);
  if (!registry.get('validate-spec')) registry.register(validateSpecCommand);
  if (!registry.get('elicit')) registry.register(elicitCommand);
  if (!registry.get('validate-plan')) registry.register(validatePlanCommand);
  if (!registry.get('verify')) registry.register(verifyCommand);
  if (!registry.get('feature')) registry.register(featureCommand);
  if (!registry.get('new')) registry.register(newCommand);
  if (!registry.get('fix')) registry.register(fixCommand);
  if (!registry.get('install')) registry.register(installCommand);
  if (!registry.get('memory')) registry.register(memoryCommand);
  if (!registry.get('evolve')) registry.register(evolveCommand);
  if (!registry.get('refactor')) registry.register(refactorCommand);
  if (!registry.get('optimize')) registry.register(optimizeCommand);
  if (!registry.get('help')) registry.register(makeHelpCommand(registry));

  return {
    registry,
    async dispatch(ctx: CommandContext): Promise<DispatchResult> {
      const argv = ctx.argv;
      // --version / -v
      if (argv.includes('--version') || argv.includes('-v')) {
        return { exitCode: 0, message: VERSION, command: 'version' };
      }
      // --help / -h with no further command, OR no args at all
      if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
        const help = registry.get('help');
        if (!help) return { exitCode: 1, command: 'help', message: 'help command missing' };
        const r = await help.run(ctx);
        return { ...r, command: 'help' };
      }
      // First non-flag argument is the command name.
      const first = argv.find((a) => !a.startsWith('-'));
      if (!first) {
        const help = registry.get('help');
        if (help) {
          const r = await help.run(ctx);
          return { ...r, command: 'help' };
        }
        return { exitCode: 1, message: 'no command' };
      }
      const cmd: Command | undefined = registry.get(first);
      if (!cmd) {
        ctx.stderr(`kit: unknown command '${first}'\nRun 'kit --help' for usage.\n`);
        return { exitCode: 1, command: first, message: 'unknown command' };
      }
      const rest = argv.filter((a) => a !== first);
      const r = await cmd.run({ ...ctx, argv: rest });
      return { ...r, command: first };
    },
  };
}
