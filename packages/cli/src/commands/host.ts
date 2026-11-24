// packages/cli/src/commands/host.ts
//
// `kit host list | install <host|all> [--scope user|project] [--dir <p>]
//                 [--home <p>] [--force] [--dry-run] [--json]`
//
// Installs the standing agent procedure into each AI host's instruction
// surface once, so per ticket the user types a single line and the host
// drives the kit's evidence-gated loop (`kit next --json`) on its own.

import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_SCOPE,
  HOST_IDS,
  isHostId,
  planHostTargets,
  type HostId,
  type HostScope,
} from '@agentic-sdlc-kit/core';
import { applyTarget, type ApplyResult } from './host-apply.js';
import type { Command, CommandContext, CommandResult } from './types.js';

const USAGE = [
  'Usage: kit host list',
  '       kit host install <host|all> [--scope user|project] [--dir <project>] [--home <dir>]',
  '                        [--force] [--dry-run] [--json]',
  '',
  `Hosts: ${HOST_IDS.join(', ')}`,
  'Default scope: user where the host has a global surface, otherwise project.',
  'Existing files you edited are never overwritten without --force; shared files',
  '(AGENTS.md, GEMINI.md, CONVENTIONS.md) only get a replaceable managed block.',
].join('\n');

function opt(argv: ReadonlyArray<string>, name: string): string | undefined {
  const i = argv.indexOf(name);
  const v = i === -1 ? undefined : argv[i + 1];
  return v && !v.startsWith('-') ? v : undefined;
}

function listText(): string {
  const lines = ['kit host: instruction surfaces', ''];
  for (const host of HOST_IDS) {
    const scope = DEFAULT_SCOPE[host];
    const paths = planHostTargets(host, scope)!.map((t) => t.path);
    lines.push(`  ${host.padEnd(12)} [${scope}]  ${paths.join(', ')}`);
  }
  return lines.join('\n');
}

interface Plan {
  readonly host: HostId;
  readonly scope: HostScope;
  readonly root: string;
}

function resolvePlans(ctx: CommandContext, which: string): Plan[] | string {
  const explicit = opt(ctx.argv, '--scope');
  if (explicit !== undefined && explicit !== 'user' && explicit !== 'project') {
    return `--scope must be 'user' or 'project' (got '${explicit}')`;
  }
  if (which !== 'all' && !isHostId(which)) return `unknown host '${which}'`;
  const hosts: HostId[] = which === 'all' ? [...HOST_IDS] : [which as HostId];
  const home = path.resolve(opt(ctx.argv, '--home') ?? os.homedir());
  const project = path.resolve(ctx.cwd, opt(ctx.argv, '--dir') ?? '.');
  const plans: Plan[] = [];
  for (const host of hosts) {
    const scope = (explicit as HostScope | undefined) ?? DEFAULT_SCOPE[host];
    if (!planHostTargets(host, scope)) {
      if (which === 'all') continue; // an explicit scope that some hosts lack is not an error for 'all'
      return `${host} has no ${scope}-scope instruction surface`;
    }
    plans.push({ host, scope, root: scope === 'user' ? home : project });
  }
  return plans;
}

async function runInstall(ctx: CommandContext, which: string): Promise<CommandResult> {
  const plans = resolvePlans(ctx, which);
  if (typeof plans === 'string') {
    ctx.stderr(`kit host: ${plans}`);
    return { exitCode: 1 };
  }
  const opts = { force: ctx.argv.includes('--force'), dryRun: ctx.argv.includes('--dry-run') };
  const results: Array<ApplyResult & { host: HostId; scope: HostScope }> = [];
  for (const p of plans) {
    for (const t of planHostTargets(p.host, p.scope)!) {
      results.push({ host: p.host, scope: p.scope, ...(await applyTarget(p.root, t, opts)) });
    }
  }
  const refused = results.some((r) => r.action === 'refused');
  ctx.stdout(formatResults(results, opts.dryRun, ctx.argv.includes('--json')));
  return { exitCode: refused ? 1 : 0 };
}

function formatResults(rs: ReadonlyArray<ApplyResult & { host: HostId }>, dry: boolean, json: boolean): string {
  if (json) return JSON.stringify({ dryRun: dry, results: rs }, null, 2);
  const lines = rs.map((r) => `  ${r.action.padEnd(9)} ${r.host.padEnd(12)} ${r.path}${r.reason ? `  (${r.reason})` : ''}`);
  return [dry ? 'kit host install (dry run, nothing written)' : 'kit host install', ...lines].join('\n');
}

export const hostCommand: Command = {
  name: 'host',
  summary: 'Install the standing agent procedure into AI hosts (claude-code, codex, cursor, agy, gemini, aider).',
  async run(ctx: CommandContext): Promise<CommandResult> {
    const positional = ctx.argv.filter((a, i) => !a.startsWith('-') && !isOptValue(ctx.argv, i));
    const [sub, which] = positional;
    if (ctx.argv.includes('--help') || !sub) {
      ctx.stdout(USAGE);
      return { exitCode: sub || ctx.argv.includes('--help') ? 0 : 1 };
    }
    if (sub === 'list') {
      ctx.stdout(listText());
      return { exitCode: 0 };
    }
    if (sub === 'install' && which) return runInstall(ctx, which);
    ctx.stderr(`kit host: unknown or incomplete subcommand\n${USAGE}`);
    return { exitCode: 1 };
  },
};

/** True when argv[i] is the value of a value-taking flag (so it is not a positional). */
function isOptValue(argv: ReadonlyArray<string>, i: number): boolean {
  const prev = argv[i - 1];
  return prev === '--scope' || prev === '--dir' || prev === '--home';
}
