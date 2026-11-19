// packages/cli/src/commands/feature.ts
//
// `kit feature <feature-id> [--dry-run] [--json]`.
// Executes the complete M7 incremental feature workflow end to end.

import path from 'node:path';
import { runFeatureWorkflow, type FeatureRunReport } from '@agentic-sdlc-kit/core';
import type { Command, CommandContext, CommandResult } from './types.js';

export const featureCommand: Command = {
  name: 'feature',
  summary:
    'Execute complete end-to-end incremental feature workflow (spec -> plan -> tdd -> verify).',
  async run(ctx: CommandContext): Promise<CommandResult> {
    if (ctx.argv.includes('--help') || ctx.argv.includes('-h')) {
      ctx.stdout(formatHelp());
      return { exitCode: 0 };
    }

    const featureId = ctx.argv.find((a) => !a.startsWith('-'));
    if (!featureId) {
      ctx.stderr('kit feature: error: missing required feature identifier (e.g. FEATURE-001)\n');
      return { exitCode: 1, message: 'Missing feature ID' };
    }

    const isJson = ctx.argv.includes('--json');
    const isDryRun = ctx.argv.includes('--dry-run');
    const targetRoot = path.resolve(ctx.cwd, '.');

    const res = await runFeatureWorkflow({ featureId, projectRoot: targetRoot, dryRun: isDryRun });
    if (!res.ok) {
      ctx.stderr(`kit feature: workflow error: ${res.error.message}\n`);
      return { exitCode: 1, message: res.error.message };
    }

    if (isJson) {
      ctx.stdout(JSON.stringify(res.value, null, 2) + '\n');
    } else {
      ctx.stdout(formatSummary(res.value));
    }

    return { exitCode: res.value.status === 'passed' ? 0 : 1 };
  },
};

function formatSummary(report: FeatureRunReport): string {
  const lines: string[] = [
    `Feature Workflow:  ${report.featureId} (${report.spec.title})`,
    `Status:            ${report.status.toUpperCase()}`,
    `Tasks Executed:    ${report.tasksExecuted.length} tasks (${report.tasksExecuted.join(', ')})`,
    `Verification:      ${report.verification.status.toUpperCase()} (${report.verification.checks.length} checks)`,
    `Total Duration:    ${report.durationMs}ms`,
  ];
  return lines.join('\n') + '\n';
}

function formatHelp(): string {
  return [
    'Usage: kit feature <feature-id> [--dry-run] [--json]',
    '',
    'Execute an incremental feature workflow through discovery, specification validation,',
    'plan DAG evaluation, TDD loop, and deterministic verification.',
    '',
    'Options:',
    '  --dry-run   Simulate execution without running active subprocesses',
    '  --json      Output machine-readable FeatureRunReport',
    '  --help      Show this message',
    '',
  ].join('\n');
}
