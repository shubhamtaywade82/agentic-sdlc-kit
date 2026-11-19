// packages/cli/src/commands/optimize.ts
//
// `kit optimize` — informational. The /kit:optimize workflow is an
// optional M9 extension (post-M7 §3.3). Declared in 0.6.0; full state
// machine lands in a later release.

import type { Command, CommandContext, CommandResult } from './types.js';

export const optimizeCommand: Command = {
  name: 'optimize',
  summary: 'Show how to start a performance optimization workflow (/kit:optimize).',
  run(ctx: CommandContext): CommandResult {
    const lines: string[] = [];
    lines.push('kit optimize — Performance optimization workflow (M9 optional)');
    lines.push('');
    lines.push('Status: declared in 0.6.0; full workflow lands in a later release.');
    lines.push('');
    lines.push('Expected lifecycle:');
    lines.push('  define problem → establish baseline → profile bottleneck →');
    lines.push('  propose alternatives → define measurable targets →');
    lines.push('  implement one change at a time → benchmark → correctness +');
    lines.push('  regression tests');
    lines.push('');
    lines.push('INVARIANT: performance optimization requires baseline');
    lines.push('measurements. The kit will not propose an optimization');
    lines.push('without an established baseline.');
    ctx.stdout(lines.join('\n'));
    return { exitCode: 0 };
  },
};
