// packages/core/src/stacks/stack-commands.ts
//
// The single source of lifecycle commands for a stack. `kit new` and
// `kit init` both read from the stack pack, so a stack cannot get npm commands
// by accident. The package manager is applied only to Node-style commands; a
// pack that does not use `pnpm` in its command is left untouched.

import { resolveStackPack, type StackPackManifest } from './stack-pack.js';

export type LifecycleStep = 'test' | 'lint' | 'typecheck' | 'build';
export type StackCommands = Partial<Record<LifecycleStep, string[][]>>;

/** Accepted names from the README that map onto canonical pack ids. */
export const STACK_ALIASES: Readonly<Record<string, string>> = {
  'react-spa': 'react-typescript',
  'rails-hotwire': 'ruby-rails',
};

export function canonicalStackId(id: string): string | undefined {
  const canonical = STACK_ALIASES[id] ?? id;
  return resolveStackPack(canonical) === undefined ? undefined : canonical;
}

const RUN_REQUIRED: ReadonlySet<string> = new Set(['npm', 'bun']);
const SUPPORTED_NODE_MANAGERS: ReadonlySet<string> = new Set(['npm', 'pnpm', 'yarn', 'bun']);

/** Node packs are written with `pnpm`; swap in the project's manager. */
function applyPackageManager(argv: readonly string[], manager: string): string[] {
  if (argv[0] !== 'pnpm' || !SUPPORTED_NODE_MANAGERS.has(manager)) return [...argv];
  const [, ...rest] = argv;
  const needsRun = RUN_REQUIRED.has(manager) && rest[0] !== 'test' && rest[0] !== 'start';
  return needsRun ? [manager, 'run', ...rest] : [manager, ...rest];
}

function mapSteps(
  pack: StackPackManifest,
  manager: string | undefined,
): StackCommands {
  const out: StackCommands = {};
  for (const step of ['test', 'lint', 'typecheck', 'build'] as const) {
    const argvs = pack.defaultCommands[step];
    if (argvs === undefined) continue;
    out[step] = argvs.map((argv) => (manager === undefined ? [...argv] : applyPackageManager(argv, manager)));
  }
  return out;
}

/**
 * Commands for a stack, from its pack. Returns undefined for an unknown stack.
 * `packageManager` is applied only to Node-style commands.
 */
export function commandsForStack(
  stackId: string,
  opts: { packageManager?: string } = {},
): StackCommands | undefined {
  const canonical = canonicalStackId(stackId);
  if (canonical === undefined) return undefined;
  const pack = resolveStackPack(canonical);
  if (pack === undefined) return undefined;
  return mapSteps(pack, opts.packageManager);
}
