// packages/cli/src/commands/memory.ts
//
// `kit memory [query] [--domain <domain>] [--json]`.
// Inspects and queries hierarchical episodic, semantic, and procedural memories (M29).

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
    const domainIdx = ctx.argv.indexOf('--domain');
    const domain = domainIdx !== -1 ? ctx.argv[domainIdx + 1] : undefined;
    const query = ctx.argv.find((a) => !a.startsWith('-')) ?? '';

    const store = new MemoryStore();
    // Default baseline knowledge
    store.put({
      id: 'MEM-BASE-001',
      type: 'semantic',
      domain: 'architecture',
      summary: 'Modular Monorepo Invariant',
      content:
        'Contracts depends on nothing; Core depends only on Contracts; CLI depends on Core and Contracts.',
      confidence: 1.0,
      provenance: ['ARCHITECTURE.md'],
      appliedCount: 12,
      successCount: 12,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const results = store.search(query, domain);
    if (isJson) {
      ctx.stdout(JSON.stringify(results, null, 2) + '\n');
    } else {
      ctx.stdout(formatResults(results));
    }

    return { exitCode: 0 };
  },
};

function formatResults(results: ReturnType<MemoryStore['search']>): string {
  if (results.length === 0) return 'No matching engineering memories found.\n';
  const lines: string[] = [`Found ${results.length} memory entries:`];
  for (const r of results) {
    lines.push(
      `  [${r.type.toUpperCase()}] ${r.id} (${r.domain}) - conf: ${(r.confidence * 100).toFixed(0)}%`,
    );
    lines.push(`    ${r.summary}`);
    lines.push(`    ${r.content}`);
  }
  return lines.join('\n') + '\n';
}

function formatHelp(): string {
  return [
    'Usage: kit memory [query] [--domain <domain>] [--json]',
    '',
    'Search accumulated hierarchical engineering memories (episodic, semantic, procedural).',
    '',
    'Options:',
    '  --domain <name> Filter by domain (e.g. architecture, tdd, security)',
    '  --json          Output machine-readable memory entries',
    '  --help          Show this message',
    '',
  ].join('\n');
}
