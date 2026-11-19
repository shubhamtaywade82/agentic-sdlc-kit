// packages/cli/src/commands/refactor.ts
//
// `kit refactor` — informational. The /kit:refactor workflow is driven
// by the /kit:refactor slash command in the host runtime.

import type { Command, CommandContext, CommandResult } from './types.js';

export const refactorCommand: Command = {
  name: 'refactor',
  summary: 'Show how to start a refactoring workflow (/kit:refactor).',
  run(ctx: CommandContext): CommandResult {
    const lines: string[] = [];
    lines.push('kit refactor — Refactoring workflow');
    lines.push('');
    lines.push('The /kit:refactor workflow is driven by your AI assistant.');
    lines.push('');
    lines.push('  /kit:refactor <target module and goal>');
    lines.push('');
    lines.push('Lifecycle (M9):');
    lines.push('  contract → discover-deps → characterization-tests →');
    lines.push('  target-structure → identify-patterns →');
    lines.push('  incremental-refactor → contract-validation →');
    lines.push('  regression-testing → quality-comparison → review');
    lines.push('');
    lines.push('Constraints:');
    lines.push('  - Preserve observable behavior unless behavior changes are');
    lines.push('    explicitly approved.');
    lines.push('  - Establish baseline tests before structural changes.');
    lines.push('  - Do not use a design pattern simply because it exists.');
    lines.push('  - Avoid broad renaming or formatting changes unrelated to the task.');
    ctx.stdout(lines.join('\n'));
    return { exitCode: 0 };
  },
};
