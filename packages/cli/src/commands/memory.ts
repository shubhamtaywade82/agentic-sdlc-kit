// packages/cli/src/commands/memory.ts
//
// `kit memory [query] [--domain <domain>] [--list] [--json]`.
// Inspects and queries hierarchical episodic, semantic, and procedural memories (M29).
//
// Reads from persisted memory at .ai-kit/state/memory.json.
// If no persisted memory exists, reports honestly that no memories have been
// accumulated yet (rather than seeding fake demo data).

import { MemoryStore } from '@agentic-sdlc-kit/core';
import type { Command, CommandContext, CommandResult } from './types.js';

export const memoryCommand: Command = {
  name: 'memory',
  summary: 'Query hierarchical episodic, semantic, and procedural engineering memories (M29).',
  async run(ctx: CommandContext): Promise<CommandResult> {
    if (ctx.argv.includes('--help') || ctx.argv.includes('-h')) {
      ctx.stdout(formatHelp());
      return { exitCode: 0 };
    }

    const isJson = ctx.argv.includes('--json');
    const isList = ctx.argv.includes('--list') || ctx.argv.includes('-l');
    const domainIdx = ctx.argv.indexOf('--domain');
    const domain = domainIdx !== -1 ? ctx.argv[domainIdx + 1] : undefined;
    const query = ctx.argv.find((a) => !a.startsWith('-') && a !== '--list' && a !== '-l') ?? '';

    const store = new MemoryStore();

    // Load persisted memory from .ai-kit/state/memory.json.
    // This file is written by `kit evolve` and by workflow runs that
    // produce distilled lessons.
    const loaded = await store.loadFromDisk(ctx.cwd);

    if (loaded === 0) {
      const msg =
        'kit memory: no memory entries found at .ai-kit/state/memory.json.\n' +
        'Run `kit evolve` to distill lessons from accumulated experiences, or\n' +
        'run workflows (`kit feature`) to produce experience records that\n' +
        'the evolution engine can learn from.\n';
      if (isJson) {
        ctx.stdout(JSON.stringify({ entries: [], message: msg.trim() }) + '\n');
      } else {
        ctx.stdout(msg);
      }
      return { exitCode: 0 };
    }

    // If --list, show all entries (optionally filtered by domain).
    // Otherwise, search by query.
    const results = isList
      ? store.list().filter((e) => !domain || e.domain === domain)
      : store.search(query, domain);

    if (isJson) {
      ctx.stdout(JSON.stringify(results, null, 2) + '\n');
    } else {
      ctx.stdout(formatResults(results));
    }

    return { exitCode: 0 };
  },
};

function formatResults(results: ReturnType<MemoryStore['list']>): string {
  if (results.length === 0) return 'No matching engineering memories found.\n';
  const lines: string[] = [`Found ${results.length} memory entries:`];
  for (const r of results) {
    lines.push(
      `  [${r.type.toUpperCase()}] ${r.id} (${r.domain}) - conf: ${(r.confidence * 100).toFixed(0)}%`,
    );
    lines.push(`    ${r.summary}`);
    lines.push(`    ${r.content}`);
    if (r.appliedCount > 0) {
      lines.push(`    applied: ${r.appliedCount}x, success: ${r.successCount}x`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function formatHelp(): string {
  return [
    'Usage: kit memory [query] [--domain <domain>] [--list] [--json]',
    '',
    'Search accumulated hierarchical engineering memories (episodic, semantic, procedural).',
    'Reads from .ai-kit/state/memory.json (produced by `kit evolve`).',
    '',
    'Options:',
    '  --domain <name> Filter by domain (e.g. architecture, tdd, security)',
    '  --list, -l      List all entries (ignores query argument)',
    '  --json          Output machine-readable memory entries',
    '  --help          Show this message',
    '',
  ].join('\n');
}
