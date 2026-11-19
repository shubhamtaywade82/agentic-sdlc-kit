// packages/cli/src/commands/validate-plan.ts
//
// `kit validate-plan [path] [--json]`.
// Validates an implementation plan against schema, DAG acyclicity, and vertical slices.

import path from 'node:path';
import { loadPlan, type PlanValidationResult } from '@agentic-sdlc-kit/core';
import type { Command, CommandContext, CommandResult } from './types.js';

export const validatePlanCommand: Command = {
  name: 'validate-plan',
  summary: 'Validate an implementation plan against schema, DAG acyclicity, and task references.',
  async run(ctx: CommandContext): Promise<CommandResult> {
    if (ctx.argv.includes('--help') || ctx.argv.includes('-h')) {
      ctx.stdout(formatHelp());
      return { exitCode: 0 };
    }

    const isJson = ctx.argv.includes('--json');
    const targetArg = ctx.argv.find((a) => !a.startsWith('-'));
    const targetPath = path.resolve(ctx.cwd, targetArg ?? 'docs/plans');

    const res = await loadPlan(targetPath);
    if (!res.ok) {
      if (isJson) {
        ctx.stdout(JSON.stringify({ valid: false, error: res.error }, null, 2) + '\n');
      } else {
        ctx.stderr(`kit validate-plan: FAIL: ${res.error.message}\n`);
      }
      return { exitCode: 1, message: res.error.message };
    }

    if (isJson) {
      ctx.stdout(JSON.stringify({ valid: true, ...res.value }, null, 2) + '\n');
    } else {
      ctx.stdout(formatSuccessSummary(res.value));
    }
    return { exitCode: 0 };
  },
};

function formatSuccessSummary(val: PlanValidationResult): string {
  const { plan, analysis } = val;
  const highRisk = plan.tasks.filter((t) => t.risk === 'high').length;
  const lines: string[] = [
    `kit validate-plan: PASS`,
    `Feature:       ${plan.featureId}`,
    `Tasks:         ${plan.tasks.length} total (${highRisk} high risk)`,
    `Slices:        ${plan.verticalSlices.length} vertical slices`,
    `Execution DAG: ${analysis.executionOrder.join(' -> ')}`,
  ];
  return lines.join('\n') + '\n';
}

function formatHelp(): string {
  return [
    'Usage: kit validate-plan [path] [--json]',
    '',
    'Validate an implementation plan for schema compliance, task dependency integrity,',
    'and acyclic execution order.',
    '',
    'Options:',
    '  --json    Output machine-readable validation result',
    '  --help    Show this message',
    '',
  ].join('\n');
}
